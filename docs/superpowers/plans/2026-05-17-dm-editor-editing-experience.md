# DM Editor — Editing Experience (Workstream B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the confirmed data-loss bug (typed entity edits vanish on leaving Edit), then add a progressive Edit→DM→Player pane pipeline and scroll behaviour that keeps long-entry comparison usable.

**Architecture:** One in-memory draft (`useEntityEditDraft`, owned by `AtlasPlacementEditor`, persisted to the Part-2 session) is the single source for every pane. `EntityEditPanel` stops reloading from disk when a live draft for the same `sourcePath` already exists (the actual bug). The Edit/Reading toggle becomes the collapsed states of a progressive pane pipeline; the Player pane reuses the parity-locked `projectEntityForPlayer`; the DM pane reuses `EntityReadingView`'s existing DM render path. Scroll is persistent-DOM (no remount) plus a pure anchor-sync module with graceful degradation.

**Tech Stack:** React, TypeScript, Vitest + @testing-library/react, existing modules `useEntityEditDraft`, `projectEntityForPlayer`, `EntityReadingView`, `EntitySurface`, `canonicalEntitySave`.

**Spec:** `docs/superpowers/specs/2026-05-17-dm-editor-editing-and-map-ergonomics-design.md` (§3, §7, §8).

**Test/verify commands:**
- Single file: `npx vitest run <path>`
- Types: `npx tsc --noEmit`
- Lint: `npm run lint`
- Slice gate: `npm test -- --run` then `npm run lint` then `npm run atlas:publish` then **browser smoke** (managed preview via `.claude/launch.json`, open `/atlas/edit`).

**Pre-existing known-failing tests (do not fix, do not count as regressions):** `src/test/session/idbStore.test.ts`, `src/test/session/useEditorSession.test.tsx` (missing `fake-indexeddb`).

**Hard lesson carried from Sub-project B:** automated green ≠ working page. A React provider/placement bug passed tsc + full vitest + lint + atlas:publish and still blanked `/atlas/edit`. Every slice gate ends with a real browser smoke.

---

## File Structure

- `src/atlas/categories/EntityEditPanel.tsx` — modify: skip disk reload when a live draft for the same `sourcePath` exists; keep `rawRef` correct for frontmatter preservation.
- `src/atlas/editor/entityCloseIntent.ts` — create: pure decision `resolveEntityCloseIntent({ dirty })` (mirrors the existing `pinClickIntent.ts` pattern).
- `src/pages/AtlasPlacementEditor.tsx` — modify: the `onClose` passed to `EntitySurface` consults `resolveEntityCloseIntent`; add the discard confirm.
- `src/atlas/entity/EntitySurface.tsx` — modify (B-2): replace the binary Edit/Reading toggle with the progressive pane pipeline host.
- `src/atlas/entity/EntityPanes.tsx` — create (B-2): the pane-pipeline presentational component (which panes are open + render each).
- `src/atlas/entity/paneScrollSync.ts` — create (B-3): pure anchor-sync (no React).
- Tests: `src/test/categories/EntityEditPanel-noloss.test.tsx`, `src/test/editor/entityCloseIntent.test.ts`, `src/test/editor/entity-noloss-invariant.test.tsx`, `src/test/entity/EntityPanes.test.tsx`, `src/test/entity/paneScrollSync.test.ts`.

---

# SLICE B-1 — Single-source no-loss draft (fixes the data-loss bug FIRST)

### Task B1.1: `EntityEditPanel` reuses a live draft instead of reloading from disk

**Files:**
- Modify: `src/atlas/categories/EntityEditPanel.tsx` (the load `useEffect`, lines 25–58)
- Test: `src/test/categories/EntityEditPanel-noloss.test.tsx`

**Root cause (already diagnosed):** the load `useEffect` runs on every mount and calls `api.load(...)` with fresh disk content. `EntitySurface` unmounts `EntityEditPanel` whenever the user leaves Edit, so returning to Edit clobbers the in-memory draft. Fix: when `api.draft` already exists for this `sourcePath`, do **not** call `api.load`; only re-read the raw file into `rawRef` (needed to preserve untouched frontmatter on Save) and go straight to `ready`.

- [ ] **Step 1: Read the existing test harness**

Read `src/test/categories/EntityEditPanel.test.tsx` in full. Note exactly how it mocks `readSourceFile` (from `@/atlas/save/canonicalPlacementSave`), `hashContent` + `saveAtlasPatchToLocalFs` (from `@/atlas/save/localFsSave`), and how it renders `EntityEditPanel`. Reuse that exact mock style in the new test.

