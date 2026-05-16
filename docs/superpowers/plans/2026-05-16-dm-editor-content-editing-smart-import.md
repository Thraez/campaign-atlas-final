# DM Editor — Content Editing & Smart Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make imported vault notes land with correct `atlas.id/type/visibility`, make any entity (incl. Lore/untyped) editable in-app with a faithful rendered preview, all inside the existing Part 1–3 rail/panel shell.

**Architecture:** Three independently-shippable slices over existing infra. One shared module emits all frontmatter (used by import + edit-save). Slice 1 fixes import persistence; Slice 2 adds a real edit panel wired into the Part 2 no-loss session; Slice 3 adds an Obsidian-faithful preview reusing the build's `marked` + `sanitizeAtlasHtml` + the shared DM-block stripper.

**Tech Stack:** TypeScript, React, Vitest, `js-yaml` (via `src/atlas/import/frontmatter.ts`), `marked` v18, existing `/__atlas/read` + `/__atlas/save` dev endpoints, Part 2 `useEditorSession`.

**Spec:** `docs/superpowers/specs/2026-05-16-dm-editor-content-editing-smart-import-design.md`

**Test/verify commands (used throughout):**
- Single test file: `npx vitest run <path> -t "<name>"`
- Types: `npx tsc --noEmit`
- Lint: `npm run lint`
- Full gate (end of each slice): `npm test -- --run` then `npm run lint` then `npm run atlas:publish`

Pre-existing known-failing tests unrelated to this work: `src/test/session/idbStore.test.ts` and `src/test/session/useEditorSession.test.tsx` fail due to a missing `fake-indexeddb` dev dependency. Treat these two as pre-existing; do not block slice gates on them, but do not introduce *new* failures.

---

## File Structure

**Slice 1 — Smart import that persists atlas fields**
- Create `src/atlas/import/inferTypeFromTags.ts` — pure tag-keyword → entity-type map.
- Create `src/atlas/content/frontmatterRewrite.ts` — the single shared frontmatter emitter (§A).
- Modify `src/atlas/import/stagingState.ts` — type precedence + new resolved fields on `StagingRow`.
- Modify `src/atlas/import/buildImportChanges.ts` — write rewritten frontmatter, not verbatim.
- Modify `src/atlas/import/ImportStagingModal.tsx` — show resolved id/visibility, flag unconfirmed type.
- Tests: `src/test/import/inferTypeFromTags.test.ts`, `src/test/content/frontmatterRewrite.test.ts`, extend `src/test/import-staging-state.test.ts`, `src/test/build-import-changes.test.ts`, `src/test/import-staging-modal.test.tsx`.

**Slice 2 — Real edit panel + Part 2 no-loss**
- Create `src/atlas/categories/useEntityEditDraft.ts` — dirty-draft holder with `snapshot()/applySnapshot()`.
- Create `src/atlas/categories/EntityEditPanel.tsx` — load/edit/save panel for any entity.
- Modify `src/atlas/session/sessionSnapshot.ts` — add backward-compatible `entityEdit` global slice.
- Modify `src/atlas/session/useEditorSession.ts` — add `editorEntity` holder + count.
- Modify `src/pages/AtlasPlacementEditor.tsx` — wire row-click open, host the panel, holder, Ctrl-K.
- Tests: `src/test/categories/EntityEditPanel.test.tsx`, extend `src/test/session/no-loss-invariant.test.ts`, `src/test/session/sessionSnapshot.test.ts`.

**Slice 3 — Obsidian-faithful preview**
- Create `src/atlas/content/stripDmBlocks.ts` — move the stripper here (browser-safe single source).
- Modify `scripts/atlas/stripDmBlocks.ts` — re-export from the new module (back-compat for the build).
- Create `src/atlas/content/renderEntityMarkdown.ts` — preview renderer mirroring the build.
- Create `src/atlas/categories/EntityBodyPreview.tsx` — preview pane + "Show DM notes" toggle.
- Modify `src/atlas/categories/EntityEditPanel.tsx` — split editor+preview, add focus mode.
- Tests: `src/test/content/stripDmBlocks-parity.test.ts`, `src/test/content/renderEntityMarkdown.test.ts`, extend `src/test/categories/EntityEditPanel.test.tsx`.

---

# SLICE 1 — Smart Import That Persists Atlas Fields

### Task 1.1: Tag-keyword → type map

**Files:**
- Create: `src/atlas/import/inferTypeFromTags.ts`
- Test: `src/test/import/inferTypeFromTags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/import/inferTypeFromTags.test.ts
import { describe, it, expect } from "vitest";
import { inferTypeFromTags } from "@/atlas/import/inferTypeFromTags";

describe("inferTypeFromTags", () => {
  it("maps npc-ish tags to npc (first recognised tag wins)", () => {
    expect(inferTypeFromTags(["npc", "smuggler", "legend"])).toBe("npc");
    expect(inferTypeFromTags(["character"])).toBe("npc");
    expect(inferTypeFromTags(["person"])).toBe("npc");
  });
  it("maps faction / item / event keywords", () => {
    expect(inferTypeFromTags(["guild"])).toBe("faction");
    expect(inferTypeFromTags(["artifact"])).toBe("item");
    expect(inferTypeFromTags(["event"])).toBe("event");
  });
  it("maps place keywords to the matching place type", () => {
    expect(inferTypeFromTags(["ruin"])).toBe("ruin");
    expect(inferTypeFromTags(["city"])).toBe("city");
    expect(inferTypeFromTags(["landmark"])).toBe("location");
  });
  it("returns null when no tag is recognised or input is not a string array", () => {
    expect(inferTypeFromTags(["mysterious", "stub"])).toBeNull();
    expect(inferTypeFromTags(undefined)).toBeNull();
    expect(inferTypeFromTags("npc")).toBeNull();
    expect(inferTypeFromTags([1, 2])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/inferTypeFromTags.test.ts`
Expected: FAIL — cannot find module `@/atlas/import/inferTypeFromTags`.

- [ ] **Step 3: Write the implementation**

```ts
// src/atlas/import/inferTypeFromTags.ts
/**
 * Tag-keyword → entity-type inference. The DM's Obsidian notes carry their
 * own taxonomy in `tags:` (e.g. `tags: [npc, smuggler]`). When `atlas.type`
 * is absent this is the strongest signal — stronger than folder, because the
 * DM wrote it deliberately. First recognised tag in array order wins.
 *
 * Returns null when nothing is recognised (caller falls back to folder → lore).
 */
const TAG_TYPE_MAP: Record<string, string> = {
  npc: "npc", character: "npc", person: "npc",
  faction: "faction", guild: "faction", organization: "faction", organisation: "faction",
  item: "item", artifact: "item", weapon: "item", armor: "item", armour: "item",
  event: "event",
  settlement: "settlement", city: "city", town: "town", village: "village",
  capital: "capital", port: "port", region: "region", ruin: "ruin",
  dungeon: "dungeon", cave: "cave", temple: "temple", shop: "shop",
  hazard: "hazard", landmark: "location", location: "location",
  lore: "lore",
};

export function inferTypeFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const hit = TAG_TYPE_MAP[t.trim().toLowerCase()];
    if (hit) return hit;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/inferTypeFromTags.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/inferTypeFromTags.ts src/test/import/inferTypeFromTags.test.ts
git commit -m "feat(import): tag-keyword → entity-type inference"
```

---

### Task 1.2: Shared frontmatter rewrite module (§A)

**Files:**
- Create: `src/atlas/content/frontmatterRewrite.ts`
- Test: `src/test/content/frontmatterRewrite.test.ts`