- [ ] **Step 2: Write the failing test**

```tsx
// src/test/categories/EntityEditPanel-noloss.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";

vi.mock("@/atlas/save/canonicalPlacementSave", () => ({
  readSourceFile: vi.fn(async () => "---\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\nDisk body v1\n"),
}));
vi.mock("@/atlas/save/localFsSave", () => ({
  hashContent: vi.fn(async () => "hash-v1"),
  saveAtlasPatchToLocalFs: vi.fn(async () => {}),
}));

describe("EntityEditPanel no-loss", () => {
  beforeEach(() => cleanup());

  it("does NOT reload from disk when a live draft for the same sourcePath exists", async () => {
    const { result } = renderHook(() => useEntityEditDraft());
    const api = result.current;

    // First mount: loads from disk.
    const view1 = render(
      <EntityEditPanel sourcePath="content/w/npcs/corven.md" draftApi={api} onClose={() => {}} onSaved={() => {}} />,
    );
    await waitFor(() => screen.getByDisplayValue("Disk body v1"));

    // User edits the body in memory.
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Unsaved edit XYZ" } });

    // Leaving Edit unmounts the panel (EntitySurface behaviour) — draft survives in `api`.
    view1.unmount();

    // Returning to Edit remounts the panel with the SAME sourcePath + draftApi.
    render(
      <EntityEditPanel sourcePath="content/w/npcs/corven.md" draftApi={api} onClose={() => {}} onSaved={() => {}} />,
    );

    // BUG TODAY: this shows "Disk body v1" (clobbered). FIXED: shows the unsaved edit.
    await waitFor(() => screen.getByDisplayValue("Unsaved edit XYZ"));
    expect(screen.queryByDisplayValue("Disk body v1")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/categories/EntityEditPanel-noloss.test.tsx`
Expected: FAIL — the remount shows "Disk body v1" (the draft was clobbered by `api.load`).

- [ ] **Step 4: Implement the guard**

In `src/atlas/categories/EntityEditPanel.tsx`, replace the body of the load `useEffect` (lines 25–58) so the disk read still refreshes `rawRef` but only calls `api.load` when there is no live draft for this `sourcePath`:

```tsx
  useEffect(() => {
    let alive = true;
    setPhase("loading");
    (async () => {
      try {
        const raw = await readSourceFile(sourcePath, fetch);
        if (!alive) return;
        rawRef.current = raw;
        // No-loss: if a live draft for THIS sourcePath already exists (the user
        // was editing, left Edit, and came back), keep it. Only seed the draft
        // from disk on a genuine first open. rawRef is still refreshed above so
        // Save preserves untouched frontmatter.
        const existing = api.snapshot();
        if (existing && existing.sourcePath === sourcePath) {
          setPhase("ready");
          return;
        }
        const fm = parseFrontmatter(raw);
        const atlas = ((fm.data.atlas as Record<string, unknown>) ?? {});
        const baseHash = await hashContent(raw);
        api.load({
          sourcePath,
          baseHash,
          fields: {
            id: String(atlas.id ?? ""),
            type: String(atlas.type ?? ""),
            visibility: String(atlas.visibility ?? "dm"),
            summary: String(atlas.summary ?? ""),
          },
          body: fm.content,
        });
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePath]);
```