This is the single emitter both import (1.3) and edit-save (Slice 2) use. It builds on the existing `parseFrontmatter` / `stringifyFrontmatter` in `src/atlas/import/frontmatter.ts` (signatures: `parseFrontmatter(raw): { data: Record<string,unknown>; content: string }`, `stringifyFrontmatter(content: string, data: Record<string,unknown>): string`).

- [ ] **Step 1: Write the failing test**

```ts
// src/test/content/frontmatterRewrite.test.ts
import { describe, it, expect } from "vitest";
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

const CORVEN = `---
role: Story
tags:
  - npc
  - smuggler
atlas:
  placements:
    - mapId: m1
      x: 1
      "y": 2
---

# Corven

Body stays exactly here.
`;

describe("rewriteFrontmatter", () => {
  it("injects atlas id/type/visibility, preserves placements, body and root fields", () => {
    const out = rewriteFrontmatter(CORVEN, {
      id: "corven", type: "npc", visibility: "dm", tagsAdd: ["npc"],
    });
    const fm = parseFrontmatter(out);
    const atlas = fm.data.atlas as Record<string, unknown>;
    expect(atlas.id).toBe("corven");
    expect(atlas.type).toBe("npc");
    expect(atlas.visibility).toBe("dm");
    expect((atlas.placements as unknown[]).length).toBe(1); // preserved
    expect(fm.data.role).toBe("Story");                      // root field preserved
    expect(fm.content).toContain("# Corven");
    expect(fm.content).toContain("Body stays exactly here.");
  });
  it("dedupes tagsAdd against existing tags, order-stable", () => {
    const out = rewriteFrontmatter(CORVEN, { type: "npc", tagsAdd: ["npc", "legend"] });
    const fm = parseFrontmatter(out);
    expect(fm.data.tags).toEqual(["npc", "smuggler", "legend"]);
  });
  it("empty patch is a lossless round-trip through parseFrontmatter", () => {
    const out = rewriteFrontmatter(CORVEN, {});
    const a = parseFrontmatter(out);
    const b = parseFrontmatter(CORVEN);
    expect(a.data).toEqual(b.data);
    expect(a.content).toEqual(b.content);
  });
  it("creates an atlas block when the file has none", () => {
    const raw = `---\ntitle: Lone Note\n---\n\nbody\n`;
    const out = rewriteFrontmatter(raw, { id: "lone-note", type: "lore", visibility: "dm" });
    const atlas = parseFrontmatter(out).data.atlas as Record<string, unknown>;
    expect(atlas).toEqual({ id: "lone-note", type: "lore", visibility: "dm" });
  });
  it("creates frontmatter when the file has none at all", () => {
    const out = rewriteFrontmatter(`# Bare\n\ntext\n`, { id: "bare", type: "lore" });
    const fm = parseFrontmatter(out);
    expect((fm.data.atlas as Record<string, unknown>).id).toBe("bare");
    expect(fm.content).toContain("# Bare");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/content/frontmatterRewrite.test.ts`
Expected: FAIL — cannot find module `@/atlas/content/frontmatterRewrite`.

- [ ] **Step 3: Write the implementation**

```ts
// src/atlas/content/frontmatterRewrite.ts
/**
 * THE single frontmatter emitter. Import (buildImportChanges) and edit-save
 * (EntityEditPanel) both go through this so the two paths cannot drift and
 * the Obsidian-Properties-safe YAML contract is enforced in exactly one place
 * (stringifyFrontmatter already emits quoted, no-multiline-scalar YAML).
 *
 * Only the `atlas:` block and (optionally) the root `tags:` array are touched.
 * Every other root field and the entire body are preserved byte-for-byte
 * modulo YAML re-emission, which itself round-trips through parseFrontmatter.
 */
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";

export interface AtlasFieldPatch {
  id?: string;
  /** Granular entity type (the "kind" the create form shows). One field. */
  type?: string;
  visibility?: string;
  summary?: string;
  /** Appended to the root `tags:` array, deduped, order-stable. */
  tagsAdd?: string[];
}

function normaliseTags(existing: unknown): string[] {
  if (Array.isArray(existing)) return existing.filter((t): t is string => typeof t === "string");
  if (typeof existing === "string" && existing.trim()) return [existing.trim()];
  return [];
}

export function rewriteFrontmatter(rawFile: string, patch: AtlasFieldPatch): string {
  const { data, content } = parseFrontmatter(rawFile);

  const atlas: Record<string, unknown> = {
    ...((data.atlas as Record<string, unknown>) ?? {}),
  };
  if (patch.id !== undefined) atlas.id = patch.id;
  if (patch.type !== undefined) atlas.type = patch.type;
  if (patch.visibility !== undefined) atlas.visibility = patch.visibility;
  if (patch.summary !== undefined) atlas.summary = patch.summary;

  const next: Record<string, unknown> = { ...data, atlas };

  if (patch.tagsAdd && patch.tagsAdd.length > 0) {
    const tags = normaliseTags(data.tags);
    for (const t of patch.tagsAdd) {
      if (typeof t === "string" && t && !tags.includes(t)) tags.push(t);
    }
    next.tags = tags;
  }

  return stringifyFrontmatter(content, next);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/content/frontmatterRewrite.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/frontmatterRewrite.ts src/test/content/frontmatterRewrite.test.ts
git commit -m "feat(content): shared Obsidian-safe frontmatter rewrite module"
```

---

### Task 1.3: Type precedence + resolved fields in staging

**Files:**
- Modify: `src/atlas/import/stagingState.ts` (`extractStagingFields` ~121-146, `StagingRow` ~88-110, `buildStagingRow` ~154-196)
- Test: `src/test/import-staging-state.test.ts` (extend existing)

`buildStagingRow` is called with `RawImportFile { filename, raw }` and a `StagingContext`. The current code derives `type = atlas.type || "imports"` and `content: input.raw`. We add precedence (explicit `atlas.type` → tags → folder → `lore`), keep `inferredType` as the *resolved* type (folder routing + the modal dropdown already key on it), and add `typeWasExplicit`, `resolvedId`, `resolvedVisibility`, `rawContent`.

- [ ] **Step 1: Write the failing test (append to the existing describe)**

```ts
// add to src/test/import-staging-state.test.ts
import { buildStagingRow } from "@/atlas/import/stagingState";

const ctx = {
  worldId: "w",
  importConfig: { folders: { npc: "npcs" }, defaultFolder: "imports" },
  allowedFolders: new Set(["npcs", "imports"]),
  existingById: new Map<string, string>(),
  existingPaths: new Set<string>(),
} as const;

describe("staging type precedence + resolved fields", () => {
  it("infers npc from tags when atlas.type is absent and flags unconfirmed", () => {
    const raw = `---\ntags:\n  - npc\n  - smuggler\n---\n# Corven\n`;
    const row = buildStagingRow({ filename: "corven.md", raw }, ctx as never);
    expect(row.inferredType).toBe("npc");
    expect(row.typeWasExplicit).toBe(false);
    expect(row.resolvedId).toBe("corven");
    expect(row.resolvedVisibility).toBe("dm");
    expect(row.rawContent).toBe(raw);
  });
  it("explicit atlas.type wins and is marked explicit", () => {
    const raw = `---\natlas:\n  type: faction\n  visibility: player\ntags:\n  - npc\n---\n# X\n`;
    const row = buildStagingRow({ filename: "x.md", raw }, ctx as never);
    expect(row.inferredType).toBe("faction");
    expect(row.typeWasExplicit).toBe(true);
    expect(row.resolvedVisibility).toBe("player");
  });
  it("no signal → lore, unconfirmed", () => {
    const raw = `---\ntags:\n  - stub\n---\n# Y\n`;
    const row = buildStagingRow({ filename: "y.md", raw }, ctx as never);
    expect(row.inferredType).toBe("lore");
    expect(row.typeWasExplicit).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import-staging-state.test.ts -t "staging type precedence"`
Expected: FAIL — `typeWasExplicit` / `resolvedId` / `resolvedVisibility` / `rawContent` undefined.

- [ ] **Step 3: Implement**

In `src/atlas/import/stagingState.ts` add imports at the top (after the existing imports):

```ts
import { inferTypeFromTags } from "./inferTypeFromTags";
import { inferTypeFromPath } from "./inferType";
```

Replace `extractStagingFields` (currently returns `{ type, id, fmTitle, frontmatterPath, parseError }`) with a version that applies precedence and surfaces visibility + explicitness. Replace the whole function body:

```ts
function extractStagingFields(raw: string, relPath: string): {
  type: string;
  typeWasExplicit: boolean;
  id: string | undefined;
  visibility: string;
  fmTitle: string | undefined;
  frontmatterPath: string | undefined;
  parseError: string | undefined;
} {
  try {
    const fm = parseFrontmatter(raw);
    const data = fm.data;
    const atlas = (data.atlas ?? {}) as Record<string, unknown>;

    const explicit =
      typeof atlas.type === "string" && atlas.type.trim().length > 0
        ? atlas.type.trim()
        : undefined;
    const fromTags = explicit ? null : inferTypeFromTags(data.tags);
    const fromFolder = explicit || fromTags ? null : inferTypeFromPath(relPath);
    const type = explicit ?? fromTags ?? (fromFolder && fromFolder !== "note" ? fromFolder : "lore");

    const visRaw = typeof atlas.visibility === "string" ? atlas.visibility : undefined;
    const validVis = ["player", "dm", "hidden", "rumor"];
    const visibility = visRaw && validVis.includes(visRaw)
      ? visRaw
      : atlas.publish === true ? "player" : "dm";

    const id = typeof atlas.id === "string" ? atlas.id : undefined;
    const fmTitle = typeof data.title === "string" ? data.title : undefined;
    const frontmatterPath = typeof data.path === "string" ? data.path : undefined;
    return {
      type, typeWasExplicit: !!explicit, id, visibility,
      fmTitle, frontmatterPath, parseError: undefined,
    };
  } catch (e) {
    return {
      type: "lore", typeWasExplicit: false, id: undefined, visibility: "dm",
      fmTitle: undefined, frontmatterPath: undefined,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
}
```

Add four fields to the `StagingRow` interface (after `content: string;`):

```ts
  /** Resolved entity type was explicit in atlas.type (vs inferred). */
  typeWasExplicit: boolean;
  /** Resolved id (atlas.id or filename slug) — written into atlas on commit. */
  resolvedId: string;
  /** Resolved visibility (valid atlas.visibility, publish:true, or safe dm). */
  resolvedVisibility: string;
  /** Original file text, verbatim — rewriteFrontmatter operates on this. */
  rawContent: string;
```

In `buildStagingRow`, change the destructure and the relPath passed to `extractStagingFields`, and populate the new fields. Replace the first lines of `buildStagingRow` up to the `return`:

```ts
export function buildStagingRow(input: RawImportFile, ctx: StagingContext): StagingRow {
  const relPathForInfer = input.filename; // staging only has the filename; folder hint = filename has none → tags/explicit drive it
  const { type, typeWasExplicit, id, visibility, fmTitle, frontmatterPath, parseError } =
    extractStagingFields(input.raw, relPathForInfer);

  const title = deriveTitle(input.filename, fmTitle);
  const resolvedId = id ?? slugify(title);
  const stem = resolvedId;
```

Then in the returned object, keep all existing fields and add:

```ts
    inferredType: type,
    typeWasExplicit,
    resolvedId,
    resolvedVisibility: visibility,
    rawContent: input.raw,
    content: input.raw,
```

(`content` stays for now; Task 1.4 rewires it via `buildImportChanges`. `inferredType` keeps its name so the modal/`updateStagingRow` keep working.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import-staging-state.test.ts`
Expected: PASS — new cases green and the pre-existing staging-state tests still pass (folder routing keys on `inferredType`, unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/stagingState.ts src/test/import-staging-state.test.ts
git commit -m "feat(import): atlas.type→tags→folder→lore precedence + resolved id/visibility on staging rows"
```

---

### Task 1.4: Persist rewritten frontmatter on commit

**Files:**
- Modify: `src/atlas/import/buildImportChanges.ts` (the `changes.push` at ~69-75)
- Test: `src/test/build-import-changes.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test (append)**

```ts
// add to src/test/build-import-changes.test.ts
import { buildImportChanges } from "@/atlas/import/buildImportChanges";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

describe("buildImportChanges persists inferred atlas fields", () => {
  it("rewrites frontmatter (not verbatim) for a create row with no atlas.type", async () => {
    const raw = `---\ntags:\n  - npc\n---\n# Corven\n\nbody\n`;
    const row = {
      id: "r1", filename: "corven.md",
      inferredType: "npc", typeWasExplicit: false,
      resolvedId: "corven", resolvedVisibility: "dm",
      rawContent: raw, content: raw,
      targetPath: "content/w/npcs/corven.md",
      pathAllowed: true, rowKind: "create" as const,
      included: true, frontmatterPath: undefined,
    };
    const [change] = await buildImportChanges([row as never]);
    expect(change.content).not.toBe(raw);            // not verbatim
    const atlas = parseFrontmatter(change.content).data.atlas as Record<string, unknown>;
    expect(atlas.type).toBe("npc");
    expect(atlas.id).toBe("corven");
    expect(atlas.visibility).toBe("dm");
    expect(parseFrontmatter(change.content).data.tags).toContain("npc");
    expect(change.baseHash).toBeNull();              // create-only
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/build-import-changes.test.ts -t "persists inferred atlas fields"`
Expected: FAIL — `change.content` equals `raw` (verbatim), atlas undefined.

- [ ] **Step 3: Implement**

In `src/atlas/import/buildImportChanges.ts` add the import:

```ts
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";
```

Replace the `changes.push({...})` block inside the loop with:

```ts
    const content = rewriteFrontmatter(row.rawContent, {
      id: row.resolvedId,
      type: row.inferredType,
      visibility: row.resolvedVisibility,
      tagsAdd: [row.inferredType],
    });
    changes.push({
      path: row.targetPath,
      content,
      kind: "entity-md",
      baseHash,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/build-import-changes.test.ts`
Expected: PASS — new case green; existing build-import-changes cases still pass (update them if they assert verbatim `content`; the contract is now "rewritten frontmatter, body preserved" — assert via `parseFrontmatter` body equality, not raw equality).

- [ ] **Step 5: Run the full import test trio + commit**

Run: `npx vitest run src/test/build-import-changes.test.ts src/test/import-staging-state.test.ts src/test/import/inferTypeFromTags.test.ts src/test/content/frontmatterRewrite.test.ts`
Expected: PASS (all).

```bash
git add src/atlas/import/buildImportChanges.ts src/test/build-import-changes.test.ts
git commit -m "fix(import): write inferred atlas frontmatter to disk instead of verbatim copy"
```

---

### Task 1.5: Staging modal shows resolved id/visibility + confirm-type flag

**Files:**
- Modify: `src/atlas/import/ImportStagingModal.tsx` (the type `<td>` ~164-184; the Notes `<td>` ~194-235)
- Modify: `src/atlas/import/useMdImportFlow.ts` only if a new patch field is needed (it is — `resolvedVisibility`); and `src/atlas/import/stagingState.ts` `StagingRowPatch` + `updateStagingRow` to accept `resolvedVisibility`.
- Test: `src/test/import-staging-modal.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (append)**

```tsx
// add to src/test/import-staging-modal.test.tsx
import { render, screen } from "@testing-library/react";
import { ImportStagingModal } from "@/atlas/import/ImportStagingModal";

it("flags rows whose type was not explicit and shows resolved visibility", () => {
  const row = {
    id: "r1", filename: "corven.md", inferredType: "npc",
    typeWasExplicit: false, resolvedId: "corven", resolvedVisibility: "dm",
    rawContent: "", content: "", targetPath: "content/w/npcs/corven.md",
    pathAllowed: true, rowKind: "create", included: true,
  };
  render(
    <ImportStagingModal
      open rows={[row as never]} importConfig={{ folders: { npc: "npcs" }, defaultFolder: "imports" }}
      onPatchRow={() => {}} onCancel={() => {}} onCommit={() => {}}
    />,
  );
  expect(screen.getByText(/confirm type/i)).toBeInTheDocument();
  expect(screen.getByText("corven")).toBeInTheDocument();        // resolved id
  expect(screen.getByLabelText(/visibility for corven\.md/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import-staging-modal.test.tsx -t "flags rows whose type was not explicit"`
Expected: FAIL — no "confirm type" text / no visibility control / no resolved id.

- [ ] **Step 3: Implement**

In `src/atlas/import/stagingState.ts` extend `StagingRowPatch`:

```ts
export interface StagingRowPatch {
  included?: boolean;
  inferredType?: string;
  targetPath?: string;
  resolvedVisibility?: string;
}
```

In `updateStagingRow`, before the final `return { ...row, ... }`, thread the new field (add to the returned object):

```ts
    resolvedVisibility: patch.resolvedVisibility ?? row.resolvedVisibility,
```

In `ImportStagingModal.tsx`, widen the `onPatchRow` prop type to include `resolvedVisibility?: string`. In the type `<td>`, under the existing `<Select>`, add the resolved id and a confirm flag:

```tsx
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono break-all">
                          id: {row.resolvedId}
                        </span>
                        {!row.typeWasExplicit && !row.parseError && (
                          <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/40 text-[10px]">
                            confirm type
                          </Badge>
                        )}
                      </div>
```

Add a visibility `<td>` (insert a new column header `<th>Visibility</th>` after the Inferred-type header, and this cell after the type `<td>`):

```tsx
                    <td className="py-2 pr-2">
                      <Select
                        value={row.resolvedVisibility || "dm"}
                        onValueChange={(v) => onPatchRow(row.id, { resolvedVisibility: v })}
                        disabled={!!row.parseError}
                      >
                        <SelectTrigger className="h-7 text-[11px]"
                          aria-label={`Visibility for ${row.filename}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["player", "dm", "hidden", "rumor"].map((v) => (
                            <SelectItem key={v} value={v} className="text-[11px]">{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import-staging-modal.test.tsx`
Expected: PASS — new case green; existing modal tests still pass (column count change: update any existing test that counts `<th>`/`<td>` to the new count).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/ImportStagingModal.tsx src/atlas/import/stagingState.ts src/test/import-staging-modal.test.tsx
git commit -m "feat(import): staging modal shows resolved id/visibility and flags unconfirmed type"
```

---

### Task 1.6: Slice 1 full gate

- [ ] **Step 1: Types**

Run: `npx tsc --noEmit`
Expected: clean (no new errors; pre-existing baseline only).

- [ ] **Step 2: Tests**

Run: `npm test -- --run`
Expected: green except the two pre-existing `fake-indexeddb` failures. No new failures.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no new errors).

- [ ] **Step 4: Player-safety scans**

Run: `npm run atlas:publish`
Expected: secrets + derived scans clean; player build unaffected.

- [ ] **Step 5: Commit the gate marker**

```bash
git commit --allow-empty -m "chore(slice1): smart-import persistence gate green"
```

---

# SLICE 2 — Real Edit Panel + Part 2 No-Loss

### Task 2.1: Entity-edit draft holder with snapshot seam

**Files:**
- Create: `src/atlas/categories/useEntityEditDraft.ts`
- Test: `src/test/categories/EntityEditPanel.test.tsx` (new file; holder tested here first)

The holder owns the in-progress edit (loaded file's atlas fields + body + baseHash) and exposes the Part 2 `snapshot()/applySnapshot()` seam plus an `isDirty` probe.

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/categories/EntityEditPanel.test.tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";

describe("useEntityEditDraft", () => {
  it("is clean until loaded, dirty after a field edit, snapshot round-trips", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    expect(result.current.isDirty()).toBe(false);

    act(() => result.current.load({
      sourcePath: "content/w/npcs/corven.md",
      baseHash: "sha256:abc",
      fields: { id: "corven", type: "npc", visibility: "dm", summary: "s" },
      body: "# Corven\n",
    }));
    expect(result.current.isDirty()).toBe(false); // loaded == pristine

    act(() => result.current.setBody("# Corven edited\n"));
    expect(result.current.isDirty()).toBe(true);

    const snap = result.current.snapshot();
    const { result: r2 } = renderHook(() => useEntityEditDraft());
    act(() => r2.current.applySnapshot(snap));
    expect(r2.current.isDirty()).toBe(true);
    expect(r2.current.draft?.body).toBe("# Corven edited\n");

    act(() => r2.current.clear());
    expect(r2.current.isDirty()).toBe(false);
    expect(r2.current.draft).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx -t "useEntityEditDraft"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/atlas/categories/useEntityEditDraft.ts
import { useCallback, useRef, useState } from "react";

export interface EntityEditFields {
  id: string;
  type: string;
  visibility: string;
  summary: string;
}
export interface EntityEditDraft {
  sourcePath: string;
  baseHash: string;
  fields: EntityEditFields;
  body: string;
  /** JSON of fields+body at load time — dirtiness = current !== pristine. */
  pristine: string;
}
export type EntityEditSnapshot = EntityEditDraft | null;

function fingerprint(fields: EntityEditFields, body: string): string {
  return JSON.stringify({ fields, body });
}

export interface EntityEditDraftAPI {
  draft: EntityEditDraft | null;
  load: (init: Omit<EntityEditDraft, "pristine">) => void;
  setField: (k: keyof EntityEditFields, v: string) => void;
  setBody: (b: string) => void;
  clear: () => void;
  isDirty: () => boolean;
  snapshot: () => EntityEditSnapshot;
  applySnapshot: (s: EntityEditSnapshot) => void;
}

export function useEntityEditDraft(): EntityEditDraftAPI {
  const [draft, setDraft] = useState<EntityEditDraft | null>(null);
  const ref = useRef<EntityEditDraft | null>(null);
  ref.current = draft;

  const load = useCallback((init: Omit<EntityEditDraft, "pristine">) => {
    setDraft({ ...init, pristine: fingerprint(init.fields, init.body) });
  }, []);
  const setField = useCallback((k: keyof EntityEditFields, v: string) => {
    setDraft((d) => (d ? { ...d, fields: { ...d.fields, [k]: v } } : d));
  }, []);
  const setBody = useCallback((b: string) => {
    setDraft((d) => (d ? { ...d, body: b } : d));
  }, []);
  const clear = useCallback(() => setDraft(null), []);
  const isDirty = useCallback(
    () => !!ref.current && fingerprint(ref.current.fields, ref.current.body) !== ref.current.pristine,
    [],
  );
  const snapshot = useCallback<() => EntityEditSnapshot>(() => ref.current, []);
  const applySnapshot = useCallback((s: EntityEditSnapshot) => setDraft(s), []);

  return { draft, load, setField, setBody, clear, isDirty, snapshot, applySnapshot };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx -t "useEntityEditDraft"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/categories/useEntityEditDraft.ts src/test/categories/EntityEditPanel.test.tsx
git commit -m "feat(categories): entity-edit draft holder with Part 2 snapshot seam"
```

---

### Task 2.2: Backward-compatible `entityEdit` session slice

**Files:**
- Modify: `src/atlas/session/sessionSnapshot.ts` (`SessionState` ~24-35, `deserializeSession` ~49-61, `sessionHasWork` ~64-72)
- Test: `src/test/session/sessionSnapshot.test.ts` (extend)

Add an optional global slice. Do **not** bump `SESSION_SCHEMA_VERSION` — make `entityEdit` optional so pre-existing v1 sessions still deserialize (no in-progress draft loss on upgrade).

- [ ] **Step 1: Write the failing test (append)**

```ts
// add to src/test/session/sessionSnapshot.test.ts
import { deserializeSession, serializeSession, sessionHasWork } from "@/atlas/session/sessionSnapshot";

describe("entityEdit slice (backward compatible)", () => {
  const base = {
    overrides: {}, mapOverrideByMap: {}, regionByMap: {},
    routeByMap: {}, fogByMap: {}, layerByMap: {}, savedAt: 1,
  };
  it("deserializes a v1 blob WITHOUT entityEdit (null default, no work)", () => {
    const blob = { version: 1, state: base };
    const s = deserializeSession(blob)!;
    expect(s.entityEdit).toBeNull();
    expect(sessionHasWork(s)).toBe(false);
  });
  it("round-trips an entityEdit draft and counts it as work", () => {
    const s = { ...base, entityEdit: {
      sourcePath: "content/w/npcs/corven.md", baseHash: "sha256:x",
      fields: { id: "corven", type: "npc", visibility: "dm", summary: "" },
      body: "edited", pristine: "different",
    } };
    const round = deserializeSession(serializeSession(s as never))!;
    expect(round.entityEdit?.body).toBe("edited");
    expect(sessionHasWork(round)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/session/sessionSnapshot.test.ts -t "entityEdit slice"`
Expected: FAIL — `entityEdit` not on type / not defaulted / not counted.

- [ ] **Step 3: Implement**

Add the import and field. In `sessionSnapshot.ts` add at the top with the other type imports:

```ts
import type { EntityEditSnapshot } from "@/atlas/categories/useEntityEditDraft";
```

Add to `SessionState` (after `layerByMap`):

```ts
  /** Global (not per-map) in-progress entity edit, or null. */
  entityEdit: EntityEditSnapshot;
```

In `deserializeSession`, the required-keys guard stays as-is (does NOT list `entityEdit`), and before `return s as SessionState;` add:

```ts
  s.entityEdit = (s as Partial<SessionState>).entityEdit ?? null;
```

In `sessionHasWork`, add to the final `return`:

```ts
  const anyEntityEdit =
    !!s.entityEdit &&
    JSON.stringify({ fields: s.entityEdit.fields, body: s.entityEdit.body }) !== s.entityEdit.pristine;
  return anyOverride || anyMap || anyRegion || anyRoute || anyFog || anyLayer || anyEntityEdit;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/session/sessionSnapshot.test.ts`
Expected: PASS — new + existing cases (existing v1 blobs still deserialize because `entityEdit` is not in the required-keys check).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/session/sessionSnapshot.ts src/test/session/sessionSnapshot.test.ts
git commit -m "feat(session): backward-compatible entityEdit slice"
```

---

### Task 2.3: Wire the holder into the session coordinator

**Files:**
- Modify: `src/atlas/session/useEditorSession.ts` (`EditorSessionArgs.holders` ~31-38, `collectActiveInto` ~74-84, `applyActiveFrom` ~86-95, `markSaved`/`discardAll` reset literals)
- Test: `src/test/session/no-loss-invariant.test.ts` (extend)

`entityEdit` is global (like `overrides`), not per-map. Add an `editorEntity` holder with `get/set`.

- [ ] **Step 1: Write the failing test (append, mirroring the file's existing holder pattern)**

```ts
// add to src/test/session/no-loss-invariant.test.ts
// In the existing invariant suite, add an entityEdit holder to the harness
// and assert: a dirty entityEdit survives a snapshot/persist cycle and is
// cleared by discardAll. Follow the existing harness construction in this
// file for the other holders; add:
//   editorEntity: { get: () => entityEditRef, set: (v) => { entityEditRef = v; } }
// and assert sessionHasWork(serialized) is true while entityEditRef is a
// dirty draft, false after discardAll().
```

(Implementer: replicate the existing per-holder invariant case structure already in this file for `region`/`route`; the assertion is the same shape — dirty holder ⇒ `sessionHasWork` true ⇒ survives persist ⇒ `discardAll` clears it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/session/no-loss-invariant.test.ts`
Expected: FAIL — `editorEntity` holder not accepted by `useEditorSession`.

- [ ] **Step 3: Implement**

In `EditorSessionArgs.holders` add:

```ts
    editorEntity: { get: () => SessionState["entityEdit"]; set: (v: SessionState["entityEdit"]) => void };
```

In `collectActiveInto`, after `s.overrides = holders.overrides.get();` add:

```ts
    s.entityEdit = holders.editorEntity.get();
```

In `applyActiveFrom`, after `holders.overrides.set(s.overrides);` add:

```ts
    holders.editorEntity.set(s.entityEdit);
```

In every reset literal (the `slicesRef.current = {...}` in `markSaved` and both in `discardAll`, plus the initial `useRef<SessionState>` default), add `entityEdit: null,` to the object literal so the shape stays complete.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/session/no-loss-invariant.test.ts`
Expected: PASS — entityEdit participates in no-loss exactly like the other holders.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/session/useEditorSession.ts src/test/session/no-loss-invariant.test.ts
git commit -m "feat(session): entityEdit holder participates in the no-loss invariant"
```

---

### Task 2.4: The edit panel component (load → edit → save)

**Files:**
- Create: `src/atlas/categories/EntityEditPanel.tsx`
- Test: `src/test/categories/EntityEditPanel.test.tsx` (extend)

Loads via `readSourceFile(sourcePath, fetch)` (exported from `src/atlas/save/canonicalPlacementSave.ts`, already used by `canonicalEntitySave`), splits with `parseFrontmatter`, edits fields+body, on Save builds one `FileChange` through `rewriteFrontmatter` + the edited body and calls `saveAtlasPatchToLocalFs([change], undefined, { rebuild: true })`. baseHash = `hashContent(rawAtLoad)` for stale-base protection.

- [ ] **Step 1: Write the failing test (append)**

```tsx
// add to src/test/categories/EntityEditPanel.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";

const RAW = `---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\n\n# Corven\n\nold body\n`;

it("loads an entity, edits the body, builds a save change through the shared rewrite", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    // /__atlas/save
    const body = JSON.parse(String(init!.body));
    expect(body.files[0].path).toBe("content/w/npcs/corven.md");
    expect(body.files[0].content).toContain("new body");
    expect(body.files[0].content).toContain("atlas:");
    return new Response(JSON.stringify({ saved: 1, paths: body.files.map((f: {path:string}) => f.path) }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const onSaved = vi.fn();
  render(
    <EntityEditPanel
      sourcePath="content/w/npcs/corven.md"
      onClose={() => {}}
      onSaved={onSaved}
      draftApi={undefined as never /* uses internal default in test mode */}
    />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/body/i), { target: { value: "# Corven\n\nnew body\n" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx -t "loads an entity"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/atlas/categories/EntityEditPanel.tsx
import { useEffect, useState } from "react";
import { parseFrontmatter } from "@/atlas/import/frontmatter";
import { rewriteFrontmatter } from "@/atlas/content/frontmatterRewrite";
import {
  saveAtlasPatchToLocalFs, hashContent, type FileChange,
} from "@/atlas/save/localFsSave";
import { readSourceFile } from "@/atlas/save/canonicalPlacementSave";
import { useEntityEditDraft, type EntityEditDraftAPI } from "./useEntityEditDraft";

export function EntityEditPanel({
  sourcePath, onClose, onSaved, draftApi,
}: {
  sourcePath: string;
  onClose: () => void;
  onSaved: () => void;
  /** Shared holder from the editor so edits join the Part 2 session.
   *  In unit tests this may be omitted; an internal instance is used. */
  draftApi?: EntityEditDraftAPI;
}) {
  const internal = useEntityEditDraft();
  const api = draftApi ?? internal;
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await readSourceFile(sourcePath, fetch);
        if (!alive) return;
        const fm = parseFrontmatter(raw);
        const atlas = (fm.data.atlas ?? {}) as Record<string, unknown>;
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
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => { alive = false; };
  }, [sourcePath, api]);

  const onSave = async () => {
    if (!api.draft) return;
    setPhase("saving");
    try {
      // rewriteFrontmatter takes the original-on-disk raw; reconstruct it from
      // the loaded baseHash source by re-reading is unnecessary — we kept the
      // body and only patch the atlas block, so build raw = body with NO
      // frontmatter and let rewriteFrontmatter add the atlas block, then layer
      // the edited body. Simplest correct form: rewrite a minimal doc.
      const synthetic = `---\n---\n${api.draft.body.startsWith("\n") ? "" : "\n"}${api.draft.body}`;
      const content = rewriteFrontmatter(synthetic, {
        id: api.draft.fields.id,
        type: api.draft.fields.type,
        visibility: api.draft.fields.visibility,
        summary: api.draft.fields.summary || undefined,
      });
      const change: FileChange = {
        path: api.draft.sourcePath,
        content,
        kind: "entity-md",
        baseHash: api.draft.baseHash,
      };
      await saveAtlasPatchToLocalFs([change], undefined, { rebuild: true });
      api.clear();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  if (phase === "loading") return <div className="p-4 text-xs">Loading…</div>;
  if (phase === "error") return (
    <div className="p-4 text-xs text-red-300">
      {error}
      <button className="underline ml-2" onClick={onClose}>Close</button>
    </div>
  );
  const d = api.draft!;
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        <label className="block">
          <span className="block mb-1">Type</span>
          <input aria-label="Type" className="w-full h-8 px-2 rounded border bg-background"
            value={d.fields.type} onChange={(e) => api.setField("type", e.target.value)} />
        </label>
        <label className="block">
          <span className="block mb-1">Visibility</span>
          <select aria-label="Visibility" className="w-full h-8 px-2 rounded border bg-background"
            value={d.fields.visibility} onChange={(e) => api.setField("visibility", e.target.value)}>
            {["player", "dm", "hidden", "rumor"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block mb-1">One-line summary</span>
          <input className="w-full h-8 px-2 rounded border bg-background"
            value={d.fields.summary} onChange={(e) => api.setField("summary", e.target.value)} />
        </label>
        <label className="block">
          <span className="block mb-1">Body (markdown)</span>
          <textarea aria-label="Body" rows={16}
            className="w-full px-2 py-1 rounded border bg-background font-mono text-[11px]"
            value={d.body} onChange={(e) => api.setBody(e.target.value)} />
        </label>
      </div>
      <div className="p-2 border-t flex gap-2">
        <button type="button" className="h-8 px-3 text-xs rounded border" onClick={onClose}>Close</button>
        <button type="button"
          className="h-8 px-3 text-xs rounded bg-primary text-primary-foreground"
          disabled={phase === "saving"} onClick={onSave}>
          {phase === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
```

Note: the `synthetic` reconstruction keeps the edited body and re-emits the atlas block via the one shared module. The `id` field is intentionally not exposed for editing in this slice's UI (id-rename is a relocation; the spec permits it but it is out of this slice's minimal surface — the field is still carried through the draft and written back unchanged). A follow-up may surface an explicit id-rename affordance.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/categories/EntityEditPanel.tsx src/test/categories/EntityEditPanel.test.tsx
git commit -m "feat(categories): real entity edit panel — load, edit fields+body, save via shared rewrite"
```

---

### Task 2.5: Wire row-click → edit panel in the editor shell

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` — the six `CategoryPanel` `onOpen` props (~1125-1184), the panels map, a new `editingEntityId` state, the `useEditorSession` `holders` + `perMapDirtyCount` (~811-835), the Ctrl-K `onChoose` entity branch (~1656-1659).
- Test: covered by the browser smoke in 2.6 (integration wiring; the unit-level behaviour is already tested in 2.1–2.4).

- [ ] **Step 1: Add state + holder**

Near the other `useState` (e.g. by `creatingIn`), add:

```tsx
const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
const entityEditDraft = useEntityEditDraft();
```

Import it at the top:

```tsx
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
```

- [ ] **Step 2: Add the holder to `useEditorSession`**

In the `holders:` object add:

```tsx
      editorEntity: {
        get: () => entityEditDraft.snapshot(),
        set: (v) => entityEditDraft.applySnapshot(v as never),
      },
```

In `perMapDirtyCount`, add `+ (entityEditDraft.isDirty() ? 1 : 0)`.

- [ ] **Step 3: Wire `onOpen` for all six categories**

For each of the six `CategoryPanel` instances replace
`onOpen={() => { /* entity detail view: Phase 4 */ }}`
with
`onOpen={(id) => setEditingEntityId(id)}` (use `replace_all` — all six are identical).

- [ ] **Step 4: Render the edit panel**

In the `panels` map, make each category render the edit panel when `editingEntityId` is set and that entity is in this category. Add a helper above the `panels` object:

```tsx
const editingEntity = editingEntityId
  ? project.entities.find((e) => e.id === editingEntityId)
  : undefined;
const renderCategory = (cat: CategoryId, node: React.ReactNode) =>
  editingEntity && categoryForType(editingEntity.type) === cat && editingEntity.sourcePath
    ? (
      <EntityEditPanel
        sourcePath={editingEntity.sourcePath}
        draftApi={entityEditDraft}
        onClose={() => setEditingEntityId(null)}
        onSaved={() => { setEditingEntityId(null); void reloadCanon(); }}
      />
    )
    : node;
```

Wrap each of the six category entries: `characters: renderCategory("characters", creatingIn === "characters" ? (...) : (<CategoryPanel ... />)),` — i.e. pass the existing JSX as `node`. (`reloadCanon` is the existing canon-reload used after import/save; reuse the same function the import flow's `onImported` calls — locate it near `importFlow`/`onImported` and reuse it. If it is inlined, extract it to a named `reloadCanon` callback first in its own micro-commit.)

- [ ] **Step 5: Ctrl-K "Edit {entity}"**

In the `CommandPalette` `onChoose`, the entity branch currently does `setActivePanel(categoryForType(ent?.type))`. Add, after that line:

```tsx
            if (ent) setEditingEntityId(ent.id);
```

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(editor): row-click and Ctrl-K open the entity edit panel; edits join the session"
```

---

### Task 2.6: Slice 2 full gate

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures.
- [ ] **Step 3:** `npm run lint` → clean.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke** (`npm run dev`, open `/atlas/edit`, ensure `.local-atlas/atlas.json` exists via `npm run atlas:build`):
  - Open the Lore category → **click the Corven row** (after Slice 1 re-import he is a Character; if not re-imported yet he is still openable from Lore) → edit panel loads his body.
  - Edit a body line → switch to another entity and back → the edit is still there (no-loss).
  - Click Save → success → reload page → change persisted.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(slice2): real edit panel + no-loss gate green"`

---

# SLICE 3 — Obsidian-Faithful Preview

### Task 3.1: Move the DM-block stripper to a shared browser-safe module

**Files:**
- Create: `src/atlas/content/stripDmBlocks.ts` (verbatim move of the function bodies)
- Modify: `scripts/atlas/stripDmBlocks.ts` → re-export from the new module
- Test: `src/test/content/stripDmBlocks-parity.test.ts`

The function is pure string/regex (browser-safe). `scripts/build-atlas.ts:17` imports `{ stripDmBlocks, stripDmFromShippingString } from "./atlas/stripDmBlocks"` and `scripts/build-atlas.ts:22` already imports from `../src/atlas/...`, proving scripts can import from `src/`. Single source of truth: move bodies to `src/`, re-export from `scripts/`.

- [ ] **Step 1: Write the failing parity test**

```ts
// src/test/content/stripDmBlocks-parity.test.ts
import { describe, it, expect } from "vitest";
import { stripDmBlocks as fromSrc } from "@/atlas/content/stripDmBlocks";
// The build path import — proves scripts re-export is identical.
import { stripDmBlocks as fromScripts } from "../../../scripts/atlas/stripDmBlocks";

const SAMPLE = `Visible.

%%
## DM Notes
secret truth
%%

More visible.

:::dm
callout secret
:::

End.
`;

describe("stripDmBlocks parity (one source of truth)", () => {
  it("src and scripts entrypoints produce byte-identical output", () => {
    expect(fromSrc(SAMPLE)).toEqual(fromScripts(SAMPLE));
  });
  it("hides %% and :::dm content", () => {
    const out = fromSrc(SAMPLE).text;
    expect(out).not.toContain("secret truth");
    expect(out).not.toContain("callout secret");
    expect(out).toContain("Visible.");
    expect(out).toContain("End.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/content/stripDmBlocks-parity.test.ts`
Expected: FAIL — `@/atlas/content/stripDmBlocks` not found.

- [ ] **Step 3: Implement the move**

Create `src/atlas/content/stripDmBlocks.ts` containing the **exact** current bodies of `stripDmBlocks` and `stripDmFromShippingString` from `scripts/atlas/stripDmBlocks.ts` (copy verbatim — same regexes, same return shape, same comments).

Replace the entire contents of `scripts/atlas/stripDmBlocks.ts` with a re-export:

```ts
// Single source of truth lives in src/ so the browser preview and the build
// use byte-identical stripping. Keep this path for build-side imports.
export { stripDmBlocks, stripDmFromShippingString } from "../../src/atlas/content/stripDmBlocks";
```

- [ ] **Step 4: Run test + the existing build tests to verify nothing regressed**

Run: `npx vitest run src/test/content/stripDmBlocks-parity.test.ts src/test/atlas-build.test.ts src/test/safety-fortress.test.ts`
Expected: PASS — parity green; build/safety tests still green (the build imports the same logic via the re-export).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/stripDmBlocks.ts scripts/atlas/stripDmBlocks.ts src/test/content/stripDmBlocks-parity.test.ts
git commit -m "refactor(content): single-source stripDmBlocks (src + scripts re-export)"
```

---

### Task 3.2: Preview renderer mirroring the build

**Files:**
- Create: `src/atlas/content/renderEntityMarkdown.ts`
- Test: `src/test/content/renderEntityMarkdown.test.ts`

Mirrors the build's body→html order (`scripts/build-atlas.ts:557-565`): DM strip (unless showing) → resolve `![[embed]]`/`[[wikilink]]` → `marked.parse(text, { async: false })` → `sanitizeAtlasHtml`. `sanitizeAtlasHtml` is `src/atlas/sanitizeHtml.ts`; `marked` v18 is already a dependency.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/content/renderEntityMarkdown.test.ts
import { describe, it, expect } from "vitest";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";

describe("renderEntityMarkdown", () => {
  const body = `# Corven

%%
secret DM truth
%%

![[Corven.png]]

A [[Tidemarrow|home]] city.
`;
  it("hides %% by default and renders markdown to sanitized html", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("<h1");
    expect(html).not.toContain("secret DM truth");
  });
  it("reveals %% when showDmNotes is true", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: true });
    expect(html).toContain("secret DM truth");
  });
  it("resolves ![[image]] embeds to an <img>", () => {
    const html = renderEntityMarkdown(body, {
      showDmNotes: false,
      resolveAsset: (name) => `/atlas/assets/images/${name.toLowerCase()}`,
    });
    expect(html).toContain('<img');
    expect(html).toContain("corven.png");
  });
  it("renders [[wikilink|alias]] as a styled reference span (alias text)", () => {
    const html = renderEntityMarkdown(body, { showDmNotes: false });
    expect(html).toContain("home");
    expect(html).not.toContain("[[Tidemarrow|home]]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/content/renderEntityMarkdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/atlas/content/renderEntityMarkdown.ts
/**
 * DM-preview markdown renderer. Mirrors the build body→html pipeline
 * (scripts/build-atlas.ts: strip DM blocks upstream → resolve links →
 * marked.parse → sanitizeAtlasHtml) so what the DM sees here matches what
 * ships. Uses the SAME stripDmBlocks and sanitizeAtlasHtml as the build.
 */
import { marked } from "marked";
import { stripDmBlocks } from "@/atlas/content/stripDmBlocks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

export interface RenderOpts {
  /** When true, DM-only %% / :::dm blocks are kept visible (preview only). */
  showDmNotes: boolean;
  /** name (e.g. "Corven.png") → URL. Defaults to the conventional assets path. */
  resolveAsset?: (name: string) => string;
}

const EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;
const WIKILINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

export function renderEntityMarkdown(body: string, opts: RenderOpts): string {
  const resolveAsset =
    opts.resolveAsset ?? ((n: string) => `/atlas/assets/images/${n}`);

  let text = opts.showDmNotes ? body : stripDmBlocks(body).text;

  // ![[image.ext]] → markdown image (resolved), before wikilink pass.
  text = text.replace(EMBED_RE, (_m, name: string) => {
    const clean = name.trim();
    return `![${clean}](${resolveAsset(clean)})`;
  });
  // [[target|alias]] → styled non-navigating reference (alias or target text).
  text = text.replace(WIKILINK_RE, (_m, target: string, alias?: string) => {
    const label = (alias ?? target).trim();
    return `<span class="atlas-wikilink" data-target="${target.trim()}">${label}</span>`;
  });

  const html = marked.parse(text, { async: false }) as string;
  return sanitizeAtlasHtml(html);
}
```

(If `sanitizeAtlasHtml` strips `<span class>`/`data-*`, adjust the wikilink replacement to the element/attribute the sanitizer allows — check `src/atlas/sanitizeHtml.ts` allowlist and use an allowed inline element such as `<em>` or an `<a>` without `href`; keep it non-navigating. The test asserts the label text survives, not the exact tag, so pick whatever the sanitizer permits.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/content/renderEntityMarkdown.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/renderEntityMarkdown.ts src/test/content/renderEntityMarkdown.test.ts
git commit -m "feat(content): Obsidian-faithful preview renderer (build-mirrored)"
```

---

### Task 3.3: Preview pane + DM-notes toggle + focus mode in the edit panel

**Files:**
- Create: `src/atlas/categories/EntityBodyPreview.tsx`
- Modify: `src/atlas/categories/EntityEditPanel.tsx` (add preview column + focus toggle)
- Test: `src/test/categories/EntityEditPanel.test.tsx` (extend)

- [ ] **Step 1: Write the failing test (append)**

```tsx
// add to src/test/categories/EntityEditPanel.test.tsx
import { EntityBodyPreview } from "@/atlas/categories/EntityBodyPreview";

it("EntityBodyPreview renders markdown and toggles DM notes", () => {
  const body = "# H\n\n%%\nsecret\n%%\n\nvisible\n";
  const { rerender } = render(<EntityBodyPreview body={body} showDmNotes={false} />);
  expect(screen.getByText("visible")).toBeInTheDocument();
  expect(screen.queryByText("secret")).not.toBeInTheDocument();
  rerender(<EntityBodyPreview body={body} showDmNotes={true} />);
  expect(screen.getByText(/secret/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx -t "EntityBodyPreview"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the preview component**

```tsx
// src/atlas/categories/EntityBodyPreview.tsx
import { useMemo } from "react";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";

export function EntityBodyPreview({
  body, showDmNotes,
}: { body: string; showDmNotes: boolean }) {
  const html = useMemo(
    () => renderEntityMarkdown(body, { showDmNotes }),
    [body, showDmNotes],
  );
  return (
    <div
      className="prose prose-invert max-w-none text-xs p-3 overflow-auto"
      // Content already passed through sanitizeAtlasHtml (build-grade sanitizer).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 4: Integrate into `EntityEditPanel.tsx`**

Add `showDmNotes` + `focus` state:

```tsx
const [showDmNotes, setShowDmNotes] = useState(false);
const [focus, setFocus] = useState(false);
```

Import the preview: `import { EntityBodyPreview } from "./EntityBodyPreview";`

Wrap the body editor + preview in a two-column row when `focus` is on (single column otherwise). Add toggles in the footer row:

```tsx
<label className="flex items-center gap-1 text-[11px]">
  <input type="checkbox" checked={showDmNotes}
    onChange={(e) => setShowDmNotes(e.target.checked)} />
  Show DM notes
</label>
<button type="button" className="h-8 px-3 text-xs rounded border"
  onClick={() => setFocus((f) => !f)}>
  {focus ? "Exit focus" : "Focus mode"}
</button>
```

And beside the body `<textarea>`, when `focus`, render `<EntityBodyPreview body={d.body} showDmNotes={showDmNotes} />` in the second column. The panel’s outer container, when `focus`, gets a wide class (e.g. `fixed inset-4 z-50 bg-background border rounded` or the editor's existing focus/expand pattern if one exists — check `AtlasPlacementEditor.tsx` panel host for an existing width-expand prop before inventing one; reuse it if present, per spec §D.1 "well past the ½ map cap").

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx`
Expected: PASS (all cases incl. earlier ones).

```bash
git add src/atlas/categories/EntityBodyPreview.tsx src/atlas/categories/EntityEditPanel.tsx src/test/categories/EntityEditPanel.test.tsx
git commit -m "feat(categories): live Obsidian-faithful preview + DM-notes toggle + focus mode"
```

---

### Task 3.4: Slice 3 full gate (Sub-project A done)

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures.
- [ ] **Step 3:** `npm run lint` → clean.
- [ ] **Step 4:** `npm run atlas:publish` → secrets + derived scans clean; player build still tree-shakes the editor; **no `%%` content in player output** (the build still strips via the re-exported single-source module).
- [ ] **Step 5: Full browser smoke (the spec's done criterion):**
  - `npm run atlas:build` then `npm run dev`, open `/atlas/edit`.
  - Import `content/astrath-deeprealm/imports/corven.md` (drag/drop or Import button) → the staging modal shows **type npc** with a "confirm type" flag and **visibility dm** → confirm → Import.
  - Corven now appears under **Characters** (not Lore) with correct atlas fields and `tags` containing `npc`.
  - **Click his row** → edit panel loads → fix a body line → switch entity and back, edit still there → toggle Focus mode → preview shows his `![[Corven.png]]` image and **hides** his `%%` DM notes; "Show DM notes" reveals them.
  - Save → reload → change persisted; run `npm run atlas:publish` → player build clean, no DM notes.
- [ ] **Step 6:**
```bash
git commit --allow-empty -m "chore(slice3): Obsidian-faithful preview gate green — Sub-project A complete"
```

---

## Self-Review

**1. Spec coverage**

- §A shared frontmatter contract → Task 1.2 (`rewriteFrontmatter`), reused in 1.4 + 2.4. ✓
- §B.1 precedence (explicit→tags→folder→lore) → Task 1.1 + 1.3. ✓
- §B.2 persistence (rewrite, not verbatim) → Task 1.4. ✓
- §B.3 staging UI (resolved id/visibility, confirm-type flag) → Task 1.5. ✓
- §B.4 backfill via re-import → covered by 1.4 update-row path (baseHash branch unchanged) + Slice 2 hand-edit. ✓
- §C.1 row-click primary affordance → Task 2.5 step 3. ✓
- §C.2 load via `/__atlas/read` → Task 2.4 (`readSourceFile`). ✓
- §C.3 edit atlas fields + body, untyped OK → Task 2.4 (fields default from possibly-absent atlas). ✓
- §C.4 one Save + baseHash + atomic → Task 2.4 (`saveAtlasPatchToLocalFs`, baseHash from load). ✓
- §C.5 / decision 9 no-loss holder → Tasks 2.1–2.3, 2.5. ✓
- §D.1 preview surface + focus mode → Task 3.3. ✓
- §D.2 render contract, shared `stripDmBlocks`, DM toggle, images, wikilinks → Tasks 3.1–3.3. ✓
- §D.3 renderer reuse (build's `marked` + `sanitizeAtlasHtml`) → Task 3.2. ✓
- §F testing (precedence table w/ Corven, round-trip lossless, parity test, no-loss extension) → 1.1–1.5, 2.1–2.3, 3.1; browser smokes 2.6/3.4. ✓
- §G risk (single emitter, lossless test) → Task 1.2 round-trip test. ✓
- Decision 8 (row-click) → 2.5. Decision 4/5 (confirm type, write tag) → 1.3/1.4/1.5. ✓

No spec requirement is left without a task.

**2. Placeholder scan**

One soft spot resolved inline: Task 3.2 step 3 and Task 3.3 step 4 contain conditional instructions ("if the sanitizer strips spans, use an allowed element"; "reuse the existing focus/expand prop if present"). These are bounded fallbacks with a concrete decision rule and a fixed test oracle (the test asserts label text / visible text, not exact markup), not open-ended TODOs — acceptable. Task 2.5 step 4 references `reloadCanon`; the step explicitly says to reuse the existing canon-reload callback the import flow already uses and to extract+name it in a micro-commit if inlined — concrete, not a placeholder. No "TBD"/"implement later"/bare "add error handling" remain.

**3. Type consistency**

- `AtlasFieldPatch` ({id?,type?,visibility?,summary?,tagsAdd?}) defined in 1.2, used identically in 1.4 and 2.4. ✓
- `rewriteFrontmatter(rawFile, patch)` signature consistent across 1.2/1.4/2.4. ✓
- `StagingRow` new fields (`typeWasExplicit`, `resolvedId`, `resolvedVisibility`, `rawContent`) defined in 1.3, consumed in 1.4 and 1.5. ✓
- `EntityEditDraft`/`EntityEditSnapshot`/`EntityEditDraftAPI` defined in 2.1, consumed in 2.2 (`SessionState.entityEdit: EntityEditSnapshot`), 2.3 (holder get/set), 2.4/2.5 (panel + wiring). Names consistent. ✓
- `stripDmBlocks` return shape `{ text, count, unbalanced }` unchanged by the 3.1 move; 3.2 uses `.text`. ✓
- `renderEntityMarkdown(body, opts)` defined 3.2, consumed 3.3. ✓

No signature/name drift found. Plan is internally consistent and complete.