(`api.snapshot()` already exists on `EntityEditDraftAPI` and returns the current draft or `null`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/categories/EntityEditPanel-noloss.test.tsx`
Expected: PASS.

- [ ] **Step 6: Regression — existing panel tests still green**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx`
Expected: PASS (load/edit/save + the "no embedded preview" case unchanged — first open still seeds from disk because no live draft exists yet).

- [ ] **Step 7: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/categories/EntityEditPanel.tsx src/test/categories/EntityEditPanel-noloss.test.tsx
git commit -m "fix(editor): EntityEditPanel reuses live draft instead of reloading from disk (no lost work)"
```

---

### Task B1.2: Discard confirm on closing a dirty entity

**Files:**
- Create: `src/atlas/editor/entityCloseIntent.ts`
- Modify: `src/pages/AtlasPlacementEditor.tsx` (the `onClose` passed to `EntitySurface` in `renderCategory`, ~line 1167)
- Test: `src/test/editor/entityCloseIntent.test.ts`

One forgiving confirm: closing the entity (the panel X / Close) while the draft is dirty asks "Discard changes? / Keep editing". No other navigation prompts. Mirrors the existing `src/atlas/editor/pinClickIntent.ts` pure-intent pattern.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/editor/entityCloseIntent.test.ts
import { describe, it, expect } from "vitest";
import { resolveEntityCloseIntent } from "@/atlas/editor/entityCloseIntent";

describe("resolveEntityCloseIntent", () => {
  it("closes immediately when not dirty", () => {
    expect(resolveEntityCloseIntent({ dirty: false })).toEqual({ kind: "close" });
  });
  it("asks to confirm discard when dirty", () => {
    expect(resolveEntityCloseIntent({ dirty: true })).toEqual({ kind: "confirm-discard" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/editor/entityCloseIntent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helper**

```ts
// src/atlas/editor/entityCloseIntent.ts
export type EntityCloseIntent =
  | { kind: "close" }
  | { kind: "confirm-discard" };

export function resolveEntityCloseIntent(args: { dirty: boolean }): EntityCloseIntent {
  return args.dirty ? { kind: "confirm-discard" } : { kind: "close" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/editor/entityCloseIntent.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the close path**

In `src/pages/AtlasPlacementEditor.tsx`, add the import near the other `@/atlas/editor` imports:

```tsx
import { resolveEntityCloseIntent } from "@/atlas/editor/entityCloseIntent";
```

Find the `renderCategory` block (~lines 1155–1180) where `EntitySurface` is rendered with `onClose={() => setEditingEntityId(null)}`. Replace that `onClose` prop with a guarded handler:

```tsx
onClose={() => {
  const intent = resolveEntityCloseIntent({ dirty: entityEditDraft.isDirty() });
  if (intent.kind === "confirm-discard") {
    // One forgiving confirm. Cancel = keep editing (no-op).
    if (!window.confirm("Discard your unsaved changes to this entity?")) return;
    entityEditDraft.clear();
  }
  setEditingEntityId(null);
}}
```

(`entityEditDraft` and `setEditingEntityId` are already in scope in that component.)

- [ ] **Step 6: Types + regression + commit**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/test/editor/entity-surface-reading-default.test.tsx` → still PASS.

```bash
git add src/atlas/editor/entityCloseIntent.ts src/test/editor/entityCloseIntent.test.ts src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(editor): one forgiving discard confirm when closing a dirty entity"
```

---

### Task B1.3: Permanent no-loss invariant test

**Files:**
- Test: `src/test/editor/entity-noloss-invariant.test.tsx`

A permanent CI gate encoding the rule: the draft survives leaving Edit / remount; only `clear()` (Save or confirmed Discard) empties it. This is the regression fence for the whole no-loss model.

- [ ] **Step 1: Write the invariant test**

```tsx
// src/test/editor/entity-noloss-invariant.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";

vi.mock("@/atlas/save/canonicalPlacementSave", () => ({
  readSourceFile: vi.fn(async () => "---\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\nOriginal disk body\n"),
}));
vi.mock("@/atlas/save/localFsSave", () => ({
  hashContent: vi.fn(async () => "h1"),
  saveAtlasPatchToLocalFs: vi.fn(async () => {}),
}));

describe("entity no-loss invariant (permanent gate)", () => {
  beforeEach(() => cleanup());

  it("draft survives unmount/remount; only clear() empties it", async () => {
    const { result } = renderHook(() => useEntityEditDraft());
    const api = result.current;

    const v1 = render(<EntityEditPanel sourcePath="p/a.md" draftApi={api} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => screen.getByDisplayValue("Original disk body"));
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "edited-1" } });
    expect(api.isDirty()).toBe(true);

    // Leave Edit (unmount) and come back (remount) several times.
    v1.unmount();
    const v2 = render(<EntityEditPanel sourcePath="p/a.md" draftApi={api} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => screen.getByDisplayValue("edited-1"));
    v2.unmount();
    render(<EntityEditPanel sourcePath="p/a.md" draftApi={api} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => screen.getByDisplayValue("edited-1"));
    expect(api.snapshot()?.body).toBe("edited-1");

    // Only an explicit clear() (Save success or confirmed Discard) empties it.
    api.clear();
    expect(api.snapshot()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/editor/entity-noloss-invariant.test.tsx`
Expected: PASS (B1.1 already made this true; this test is the permanent fence).

- [ ] **Step 3: Commit**

```bash
git add src/test/editor/entity-noloss-invariant.test.tsx
git commit -m "test(editor): permanent no-loss invariant gate for the entity edit draft"
```

---

### Task B1.4: Slice B-1 gate

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures.
- [ ] **Step 3:** `npm run lint` → no new errors beyond the pre-existing baseline.
- [ ] **Step 4:** `npm run atlas:publish` → secrets + derived scans clean.
- [ ] **Step 5: Browser smoke.** `npm run atlas:build`; start the managed preview (`.claude/launch.json`, `atlas-editor`); open `/atlas/edit`. Open an entity → Edit → type into the body → switch to Reading → switch back to Edit → **the typed text is still there**. Close the entity while dirty → the "Discard your unsaved changes?" confirm appears; Cancel keeps the text; OK discards and closes.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceB1): single-source no-loss draft gate green"`

---

# SLICE B-2 — Progressive pane pipeline

### Task B2.1: `EntityPanes` — the Edit→DM→Player pipeline component

**Files:**
- Create: `src/atlas/entity/EntityPanes.tsx`
- Test: `src/test/entity/EntityPanes.test.tsx`

A presentational component given the live draft entity + `entitiesById` + which panes are open. Renders 1–3 columns: **Edit** (slotted via a render prop so it stays bound to `EntityEditPanel`), **DM** (raw body rendered, secrets kept — same pipeline as `EntityReadingView`'s DM branch), **Player** (`projectEntityForPlayer` then rendered through `EntityPanel`). Panes are persistent DOM (hidden via CSS when collapsed, never unmounted) so scroll/state survive (foundation for B-3).

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/entity/EntityPanes.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import { EntityPanes } from "@/atlas/entity/EntityPanes";
import type { Entity } from "@/atlas/content/schema";

const corven = {
  id: "corven", title: "Corven", type: "npc", visibility: "dm",
  aliases: [], tags: [], images: [], body: "Public line.\n\n%%\nSECRET-XYZ\n%%\n",
  bodyHtml: "", frontmatter: {}, sourcePath: "p/c.md", links: [], backlinks: [],
} as Entity;

const renderPanes = (mode: "reading" | "editing") =>
  render(
    <MemoryRouter>
      <ViewModeProvider>
        <EntityPanes
          entity={corven}
          entitiesById={new Map([[corven.id, corven]])}
          mode={mode}
          renderEdit={() => <textarea data-testid="edit" defaultValue={corven.body} />}
        />
      </ViewModeProvider>
    </MemoryRouter>,
  );

describe("EntityPanes", () => {
  it("reading mode: DM pane visible by default (secret shown), Player pane appears after expand", () => {
    renderPanes("reading");
    expect(screen.getByText(/SECRET-XYZ/)).toBeInTheDocument();           // DM render keeps %%
    expect(screen.queryByTestId("entity-pane-player")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    const player = screen.getByTestId("entity-pane-player");
    expect(player).toBeInTheDocument();
    expect(player.textContent ?? "").not.toContain("SECRET-XYZ");          // player projection strips it
  });

  it("editing mode: Edit pane visible by default; DM then Player expand in order", () => {
    renderPanes("editing");
    expect(screen.getByTestId("edit")).toBeInTheDocument();
    expect(screen.queryByTestId("entity-pane-dm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add dm view|expand dm/i }));
    expect(screen.getByTestId("entity-pane-dm")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    expect(screen.getByTestId("entity-pane-player")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/entity/EntityPanes.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `EntityPanes`**

Read `src/atlas/entity/EntityReadingView.tsx` first to copy its exact DM-render pipeline (`tokenizeWikilinks` → `marked.parse` → `renderLinkTokens` → `sanitizeAtlasHtml`) and its Player path (`projectEntityForPlayer` + `buildProjectionContext` + `EntityPanel`). Then:

```tsx
// src/atlas/entity/EntityPanes.tsx
import { useMemo, useState } from "react";
import { marked } from "marked";
import type { Entity } from "@/atlas/content/schema";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

type Mode = "reading" | "editing";

export function EntityPanes({
  entity, entitiesById, mode, renderEdit,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  mode: Mode;
  renderEdit: () => React.ReactNode;
}) {
  // Which optional panes are open. In reading mode the base pane is DM; in
  // editing mode the base pane is Edit and DM is optional.
  const [showDm, setShowDm] = useState(mode === "reading");
  const [showPlayer, setShowPlayer] = useState(false);

  const dmHtml = useMemo(() => {
    const byName = new Map<string, string>();
    for (const e of entitiesById.values()) {
      byName.set(e.title.toLowerCase(), e.id);
      for (const a of e.aliases ?? []) byName.set(a.toLowerCase(), e.id);
    }
    const { tokenized, links } = tokenizeWikilinks(entity.body ?? "", {
      resolveByName: (n) => byName.get(n.trim().toLowerCase()),
    });
    const html = marked.parse(tokenized, { async: false }) as string;
    return sanitizeAtlasHtml(renderLinkTokens(html, links, {}));
  }, [entity, entitiesById]);

  const playerEntity = useMemo(
    () => projectEntityForPlayer(entity, buildProjectionContext(entitiesById)),
    [entity, entitiesById],
  );

  return (
    <div className="flex h-full w-full">
      {mode === "editing" && (
        <section data-testid="entity-pane-edit" className="flex-1 min-w-0 overflow-auto border-r">
          {renderEdit()}
        </section>
      )}

      <section
        data-testid="entity-pane-dm"
        className="flex-1 min-w-0 overflow-auto border-r"
        style={{ display: (mode === "reading" || showDm) ? undefined : "none" }}
      >
        <div className="prose prose-invert max-w-none p-3 text-sm"
             dangerouslySetInnerHTML={{ __html: dmHtml }} />
      </section>

      {showPlayer && (
        <section data-testid="entity-pane-player" className="flex-1 min-w-0 overflow-auto">
          <EntityPanel
            entity={playerEntity}
            placements={[]}
            entityById={entitiesById}
            onOpenEntity={() => {}}
            onClose={() => {}}
            onShowOnMap={() => {}}
            readerAffordances={false}
          />
        </section>
      )}

      <div className="flex flex-col gap-1 p-1 border-l bg-muted/30">
        {mode === "editing" && !showDm && (
          <button type="button" className="text-[10px] px-1 py-2 rounded border [writing-mode:vertical-rl]"
            onClick={() => setShowDm(true)}>＋ Add DM view</button>
        )}
        {!showPlayer && (
          <button type="button" className="text-[10px] px-1 py-2 rounded border [writing-mode:vertical-rl]"
            onClick={() => setShowPlayer(true)}>＋ Add Player view</button>
        )}
        {showPlayer && (
          <button type="button" className="text-[10px] px-1 py-2 rounded border [writing-mode:vertical-rl]"
            onClick={() => setShowPlayer(false)}>－ Player view</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/entity/EntityPanes.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/entity/EntityPanes.tsx src/test/entity/EntityPanes.test.tsx
git commit -m "feat(entity): EntityPanes — progressive Edit/DM/Player pane pipeline"
```

---

### Task B2.2: Mount `EntityPanes` in `EntitySurface` (replace the binary toggle)

**Files:**
- Modify: `src/atlas/entity/EntitySurface.tsx`
- Test: `src/test/editor/entity-surface-reading-default.test.tsx` (extend)

`EntitySurface` currently renders either `renderEdit()` or `EntityReadingView` based on a local `editing` boolean. Replace the body with `EntityPanes`, passing `mode` derived from `editing` and `renderEdit` through. Keep the existing chrome header (Edit / Back to reading) — it now flips `mode` rather than swapping whole subtrees, and the panes never unmount (scroll-safe foundation).

- [ ] **Step 1: Extend the test**

Add to `src/test/editor/entity-surface-reading-default.test.tsx`:

```tsx
it("surface hosts the pane pipeline: Edit toggles the Edit pane, panes persist", () => {
  render(
    <MemoryRouter>
      <ViewModeProvider>
        <EntitySurface
          entity={corven}
          entitiesById={new Map([[corven.id, corven]])}
          renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
          onClose={() => {}}
        />
      </ViewModeProvider>
    </MemoryRouter>,
  );
  // Reading default: DM pane present, no edit form.
  expect(screen.getByTestId("entity-pane-dm")).toBeInTheDocument();
  expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  expect(screen.getByTestId("edit-form")).toBeInTheDocument();
});
```

(`corven` fixture already exists in this file. Keep the existing X-close regression test from Group A passing.)

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/editor/entity-surface-reading-default.test.tsx`
Expected: FAIL — no `entity-pane-dm` yet.

- [ ] **Step 3: Implement**

Rewrite `src/atlas/entity/EntitySurface.tsx` body to host `EntityPanes` (keep the existing prop interface and chrome; keep `onClose` wired exactly as Group A left it so the X-close regression test stays green):

```tsx
import { useState } from "react";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { EntityPanes } from "@/atlas/entity/EntityPanes";

export function EntitySurface({
  entity, entitiesById, renderEdit, onClose,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  renderEdit: () => React.ReactNode;
  onClose: () => void;
  placements?: MapPlacement[];
  onOpenEntity?: (id: string) => void;
  onShowOnMap?: (p: MapPlacement) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs">
        <span className="font-medium truncate flex-1">{entity.title}</span>
        <button type="button" className="h-7 px-2 rounded border"
          onClick={() => setEditing((v) => !v)}>
          {editing ? "Back to reading" : "Edit"}
        </button>
        <button type="button" aria-label="Close panel" className="h-7 px-2 rounded border"
          onClick={onClose}>✕</button>
      </div>
      <div className="flex-1 overflow-hidden">
        <EntityPanes
          entity={entity}
          entitiesById={entitiesById}
          mode={editing ? "editing" : "reading"}
          renderEdit={renderEdit}
        />
      </div>
    </div>
  );
}
```

(Note: the Group A regression test expects a `Close panel`-labelled control and no separate text "Close" button — this preserves both. Confirm `src/test/editor/entity-surface-reading-default.test.tsx`'s Group A case still passes in Step 4.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/test/editor/entity-surface-reading-default.test.tsx src/test/entity/EntityPanes.test.tsx`
Expected: PASS (incl. the Group A X-close regression).

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/entity/EntitySurface.tsx src/test/editor/entity-surface-reading-default.test.tsx
git commit -m "feat(entity): EntitySurface hosts the progressive pane pipeline (panes persist, no unmount)"
```

---

### Task B2.3: Slice B-2 gate

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke.** `/atlas/edit`: open an entity → DM pane shows (secrets visible). Click "＋ Add Player view" → a second column renders the player-faithful bio (secret gone). Click Edit → an Edit column appears beside DM; type → DM/Player update live. Collapse Player → column closes, others keep their content.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceB2): progressive pane pipeline gate green"`

---

# SLICE B-3 — Scroll: persistent-DOM floor + anchor-sync

### Task B3.1: Pure anchor-sync module

**Files:**
- Create: `src/atlas/entity/paneScrollSync.ts`
- Test: `src/test/entity/paneScrollSync.test.ts`

Pure functions, no React/DOM. `buildAnchors(text)` extracts ordered structural anchors (markdown headings; fallback paragraph indices). `mapScroll({ from, to, fromAnchorId })` returns the target anchor id in `to` for a given anchor id in `from`: the same id if shared, else the nearest preceding shared anchor ("park"), else `null` (degrade → caller leaves the follower alone).

- [ ] **Step 1: Write the failing test**

```ts
// src/test/entity/paneScrollSync.test.ts
import { describe, it, expect } from "vitest";
import { buildAnchors, mapScroll } from "@/atlas/entity/paneScrollSync";

describe("paneScrollSync", () => {
  it("extracts heading anchors in order", () => {
    const a = buildAnchors("# Intro\ntext\n## Secret stuff\nx\n## Aftermath\n");
    expect(a.map((x) => x.id)).toEqual(["intro", "secret-stuff", "aftermath"]);
  });

  it("maps a shared anchor to the same anchor", () => {
    const dm = buildAnchors("# Intro\n## Secret\n## Aftermath\n");
    const player = buildAnchors("# Intro\n## Aftermath\n"); // Secret stripped
    expect(mapScroll({ from: dm, to: player, fromAnchorId: "intro" })).toBe("intro");
    expect(mapScroll({ from: dm, to: player, fromAnchorId: "aftermath" })).toBe("aftermath");
  });

  it("parks at the nearest preceding shared anchor for a section absent in the target", () => {
    const dm = buildAnchors("# Intro\n## Secret\n## Aftermath\n");
    const player = buildAnchors("# Intro\n## Aftermath\n");
    // Scrolling DM into "Secret" (absent from player) → player parks at "intro".
    expect(mapScroll({ from: dm, to: player, fromAnchorId: "secret" })).toBe("intro");
  });

  it("returns null when there is no shared anchor at or before (degrade)", () => {
    const a = buildAnchors("## OnlyA\n");
    const b = buildAnchors("## OnlyB\n");
    expect(mapScroll({ from: a, to: b, fromAnchorId: "onlya" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/entity/paneScrollSync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/atlas/entity/paneScrollSync.ts
export interface Anchor { id: string; line: number; }

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Ordered structural anchors: markdown ATX headings. id is the slugged text. */
export function buildAnchors(text: string): Anchor[] {
  const out: Anchor[] = [];
  const lines = (text ?? "").split("\n");
  const seen = new Map<string, number>();
  lines.forEach((ln, i) => {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(ln);
    if (!m) return;
    let id = slug(m[1]) || `h-${i}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    out.push({ id, line: i });
  });
  return out;
}

/**
 * Given the anchor at the top of `from`, find which anchor `to` should align
 * to: same id if shared; else the nearest preceding shared anchor (park);
 * else null (no basis — caller leaves the follower's scroll untouched).
 */
export function mapScroll(args: {
  from: Anchor[];
  to: Anchor[];
  fromAnchorId: string;
}): string | null {
  const toIds = new Set(args.to.map((a) => a.id));
  if (toIds.has(args.fromAnchorId)) return args.fromAnchorId;
  const idx = args.from.findIndex((a) => a.id === args.fromAnchorId);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (toIds.has(args.from[i].id)) return args.from[i].id;
  }
  return null;
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx vitest run src/test/entity/paneScrollSync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/entity/paneScrollSync.ts src/test/entity/paneScrollSync.test.ts
git commit -m "feat(entity): pure anchor-sync module for pane scroll alignment"
```

---

### Task B3.2: Wire anchor-sync into `EntityPanes` with degradation

**Files:**
- Modify: `src/atlas/entity/EntityPanes.tsx`
- Test: `src/test/entity/EntityPanes.test.tsx` (extend)

Each pane scroll container gets a ref and a `data-anchor-line` set on rendered headings. On a pane `scroll`, compute its topmost visible heading line, map to the other panes via `mapScroll`, and set their `scrollTop` to the matched heading's offset. If `mapScroll` returns `null`, leave that follower alone (degrade — never wrong-jump). The persistent-DOM floor (panes never unmount, retain their own `scrollTop`) is already true from B-2 and is the guarantee even if sync is off.

- [ ] **Step 1: Extend the test (floor guarantee)**

Add to `src/test/entity/EntityPanes.test.tsx`:

```tsx
it("floor: a pane keeps its own scrollTop across collapse/expand of another pane", () => {
  renderPanes("reading");
  fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
  const dm = screen.getByTestId("entity-pane-dm");
  Object.defineProperty(dm, "scrollHeight", { value: 1000, configurable: true });
  dm.scrollTop = 240;
  // Collapse the player pane — DM must NOT reset to 0 (no unmount).
  fireEvent.click(screen.getByRole("button", { name: /－ player view|remove player/i }));
  expect(dm.scrollTop).toBe(240);
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx vitest run src/test/entity/EntityPanes.test.tsx`
Expected: FAIL — collapsing currently conditionally renders the player pane (`{showPlayer && …}`), which is fine, but assert DM persistence; if it fails, the panes are unmounting. (If it already passes because B-2 used `display:none` for DM only, change the player pane in B-2 to the same persistent `display` pattern in Step 3.)

- [ ] **Step 3: Make all panes persistent + add anchor-sync**

In `src/atlas/entity/EntityPanes.tsx`:

1. Render the Player pane persistently (mirror the DM pane: always mounted, `style={{ display: showPlayer ? undefined : "none" }}`), so collapsing never unmounts it.
2. Add refs to the Edit/DM/Player scroll `<section>`s. Render the DM HTML with heading offsets discoverable by querying `h1..h6` inside the pane. Add an `onScroll` to each visible pane:

```tsx
import { buildAnchors, mapScroll, type Anchor } from "@/atlas/entity/paneScrollSync";
// ...
const dmRef = useRef<HTMLElement>(null);
const playerRef = useRef<HTMLElement>(null);
const editRef = useRef<HTMLElement>(null);
const syncing = useRef(false);

const anchorsFor = (text: string) => buildAnchors(text);

const topHeadingId = (el: HTMLElement | null): string | null => {
  if (!el) return null;
  const hs = Array.from(el.querySelectorAll("[data-anchor-id]")) as HTMLElement[];
  let best: string | null = null;
  for (const h of hs) {
    if (h.offsetTop - el.scrollTop <= 4) best = h.dataset.anchorId ?? best;
    else break;
  }
  return best;
};

const scrollToAnchor = (el: HTMLElement | null, id: string | null) => {
  if (!el || !id) return;
  const h = el.querySelector(`[data-anchor-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  if (h) el.scrollTop = h.offsetTop;
};

const onPaneScroll = (which: "edit" | "dm" | "player") => {
  if (syncing.current) return;
  const map: Record<string, { ref: React.RefObject<HTMLElement>; text: string }> = {
    edit: { ref: editRef, text: entity.body ?? "" },
    dm: { ref: dmRef, text: entity.body ?? "" },
    player: { ref: playerRef, text: playerEntity.body ?? "" },
  };
  const src = map[which];
  const fromId = topHeadingId(src.ref.current);
  if (!fromId) return;
  const fromAnchors = anchorsFor(src.text);
  syncing.current = true;
  try {
    for (const key of ["edit", "dm", "player"] as const) {
      if (key === which) continue;
      const tgt = map[key];
      if (!tgt.ref.current) continue;
      const id = mapScroll({ from: fromAnchors, to: anchorsFor(tgt.text), fromAnchorId: fromId });
      if (id) scrollToAnchor(tgt.ref.current, id); // null → degrade: leave it
    }
  } finally {
    requestAnimationFrame(() => { syncing.current = false; });
  }
};
```

3. The DM pane renders sanitized HTML; headings won't have `data-anchor-id`. Post-process `dmHtml` to tag headings, or set them after render. Simplest deterministic approach — tag headings in the HTML string before injecting:

```tsx
const tagHeadings = (html: string, anchors: Anchor[]): string => {
  let i = 0;
  return html.replace(/<(h[1-6])>/g, (full, tag) => {
    const a = anchors[i++];
    return a ? `<${tag} data-anchor-id="${a.id}">` : full;
  });
};
// dm pane: dangerouslySetInnerHTML={{ __html: tagHeadings(dmHtml, anchorsFor(entity.body ?? "")) }}
```

Attach `ref={dmRef}` + `onScroll={() => onPaneScroll("dm")}` to the DM `<section>`, `ref={playerRef}` + `onScroll={() => onPaneScroll("player")}` to the Player `<section>` (and tag headings inside `EntityPanel`'s rendered body the same way is out of scope — Player-side anchors come from `playerEntity.body`; if `EntityPanel` doesn't expose heading offsets, the Player follower simply degrades, which is acceptable per spec). For the Edit pane, the slotted textarea has no headings; treat Edit as a scroll *source* only by line ratio is out of scope — Edit participates as a follower via its own scroll container retaining position (the floor). Keep wiring minimal: sync DM↔Player; Edit relies on the floor.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/test/entity/EntityPanes.test.tsx src/test/entity/paneScrollSync.test.ts`
Expected: PASS (floor test + sync module + earlier B-2 cases).

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/entity/EntityPanes.tsx src/test/entity/EntityPanes.test.tsx
git commit -m "feat(entity): anchor-sync DM/Player panes with persistent-DOM floor + graceful degradation"
```

---

### Task B3.3: Slice B-3 gate (Workstream B complete)

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke.** `/atlas/edit`: open a long entity; DM + Player panes open; scroll the DM pane through a `%%dm%%`-only section → the Player pane parks at the last shared heading and re-aligns at the next shared heading (never jumps to top). Flip the global lens → no scroll reset. Edit a line → live update, scroll positions retained.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceB3): scroll anchor-sync + floor gate green — Workstream B complete"`

---

## Self-Review

**Spec coverage (§3, §7, §8 B-slices):**
- §3.1 single-source no-loss draft → B1.1 (the exact bug fix) + B1.3 invariant. ✓
- §3.3 no-loss model (Save writes, Discard/confirm clears, navigation preserves) → B1.1 + B1.2 (confirm) + B1.3. ✓
- §3.2 progressive pane pipeline (Edit→DM→Player, progressive expand, replaces toggle, panes persist) → B2.1 + B2.2. ✓
- §3.4 scroll floor + anchor-sync target + degradation → B3.1 (pure) + B3.2 (wiring + floor). ✓
- §7 mandatory browser smoke each gate → B1.4/B2.3/B3.3 Step 5. ✓ Permanent no-loss invariant test → B1.3. ✓
- §8 slice order B-1 → B-2 → B-3 (B-1 first to stop active loss) → reflected. ✓

**Placeholder scan:** every code step has complete code; the one bounded judgement (Player-pane heading anchors via `EntityPanel`) is explicitly specified to *degrade* (acceptable per spec §3.4), not left as a TODO.

**Type consistency:** `resolveEntityCloseIntent({dirty}) → {kind:"close"|"confirm-discard"}` consistent B1.2. `EntityPanes` props (`entity`, `entitiesById`, `mode:"reading"|"editing"`, `renderEdit`) consistent B2.1↔B2.2↔B3.2. `buildAnchors`/`mapScroll`/`Anchor` consistent B3.1↔B3.2. `api.snapshot()/isDirty()/clear()` match the real `EntityEditDraftAPI`.
