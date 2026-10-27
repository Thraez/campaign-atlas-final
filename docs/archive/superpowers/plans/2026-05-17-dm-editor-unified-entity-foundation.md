# DM Editor — Unified Entity Foundation (Sub-project B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared entity renderer + a faithful client player-projection + a global Player/DM lens, so the DM editor and player site stay consistent and any entity (incl. hidden/draft) previews exactly as a player will see it.

**Architecture:** Four independently-shippable, non-regressing slices. B1 extracts the player `EntityPanel` and the build's wikilink pipeline into shared browser-safe modules and adds `projectEntityForPlayer` (a pure client mirror of the build's player transform, locked to real build output by a parity test). B2 renders the DM entity surface through the shared panel (Reading default), keeping Sub-project A's local DM-notes toggle. B3 makes pin/row clicks open the entity (player parity). B4 adds the global `Player ⇄ DM` lens and retires the superseded local toggle.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, `marked` v18, existing build (`scripts/build-atlas.ts`), Sub-project A shared modules (`stripDmBlocks`, `renderEntityMarkdown`).

**Spec:** `docs/superpowers/specs/2026-05-17-dm-editor-unified-entity-foundation-design.md`

**Test/verify commands (used throughout):**
- Single test file: `npx vitest run <path> -t "<name>"`
- Types: `npx tsc --noEmit`
- Lint: `npm run lint`
- Full gate (end of each slice): `npm test -- --run` then `npm run lint` then `npm run atlas:publish`

Pre-existing known-failing tests unrelated to this work: `src/test/session/idbStore.test.ts` and `src/test/session/useEditorSession.test.tsx` (missing `fake-indexeddb` dev dependency). Treat as pre-existing; do not block slice gates on them; do not introduce *new* failures.

**Plan deviation from spec §A.2 (deliberate, parity-driven):** the spec said rebuild `bodyHtml` "via Sub-project A's shared renderer (`renderEntityMarkdown`)". The build actually produces `bodyHtml` via `tokenizeWikilinks → marked.parse → renderLinkTokens → sanitizeAtlasHtml` (NOT `renderEntityMarkdown`, which renders wikilinks differently). Using `renderEntityMarkdown` would make the §G.1 parity test fail by construction. This plan therefore mirrors the build's *actual* pipeline by extracting `parseWikilinks` to a shared module (the exact Sub-project A `stripDmBlocks` pattern) and composing it in `projectEntityForPlayer`. The spec's *goal* (faithful projection locked by a parity test) is unchanged and better served.

**`scripts/build-atlas.ts` is NOT refactored.** `projectEntityForPlayer` is a parallel client mirror; the §G.1 build-parity test (Task B1.4) is the lockstep enforcement (same protection as Sub-project A's `stripDmBlocks-parity` test, lower risk than editing the build loop).

---

## File Structure

**Slice B1 — Extract & share + projection engine**
- Move `scripts/atlas/parseWikilinks.ts` → `src/atlas/content/parseWikilinks.ts`; `scripts/atlas/parseWikilinks.ts` becomes a re-export (browser-safe single source, like `stripDmBlocks`).
- Create `src/atlas/content/projectEntityForPlayer.ts` — pure client mirror of the build's player transform.
- Create `src/atlas/entity/EntityPanel.tsx` — the player entity renderer, moved verbatim from `AtlasViewer.tsx`, plus a `readerAffordances?: boolean` prop.
- Modify `src/pages/AtlasViewer.tsx` — import `EntityPanel` from the new module (delete the local copy).
- Tests: `src/test/content/parseWikilinks-parity.test.ts`, `src/test/content/projectEntityForPlayer.test.ts`, `src/test/content/projectEntityForPlayer-build-parity.test.ts`, `src/test/entity/EntityPanel.test.tsx`.

**Slice B2 — Entity surface renders through the shared panel**
- Create `src/atlas/entity/EntityReadingView.tsx` — projects a DM entity and renders it through the shared `EntityPanel` (`readerAffordances={false}`), with the "not yet visible to players" note.
- Modify `src/pages/AtlasPlacementEditor.tsx` — `renderCategory` opens Reading by default with an Edit toggle; Sub-project A's local DM-notes toggle stays.
- Tests: `src/test/entity/EntityReadingView.test.tsx`, extend `src/test/categories/EntityEditPanel.test.tsx` is NOT needed (untouched).

**Slice B3 — Pin / row interaction parity**
- Modify `src/pages/AtlasPlacementEditor.tsx` — marker `click`/`dblclick` (when not placing) → open entity Reading; category row double-click → same; remove the "open category panel" stub.
- Tests: `src/test/editor/pin-open-parity.test.tsx`.

**Slice B4 — Global View lens**
- Create `src/atlas/view/ViewModeProvider.tsx` — `useViewMode` context + localStorage persistence.
- Modify `src/pages/AtlasPlacementEditor.tsx` — wrap in provider, add the chrome toggle, entity surfaces + category lists read the lens.
- Modify `src/atlas/entity/EntityReadingView.tsx` — lens-driven (player projection vs raw DM render).
- Delete `src/atlas/categories/EntityBodyPreview.tsx`; remove Sub-project A's local "Show DM notes"/focus toggle wiring from `src/atlas/categories/EntityEditPanel.tsx`; delete the now-dead `EntityBodyPreview` test.
- Tests: `src/test/view/ViewModeProvider.test.tsx`, extend `src/test/entity/EntityReadingView.test.tsx`.

---

# SLICE B1 — Extract & Share the Renderer + Projection Engine

### Task B1.1: Move `parseWikilinks` to a shared browser-safe module

**Files:**
- Create: `src/atlas/content/parseWikilinks.ts` (verbatim move of the function bodies)
- Modify: `scripts/atlas/parseWikilinks.ts` → re-export from the new module
- Test: `src/test/content/parseWikilinks-parity.test.ts`

`tokenizeWikilinks` / `renderLinkTokens` are pure string/regex (browser-safe), currently in `scripts/atlas/parseWikilinks.ts`. Single source of truth: move bodies to `src/`, re-export from `scripts/` (identical to how Sub-project A handled `stripDmBlocks`).

- [ ] **Step 1: Read the source**

Read `scripts/atlas/parseWikilinks.ts` in full. Note the exact exports: `tokenizeWikilinks(body, ctx: ResolveContext): { tokenized: string; links: ResolvedLink[] }`, `renderLinkTokens(html, links, opts?: { hideBroken?: boolean }): string`, the `ResolveContext` type, and any other exported types (`ResolvedLink` may be imported from elsewhere — note its import).

- [ ] **Step 2: Write the failing parity test**

```ts
// src/test/content/parseWikilinks-parity.test.ts
import { describe, it, expect } from "vitest";
import { tokenizeWikilinks as fromSrc, renderLinkTokens as renderSrc } from "@/atlas/content/parseWikilinks";
import { tokenizeWikilinks as fromScripts, renderLinkTokens as renderScripts } from "../../../scripts/atlas/parseWikilinks";

const BODY = `See [[Tidemarrow]] and [[Corven|the smuggler]] plus [[Unknown Place]].`;
const ctx = { resolveByName: (n: string) => (n.toLowerCase() === "tidemarrow" ? "tidemarrow" : n.toLowerCase() === "corven" ? "corven" : undefined) };

describe("parseWikilinks parity (one source of truth)", () => {
  it("tokenize: src and scripts entrypoints are identical", () => {
    expect(fromSrc(BODY, ctx)).toEqual(fromScripts(BODY, ctx));
  });
  it("render: src and scripts entrypoints are identical (hideBroken on and off)", () => {
    const a = fromSrc(BODY, ctx);
    const html = `<p>${a.tokenized}</p>`;
    expect(renderSrc(html, a.links, { hideBroken: true })).toEqual(renderScripts(html, a.links, { hideBroken: true }));
    expect(renderSrc(html, a.links, {})).toEqual(renderScripts(html, a.links, {}));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/content/parseWikilinks-parity.test.ts`
Expected: FAIL — `@/atlas/content/parseWikilinks` not found.

- [ ] **Step 4: Implement the move**

Create `src/atlas/content/parseWikilinks.ts` containing the **exact verbatim** bodies of every export currently in `scripts/atlas/parseWikilinks.ts` (same regexes, same types, same comments). If `ResolvedLink` was imported in the scripts file from a `src/` path, keep that import path; if it was a local type, move it too.

Replace the entire contents of `scripts/atlas/parseWikilinks.ts` with a re-export (mirror the exact form `scripts/atlas/stripDmBlocks.ts` uses today — read that file first to copy the comment/style):

```ts
// Single source of truth lives in src/ so the browser projection and the build
// use byte-identical wikilink tokenisation/rendering. Keep this path for build-side imports.
export { tokenizeWikilinks, renderLinkTokens } from "../../src/atlas/content/parseWikilinks";
export type { ResolveContext } from "../../src/atlas/content/parseWikilinks";
```

(Adjust the `export type` line to whatever types the original file exported.)

- [ ] **Step 5: Run parity + build/safety tests**

Run: `npx vitest run src/test/content/parseWikilinks-parity.test.ts src/test/atlas-build.test.ts src/test/safety-fortress.test.ts`
Expected: PASS — parity green; build/safety still green (the build imports the same logic via the re-export).

- [ ] **Step 6: Commit**

```bash
git add src/atlas/content/parseWikilinks.ts scripts/atlas/parseWikilinks.ts src/test/content/parseWikilinks-parity.test.ts
git commit -m "refactor(content): single-source parseWikilinks (src + scripts re-export)"
```

---

### Task B1.2: `projectEntityForPlayer` — the client player transform

**Files:**
- Create: `src/atlas/content/projectEntityForPlayer.ts`
- Test: `src/test/content/projectEntityForPlayer.test.ts`

Mirrors `scripts/build-atlas.ts` player branch: strip DM blocks from body, redact wikilinks/relationships to secret targets, scrub shipping strings, drop dm-only fields, rebuild `bodyHtml` via the shared `parseWikilinks` + `marked` + `sanitizeAtlasHtml`. Reuses already-`src/` exports: `stripDmBlocks`/`stripDmFromShippingString` (`@/atlas/content/stripDmBlocks`), `compactProfile`/`stripDmProfile`/`filterRelationshipsForPlayer` (`@/atlas/profiles/profileBuild`), `sanitizeAtlasHtml` (`@/atlas/sanitizeHtml`). The build's tiny inline locals (`scrubTags`, `dedupAliases`, `META_TAGS`) are replicated here (they are not exported from the build; the §G.1 parity test guarantees they stay correct).

- [ ] **Step 1: Write the failing unit test**

```ts
// src/test/content/projectEntityForPlayer.test.ts
import { describe, it, expect } from "vitest";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id, title: p.title, type: p.type ?? "npc", visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [], tags: p.tags ?? [], images: p.images ?? [],
    body: p.body ?? "", bodyHtml: p.bodyHtml ?? "", frontmatter: p.frontmatter ?? { secret: 1 },
    sourcePath: p.sourcePath ?? "content/w/npcs/x.md", links: p.links ?? [],
    backlinks: p.backlinks ?? [], summary: p.summary, race: p.race,
    profile: p.profile, relationships: p.relationships, canon: p.canon, world: p.world,
  } as Entity;
}

describe("projectEntityForPlayer", () => {
  it("strips %%dm%% from body, clears frontmatter and sourcePath", () => {
    const corven = ent({ id: "corven", title: "Corven", visibility: "dm",
      body: "Public line.\n\n%%\nsecret plan\n%%\n\nMore public." });
    const all = new Map([[corven.id, corven]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(corven, ctx);
    expect(p.body).not.toContain("secret plan");
    expect(p.bodyHtml).not.toContain("secret plan");
    expect(p.bodyHtml).toContain("Public line.");
    expect(p.frontmatter).toEqual({});
    expect(p.sourcePath).toBe("");
  });
  it("redacts a wikilink that points at a hidden entity to the build marker", () => {
    const hidden = ent({ id: "soreth", title: "Soreth", visibility: "dm" });
    const pub = ent({ id: "edric", title: "Edric", visibility: "player",
      body: "Edric fears [[Soreth]] greatly." });
    const all = new Map([[hidden.id, hidden], [pub.id, pub]]);
    const ctx = buildProjectionContext(all);
    const p = projectEntityForPlayer(pub, ctx);
    expect(p.body).not.toContain("[[Soreth]]");
    expect(p.body).toContain("…");
    expect(p.bodyHtml).not.toContain("Soreth");
  });
  it("scrubs meta tags and dedups the title-alias, drops dm relationships", () => {
    const hidden = ent({ id: "soreth", title: "Soreth", visibility: "dm" });
    const e = ent({ id: "edric", title: "Edric", visibility: "player",
      tags: ["npc", "smuggler", "Edric"], aliases: ["Edric", "The Knife"],
      relationships: [
        { kind: "ally", targetId: "soreth", label: "secret backer" } as never,
        { kind: "rival", targetId: "edric2", label: "open rival" } as never,
      ] });
    const e2 = ent({ id: "edric2", title: "Edric Two", visibility: "player" });
    const all = new Map([[hidden.id, hidden], [e.id, e], [e2.id, e2]]);
    const p = projectEntityForPlayer(e, buildProjectionContext(all));
    expect(p.tags).not.toContain("npc");          // META tag scrubbed
    expect(p.tags).toContain("smuggler");
    expect(p.aliases).not.toContain("Edric");     // title-alias deduped
    expect((p.relationships ?? []).some((r) => r.targetId === "soreth")).toBe(false);
    expect((p.relationships ?? []).some((r) => r.targetId === "edric2")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/content/projectEntityForPlayer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/atlas/content/projectEntityForPlayer.ts`. This composes the shared units and replicates the build's player branch (`scripts/build-atlas.ts` lines 422–565). Read those build lines first to confirm the exact ordering, then implement:

```ts
// src/atlas/content/projectEntityForPlayer.ts
/**
 * Pure client mirror of scripts/build-atlas.ts's PLAYER entity transform.
 * Locked to the real build output by src/test/content/projectEntityForPlayer-build-parity.test.ts.
 * Reuses every shared unit the build uses; replicates only the build's tiny
 * inline locals (scrubTags / dedupAliases / META_TAGS), guarded by the parity test.
 */
import { marked } from "marked";
import type { Entity } from "@/atlas/content/schema";
import { stripDmBlocks, stripDmFromShippingString } from "@/atlas/content/stripDmBlocks";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import { compactProfile, stripDmProfile, filterRelationshipsForPlayer } from "@/atlas/profiles/profileBuild";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

// Verbatim from scripts/build-atlas.ts META_TAGS (lines 58–86). Kept in lockstep
// by the build-parity test; if the build's list changes, that test fails.
const META_TAGS = new Set([
  "npc", "person", "region", "settlement", "city", "town", "village",
  "faction", "organization", "guild", "deity", "god", "event", "item",
  "artifact", "note", "location", "ruin", "dungeon", "cave", "temple",
  "shop", "port", "stub", "draft", "wip", "todo",
]);

export interface ProjectionContext {
  /** entity id → entity (DM-side, includes hidden). */
  entitiesById: Map<string, Entity>;
  /** ids whose visibility ∉ {player,rumor} (build's secretEntityIds). */
  secretIds: Set<string>;
  /** lowercase title/alias → id (build's crossRefNameIndex). */
  resolveByName: (name: string) => string | undefined;
}

export function buildProjectionContext(entitiesById: Map<string, Entity>): ProjectionContext {
  const nameIndex = new Map<string, string>();
  const secretIds = new Set<string>();
  for (const e of entitiesById.values()) {
    nameIndex.set(e.title.toLowerCase(), e.id);
    for (const a of e.aliases ?? []) nameIndex.set(a.toLowerCase(), e.id);
    if (!PLAYER_VISIBLE.has(e.visibility)) secretIds.add(e.id);
  }
  return {
    entitiesById,
    secretIds,
    resolveByName: (n) => nameIndex.get(n.trim().toLowerCase()),
  };
}

export function projectEntityForPlayer(entity: Entity, ctx: ProjectionContext): Entity {
  // 1. Body: DM blocks stripped (build line 411 `noDm`).
  let body = stripDmBlocks(entity.body ?? "").text;

  // 2. Tokenise wikilinks (build line 519).
  const { tokenized, links } = tokenizeWikilinks(body, { resolveByName: ctx.resolveByName });

  // 3. Redact links to secret targets (build lines 526–548).
  for (const l of links) {
    if (l.resolvedId && ctx.secretIds.has(l.resolvedId)) {
      if (l.target) {
        const escTarget = l.target.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
        body = body.replace(new RegExp(`\\[\\[${escTarget}(?:\\|[^\\]]+)?\\]\\]`, "g"), "…");
      }
      l.resolvedId = undefined;
      l.display = "…";
      l.target = "";
      l.broken = true;
    }
  }

  // 4. Render (build lines 557–565).
  const html = marked.parse(tokenized, { async: false }) as string;
  const linked = renderLinkTokens(html, links, { hideBroken: true });
  const bodyHtml = sanitizeAtlasHtml(linked);

  // 5. Shipping-string scrubs + meta-tag scrub + alias dedup (build lines 422–458).
  const strip = (s: string | undefined) => stripDmFromShippingString(s);
  const stripArr = (arr: string[]) =>
    arr.map((x) => stripDmFromShippingString(x) ?? "").filter((x) => x.length > 0);
  const scrubTags = (arr: string[]) => arr.filter((t) => !META_TAGS.has(t.toLowerCase()));
  const dedupAliases = (arr: string[], t: string) => {
    const tl = t.toLowerCase();
    return arr.filter((a) => a.trim().toLowerCase() !== tl);
  };

  const title = strip(entity.title) ?? entity.title;

  // 6. Relationships filtered for player (build lines 758–774).
  let relationships = entity.relationships;
  if (relationships && relationships.length > 0) {
    const res = filterRelationshipsForPlayer(relationships, {
      entityVisibility: (id: string) => ctx.entitiesById.get(id)?.visibility ?? "dm",
    } as never);
    relationships = res.kept.length > 0 ? res.kept : undefined;
  }

  return {
    ...entity,
    title,
    aliases: dedupAliases(stripArr(entity.aliases ?? []), title),
    tags: scrubTags(stripArr(entity.tags ?? [])),
    summary: strip(entity.summary),
    race: strip(entity.race),
    body,
    bodyHtml,
    frontmatter: {},
    sourcePath: "",
    links,
    profile: stripDmProfile(compactProfile(entity.profile)),
    relationships,
  };
}
```

Note: if `filterRelationshipsForPlayer`'s real options shape differs from `{ entityVisibility }`, read `src/atlas/profiles/profileBuild.ts` and pass the exact options it expects (the build call is at `scripts/build-atlas.ts` ~line 758 — match it). The `as never` is a placeholder only if the real signature is unclear; prefer the real type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/content/projectEntityForPlayer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/projectEntityForPlayer.ts src/test/content/projectEntityForPlayer.test.ts
git commit -m "feat(content): projectEntityForPlayer — pure client mirror of the build player transform"
```

---

### Task B1.3: Build-parity test (the linchpin)

**Files:**
- Test: `src/test/content/projectEntityForPlayer-build-parity.test.ts`

For every player-visible entity, `projectEntityForPlayer(dmEntity, ctx)` must equal that entity in the real player `atlas.json`. This is the §G.1 linchpin: drift from the build = a failing test. Build pattern mirrors `src/test/atlas-build.test.ts` (read it first for the exact `execFileSync`/temp-dir idiom).

- [ ] **Step 1: Read the build-test idiom**

Read `src/test/atlas-build.test.ts`. Note exactly how it invokes the build (`execFileSync` with `npx tsx scripts/build-atlas.ts`, `--player` flag, temp `outDir`) and reads `atlas.json`.

- [ ] **Step 2: Write the parity test**

```ts
// src/test/content/projectEntityForPlayer-build-parity.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

// Normalise HTML for comparison (whitespace between tags is not semantically
// meaningful and marked/sanitiser emit it differently in edge cases).
const norm = (h: string) => h.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

let dm: { entities: Entity[] };
let player: { entities: Entity[] };

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b1-parity-"));
  const dmOut = path.join(tmp, "dm");
  const plOut = path.join(tmp, "player");
  // Match the flags/args used by src/test/atlas-build.test.ts.
  execFileSync("npx", ["tsx", "scripts/build-atlas.ts", "--out", dmOut], { stdio: "pipe" });
  execFileSync("npx", ["tsx", "scripts/build-atlas.ts", "--player", "--out", plOut], { stdio: "pipe" });
  dm = JSON.parse(fs.readFileSync(path.join(dmOut, "atlas.json"), "utf8"));
  player = JSON.parse(fs.readFileSync(path.join(plOut, "atlas.json"), "utf8"));
}, 120_000);

describe("projectEntityForPlayer ≡ build player output (linchpin)", () => {
  it("every player-visible entity projects identically to the player build", () => {
    const byId = new Map(dm.entities.map((e) => [e.id, e]));
    const ctx = buildProjectionContext(byId);
    const playerById = new Map(player.entities.map((e) => [e.id, e]));
    let checked = 0;
    for (const dmEntity of dm.entities) {
      const expected = playerById.get(dmEntity.id);
      if (!expected) continue; // hidden/dm — excluded from player build, no oracle
      const got = projectEntityForPlayer(dmEntity, ctx);
      expect(norm(got.bodyHtml), `bodyHtml ${dmEntity.id}`).toEqual(norm(expected.bodyHtml));
      expect(got.body, `body ${dmEntity.id}`).toEqual(expected.body);
      expect(got.tags, `tags ${dmEntity.id}`).toEqual(expected.tags);
      expect(got.aliases, `aliases ${dmEntity.id}`).toEqual(expected.aliases);
      expect(got.summary ?? "", `summary ${dmEntity.id}`).toEqual(expected.summary ?? "");
      expect(got.frontmatter, `frontmatter ${dmEntity.id}`).toEqual(expected.frontmatter);
      expect(got.sourcePath, `sourcePath ${dmEntity.id}`).toEqual(expected.sourcePath);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the parity test**

Run: `npx vitest run src/test/content/projectEntityForPlayer-build-parity.test.ts`
Expected: Likely FAIL the first time on specific fields. **Iterate `projectEntityForPlayer.ts` (Task B1.2) until this passes** — the build is the ground truth. Common drift points and the fix (do not change the test):
- `--out` flag not supported by the build CLI → read `scripts/build-atlas.ts` arg parsing; use the exact flag the build accepts for output dir, or the env/cwd idiom `src/test/atlas-build.test.ts` uses. Match that test exactly.
- `body`/`bodyHtml` mismatch → re-check ordering vs build lines 519–565 (redaction happens on `body` AND links before render).
- `tags`/`aliases` mismatch → align `scrubTags`/`dedupAliases`/`stripArr` with build lines 425–446.
- `profile` mismatch → ensure `stripDmProfile(compactProfile(...))` matches build lines 471–491 + 755.

- [ ] **Step 4: Commit once green**

```bash
git add src/test/content/projectEntityForPlayer-build-parity.test.ts src/atlas/content/projectEntityForPlayer.ts
git commit -m "test(content): build-parity linchpin — projectEntityForPlayer locked to player build output"
```

---

### Task B1.4: Extract `EntityPanel` to a shared module

**Files:**
- Create: `src/atlas/entity/EntityPanel.tsx` (verbatim move of the component + its `NotesPanel` helper)
- Modify: `src/pages/AtlasViewer.tsx` (delete the local copy; import from the new module)
- Test: `src/test/entity/EntityPanel.test.tsx`

`EntityPanel` is `AtlasViewer.tsx` lines 888–1031 (`forwardRef<HTMLDivElement, EntityPanelProps>`), props interface lines 724–731, with a `NotesPanel` helper (lines 762–886) and a print button (lines 935–943). It is currently NOT exported. Move it verbatim; add a `readerAffordances?: boolean` prop (default `true`) that gates the `NotesPanel` render (line ~984) and the print `<Button>` (lines 935–943).

- [ ] **Step 1: Read the source**

Read `src/pages/AtlasViewer.tsx` lines 700–1035 (props interface, `NotesPanel`, `EntityPanel`) and the EntityPanel-specific imports (React hooks; `loadNote/saveNote/deleteNote/exportNotesJson/importNotesJson` from `@/atlas/notes/playerNotes`; `playerTypeLabel` from `@/atlas/content/typeLabel`; `normalizeAtlasAssetUrl` from `@/atlas/url`; `printEntityHandout` from `@/atlas/printHandout`; `sanitizeAtlasHtml` from `@/atlas/sanitizeHtml`; `Button`/`ScrollArea`/`Badge`/`Dialog*`/`Textarea` from `@/components/ui/*`; `MapPin,X,Link2,Check,Printer` from `lucide-react`; `Link` from `react-router-dom`; `toast` from `sonner`). Also note the two usage sites (lines 439–451, 474–487) and `panelRef` (line 220).

- [ ] **Step 2: Write the failing test**

```tsx
// src/test/entity/EntityPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { Entity } from "@/atlas/content/schema";

const e: Entity = {
  id: "corven", title: "Corven", type: "npc", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "<p>Bio body</p>",
  frontmatter: {}, sourcePath: "", links: [], backlinks: [],
} as Entity;

const renderPanel = (readerAffordances?: boolean) =>
  render(
    <MemoryRouter>
      <EntityPanel
        entity={e}
        placements={[]}
        entityById={new Map([[e.id, e]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        readerAffordances={readerAffordances}
      />
    </MemoryRouter>,
  );

describe("EntityPanel (shared)", () => {
  it("renders the entity bio", () => {
    renderPanel();
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.getByText("Bio body")).toBeInTheDocument();
  });
  it("hides player-personal notes + handout when readerAffordances=false", () => {
    renderPanel(false);
    expect(screen.queryByLabelText(/handout as PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Notes$/i)).not.toBeInTheDocument();
  });
  it("shows them by default (player site unchanged)", () => {
    renderPanel(true);
    expect(screen.getByLabelText(/handout as PDF/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/entity/EntityPanel.test.tsx`
Expected: FAIL — `@/atlas/entity/EntityPanel` not found.

- [ ] **Step 4: Implement the move**

Create `src/atlas/entity/EntityPanel.tsx`. Move the `EntityPanelProps` interface, the `NotesPanel` helper component, and the `EntityPanel` `forwardRef` component **verbatim** from `AtlasViewer.tsx`. Add the imports those bodies need (copy the exact import statements identified in Step 1, adjusting relative paths to the `@/` alias form). Add `export` to `EntityPanel`. Make two minimal changes only:

1. Add to `EntityPanelProps`:
```tsx
  /** Player-personal affordances (private notes, PDF handout). Default true =
   *  the player site is unchanged. The DM editor passes false. */
  readerAffordances?: boolean;
```
2. In the `EntityPanel` body, destructure `readerAffordances = true` from props, and gate the two affordances:
   - Wrap the print `<Button>` (the one with `onClick={() => printEntityHandout(entity)}`, `aria-label="Download handout as PDF"`) in `{readerAffordances && ( … )}`.
   - Wrap the `<NotesPanel entityId={entity.id} entityTitle={entity.title} />` render in `{readerAffordances && ( … )}`.

In `src/pages/AtlasViewer.tsx`: delete the moved `EntityPanelProps`, `NotesPanel`, and `EntityPanel` definitions; add `import { EntityPanel } from "@/atlas/entity/EntityPanel";`. Remove now-unused imports from `AtlasViewer.tsx` that were *only* used by the moved code (lint will flag them — remove exactly those). Leave the two `<EntityPanel … />` usage sites unchanged (they don't pass `readerAffordances`, so they default to `true`).

- [ ] **Step 5: Run the new test + player regression**

Run: `npx vitest run src/test/entity/EntityPanel.test.tsx`
Expected: PASS (3 tests).

Run the existing AtlasViewer/player tests (find them: `npx vitest run src/test -t "AtlasViewer"` and any `src/test/*viewer*`/`src/test/*atlas-view*`). Expected: still green (pure move, default `true` keeps behaviour).

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/atlas/entity/EntityPanel.tsx src/pages/AtlasViewer.tsx src/test/entity/EntityPanel.test.tsx
git commit -m "refactor(entity): extract shared EntityPanel from AtlasViewer + readerAffordances gate"
```

---

### Task B1.5: Slice B1 full gate

- [ ] **Step 1: Types** — Run: `npx tsc --noEmit` → clean.
- [ ] **Step 2: Tests** — Run: `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures.
- [ ] **Step 3: Lint** — Run: `npm run lint` → no new errors (pre-existing baseline only).
- [ ] **Step 4: Player-safety scans** — Run: `npm run atlas:publish` → secrets + derived scans clean; player build unaffected.
- [ ] **Step 5: Commit the gate marker**

```bash
git commit --allow-empty -m "chore(sliceB1): shared renderer + projection engine gate green"
```

---

# SLICE B2 — Entity Surface Renders Through the Shared Panel

### Task B2.1: `EntityReadingView` — project + render via shared panel

**Files:**
- Create: `src/atlas/entity/EntityReadingView.tsx`
- Test: `src/test/entity/EntityReadingView.test.tsx`

Takes a DM entity + the full entity map, projects it with `projectEntityForPlayer`, renders it through the shared `EntityPanel` (`readerAffordances={false}`), and shows a non-blocking "Not yet visible to players" note when `visibility ∉ {player,rumor}`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/entity/EntityReadingView.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityReadingView } from "@/atlas/entity/EntityReadingView";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id, title: p.title, type: p.type ?? "npc", visibility: p.visibility ?? "player",
    aliases: [], tags: [], images: [], body: p.body ?? "", bodyHtml: "",
    frontmatter: {}, sourcePath: "", links: [], backlinks: [],
  } as Entity;
}

describe("EntityReadingView", () => {
  it("renders the projected bio for a hidden entity (works pre-publish)", () => {
    const corven = ent({ id: "corven", title: "Corven", visibility: "dm",
      body: "Public.\n\n%%\nsecret\n%%\n" });
    render(
      <MemoryRouter>
        <EntityReadingView entity={corven} entitiesById={new Map([[corven.id, corven]])} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(screen.getByText(/not yet visible to players/i)).toBeInTheDocument();
  });
  it("omits the visibility note for a player-visible entity", () => {
    const e = ent({ id: "edric", title: "Edric", visibility: "player", body: "Hi." });
    render(
      <MemoryRouter>
        <EntityReadingView entity={e} entitiesById={new Map([[e.id, e]])} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/not yet visible to players/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/entity/EntityReadingView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/atlas/entity/EntityReadingView.tsx
import { useMemo } from "react";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

export function EntityReadingView({
  entity, entitiesById, placements = [], onOpenEntity, onClose, onShowOnMap,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  placements?: MapPlacement[];
  onOpenEntity?: (id: string) => void;
  onClose?: () => void;
  onShowOnMap?: (p: MapPlacement) => void;
}) {
  const projected = useMemo(
    () => projectEntityForPlayer(entity, buildProjectionContext(entitiesById)),
    [entity, entitiesById],
  );
  const notYetVisible = !PLAYER_VISIBLE.has(entity.visibility);
  return (
    <div className="flex flex-col h-full">
      {notYetVisible && (
        <div className="px-3 py-1.5 text-[11px] bg-amber-500/15 text-amber-200 border-b border-amber-500/30">
          Not yet visible to players — this is how it will look once its visibility is player/rumor.
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <EntityPanel
          entity={projected}
          placements={placements}
          entityById={entitiesById}
          onOpenEntity={onOpenEntity ?? (() => {})}
          onClose={onClose ?? (() => {})}
          onShowOnMap={onShowOnMap ?? (() => {})}
          readerAffordances={false}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/entity/EntityReadingView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/entity/EntityReadingView.tsx src/test/entity/EntityReadingView.test.tsx
git commit -m "feat(entity): EntityReadingView — projected player-faithful bio + not-yet-visible note"
```

---

### Task B2.2: Open in Reading by default, Edit toggle, keep A's local DM-notes toggle

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` (`renderCategory` helper, lines ~1131–1147)
- Test: `src/test/editor/entity-surface-reading-default.test.tsx`

`renderCategory` currently swaps the category browse node for the `EntityEditPanel` directly when an entity is being edited. Change it so opening an entity shows **Reading** (`EntityReadingView`) with an **Edit** button that flips to the existing `EntityEditPanel`; closing returns to browse. Sub-project A's `EntityEditPanel` (and its internal local "Show DM notes"/focus toggle) is unchanged and reachable via Edit.

- [ ] **Step 1: Read the host wiring**

Read `src/pages/AtlasPlacementEditor.tsx` around: `editingEntityId` (line ~419), `entityEditDraft` (line ~342), `editingEntity` lookup + `renderCategory` (lines ~1125–1147), the `reloadCanon` callback it references, and how `project.entities` / an entity→`Map` is available (for `entitiesById`).

- [ ] **Step 2: Write the failing test**

```tsx
// src/test/editor/entity-surface-reading-default.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Lightweight harness around the renderCategory contract: opening an entity
// shows Reading first, an Edit button flips to the edit form.
import { EntitySurface } from "@/atlas/entity/EntitySurface";
import type { Entity } from "@/atlas/content/schema";

const corven = {
  id: "corven", title: "Corven", type: "npc", visibility: "dm",
  aliases: [], tags: [], images: [], body: "# Corven\n\nbody\n", bodyHtml: "",
  frontmatter: {}, sourcePath: "content/w/npcs/corven.md", links: [], backlinks: [],
} as Entity;

describe("entity surface opens in Reading, Edit toggles", () => {
  it("shows Reading (projected bio) first, with an Edit affordance", () => {
    render(
      <EntitySurface
        entity={corven}
        entitiesById={new Map([[corven.id, corven]])}
        renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reading|done|back/i }));
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/editor/entity-surface-reading-default.test.tsx`
Expected: FAIL — `@/atlas/entity/EntitySurface` not found.

- [ ] **Step 4: Implement `EntitySurface` + wire it**

Create `src/atlas/entity/EntitySurface.tsx` — owns the Reading⇄Edit toggle so the host stays thin:

```tsx
// src/atlas/entity/EntitySurface.tsx
import { useState } from "react";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { EntityReadingView } from "@/atlas/entity/EntityReadingView";

export function EntitySurface({
  entity, entitiesById, renderEdit, onClose, placements, onOpenEntity, onShowOnMap,
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
        {editing ? (
          <button type="button" className="h-7 px-2 rounded border"
            onClick={() => setEditing(false)}>Back to reading</button>
        ) : (
          <button type="button" className="h-7 px-2 rounded border"
            onClick={() => setEditing(true)}>Edit</button>
        )}
        <button type="button" className="h-7 px-2 rounded border" onClick={onClose}>Close</button>
      </div>
      <div className="flex-1 overflow-hidden">
        {editing ? renderEdit() : (
          <EntityReadingView
            entity={entity}
            entitiesById={entitiesById}
            placements={placements}
            onOpenEntity={onOpenEntity}
            onShowOnMap={onShowOnMap}
          />
        )}
      </div>
    </div>
  );
}
```

In `src/pages/AtlasPlacementEditor.tsx`, add the import `import { EntitySurface } from "@/atlas/entity/EntitySurface";` and an entity-map memo if one is not already present:

```tsx
const entitiesById = useMemo(
  () => new Map((project?.entities ?? []).map((e) => [e.id, e])),
  [project],
);
```

Replace the `renderCategory` body so the edit panel is wrapped by `EntitySurface` (Reading default, Edit reveals the existing form):

```tsx
const renderCategory = (cat: string, node: React.ReactNode): React.ReactNode => {
  if (editingEntity && categoryForType(editingEntity.type) === cat && editingEntity.sourcePath) {
    return (
      <EntitySurface
        entity={editingEntity}
        entitiesById={entitiesById}
        onClose={() => setEditingEntityId(null)}
        renderEdit={() => (
          <EntityEditPanel
            sourcePath={editingEntity.sourcePath}
            draftApi={entityEditDraft}
            onClose={() => setEditingEntityId(null)}
            onSaved={() => { setEditingEntityId(null); void reloadCanon(); }}
          />
        )}
      />
    );
  }
  return node;
};
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/test/editor/entity-surface-reading-default.test.tsx src/test/entity/EntityReadingView.test.tsx`
Expected: PASS.

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx` → still PASS (Sub-project A panel + its local DM-notes toggle untouched).

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/entity/EntitySurface.tsx src/pages/AtlasPlacementEditor.tsx src/test/editor/entity-surface-reading-default.test.tsx
git commit -m "feat(editor): entity opens in player-faithful Reading by default; Edit toggles A's form"
```

---

### Task B2.3: Slice B2 full gate

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke** (`npm run atlas:build` then `npm run dev`, open `/atlas/edit`):
  - Open the Lore (or Characters) category → click an entity row → it opens in **Reading** showing the projected player bio; a hidden entity shows the "not yet visible to players" note and **no** `%%dm%%` content.
  - Click **Edit** → Sub-project A's form appears; the **"Show DM notes"** checkbox there still reveals `%%dm%%` (no capability gap). Back to reading → Reading again.
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceB2): entity surface via shared panel gate green"`

---

# SLICE B3 — Pin / Row Interaction Parity

### Task B3.1: Pin click + double-click open the entity (when not placing)

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` (marker `eventHandlers`, lines ~1499–1512; the CommandPalette entity branch, lines ~1688–1691)
- Test: `src/test/editor/pin-open-parity.test.tsx`

Today the marker `click` (when no pending placement) does `setActivePanel(categoryForType(e.type))` — opens the category panel, not the bio. Change it to also `setEditingEntityId(<entityId>)` so the entity opens (in Reading, via Slice B2). Add a `dblclick` handler doing the same. Pin-click-while-placing is unchanged.

- [ ] **Step 1: Read the handler**

Read `src/pages/AtlasPlacementEditor.tsx` lines ~1490–1515 (the marker `eventHandlers` object: `click` with the `pendingId` guard then `setActivePanel`) and the entity variable in scope (the placement's entity — note its id field, e.g. `e.id` / `placement.entityId`).

- [ ] **Step 2: Write the failing test**

```tsx
// src/test/editor/pin-open-parity.test.tsx
import { describe, it, expect, vi } from "vitest";

// Unit-test the click-intent helper so we don't need a full Leaflet mount.
import { resolvePinClickIntent } from "@/atlas/editor/pinClickIntent";

describe("pin click intent (player parity)", () => {
  it("while placing: returns place-anchor, never opens", () => {
    expect(resolvePinClickIntent({ pending: true, entityId: "corven" }))
      .toEqual({ kind: "place-anchor" });
  });
  it("not placing: opens the entity (matches player site)", () => {
    expect(resolvePinClickIntent({ pending: false, entityId: "corven" }))
      .toEqual({ kind: "open-entity", entityId: "corven" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/editor/pin-open-parity.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the helper + use it in the handler**

Create `src/atlas/editor/pinClickIntent.ts`:

```ts
// src/atlas/editor/pinClickIntent.ts
export type PinClickIntent =
  | { kind: "place-anchor" }
  | { kind: "open-entity"; entityId: string };

export function resolvePinClickIntent(
  args: { pending: boolean; entityId: string },
): PinClickIntent {
  if (args.pending) return { kind: "place-anchor" };
  return { kind: "open-entity", entityId: args.entityId };
}
```

In `src/pages/AtlasPlacementEditor.tsx`, import it and rewrite the marker `eventHandlers` (replace the existing `click` body; add `dblclick`). Use the actual in-scope entity-id expression (confirm from Step 1 — shown here as `e.id`):

```tsx
click: (ev) => {
  const intent = resolvePinClickIntent({ pending: !!pendingId, entityId: e.id });
  if (intent.kind === "place-anchor") {
    const ll = (ev.target as L.Marker).getLatLng();
    onMapClick(ll.lng, ll.lat);
    return;
  }
  setEditingEntityId(intent.entityId); // open the entity (Reading) — player parity
},
dblclick: () => {
  if (pendingId) return;
  setEditingEntityId(e.id);
},
```

Remove the now-dead `const cat = categoryForType(e.type); setActivePanel(cat);` stub. In the CommandPalette entity branch (lines ~1688–1691) keep `setEditingEntityId(ent.id)` and drop the redundant `setActivePanel(categoryForType(ent?.type))` if it only existed to surface the entity (keep it only if the category panel must be the host container for `renderCategory` to show the surface — verify against Slice B2's `renderCategory`; if the surface renders inside the active category panel, keep `setActivePanel` so the panel is open, otherwise remove it).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/test/editor/pin-open-parity.test.tsx`
Expected: PASS (2 tests).

Run: `npx vitest run src/test/editor/entity-surface-reading-default.test.tsx` → still PASS.

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/editor/pinClickIntent.ts src/pages/AtlasPlacementEditor.tsx src/test/editor/pin-open-parity.test.tsx
git commit -m "feat(editor): pin click + dblclick open the entity (player parity); remove category-panel stub"
```

---

### Task B3.2: Category row double-click opens the entity

**Files:**
- Modify: `src/atlas/categories/CategoryPanel.tsx` (row element)
- Test: `src/test/categories/CategoryPanel.test.tsx` (extend existing)

Sub-project A wired single-click row → open (`onOpen(id)`). Add `onDoubleClick` on the row calling the same `onOpen(id)` so double-click parity holds (single already opens; double must not select-text or dead-end).

- [ ] **Step 1: Read the row**

Read `src/atlas/categories/CategoryPanel.tsx` — the row `<div>`/`<button>` with the existing `onClick`/`onOpen(id)` and the props (`onOpen`). Read `src/test/categories/CategoryPanel.test.tsx` for the existing harness.

- [ ] **Step 2: Write the failing test (append)**

```tsx
// add to src/test/categories/CategoryPanel.test.tsx
it("double-clicking a row opens the entity (parity, no dead-end)", () => {
  const onOpen = vi.fn();
  // Reuse this file's existing render helper/fixtures; render CategoryPanel
  // with one entity row and onOpen={onOpen}. Match the existing tests' setup.
  // Then:
  const row = screen.getByText(/* the fixture entity title used above */ "Corven");
  fireEvent.doubleClick(row);
  expect(onOpen).toHaveBeenCalledWith(/* that entity's id */ "corven");
});
```

(Implementer: mirror the exact render/fixture pattern already in `CategoryPanel.test.tsx`; the assertion is just that `doubleClick` also calls `onOpen` with the id.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/categories/CategoryPanel.test.tsx -t "double-clicking a row"`
Expected: FAIL — no `onDoubleClick` wired.

- [ ] **Step 4: Implement**

In `src/atlas/categories/CategoryPanel.tsx`, on the same row element that has `onClick={() => onOpen(id)}`, add `onDoubleClick={() => onOpen(id)}` (same id expression as the existing onClick).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/categories/CategoryPanel.test.tsx`
Expected: PASS — new case green, existing cases still green.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/categories/CategoryPanel.tsx src/test/categories/CategoryPanel.test.tsx
git commit -m "feat(categories): row double-click opens the entity (interaction parity)"
```

---

### Task B3.3: Slice B3 full gate

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → scans clean.
- [ ] **Step 5: Browser smoke** (`npm run dev`, `/atlas/edit`): click a **pin** on the map (not placing) → the entity opens in Reading; double-click a **category row** → opens; placing a pin (with a pending placement) still anchors on existing-pin click (unchanged).
- [ ] **Step 6:** `git commit --allow-empty -m "chore(sliceB3): pin/row interaction parity gate green"`

---

# SLICE B4 — Global View Lens (Player ⇄ DM)

### Task B4.1: `ViewModeProvider` + `useViewMode` (persisted UI preference)

**Files:**
- Create: `src/atlas/view/ViewModeProvider.tsx`
- Test: `src/test/view/ViewModeProvider.test.tsx`

A React context holding `mode: "player" | "dm"`, persisted to localStorage, default `"dm"` (the editor's natural working mode). It is a UI preference, **not** Part 2 session work.

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/view/ViewModeProvider.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ViewModeProvider, useViewMode, VIEW_MODE_STORAGE_KEY } from "@/atlas/view/ViewModeProvider";

function Probe() {
  const { mode, setMode } = useViewMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setMode(mode === "dm" ? "player" : "dm")}>flip</button>
    </div>
  );
}

describe("ViewModeProvider", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to dm and flips + persists", () => {
    render(<ViewModeProvider><Probe /></ViewModeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("dm");
    act(() => { screen.getByText("flip").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("player");
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("player");
  });
  it("rehydrates from localStorage", () => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, "player");
    render(<ViewModeProvider><Probe /></ViewModeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("player");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/view/ViewModeProvider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/atlas/view/ViewModeProvider.tsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ViewMode = "player" | "dm";
export const VIEW_MODE_STORAGE_KEY = "atlas.viewMode";

interface Ctx { mode: ViewMode; setMode: (m: ViewMode) => void; }
const ViewModeContext = createContext<Ctx | null>(null);

function readInitial(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return v === "player" ? "player" : "dm";
  } catch {
    return "dm";
  }
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>(readInitial);
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);
  const setMode = useCallback((m: ViewMode) => setModeState(m), []);
  return (
    <ViewModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode(): Ctx {
  const c = useContext(ViewModeContext);
  if (!c) throw new Error("useViewMode must be used within ViewModeProvider");
  return c;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/view/ViewModeProvider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/view/ViewModeProvider.tsx src/test/view/ViewModeProvider.test.tsx
git commit -m "feat(view): ViewModeProvider — persisted global Player/DM lens (UI preference)"
```

---

### Task B4.2: Lens drives `EntityReadingView`; chrome toggle in the editor

**Files:**
- Modify: `src/atlas/entity/EntityReadingView.tsx` (read the lens)
- Modify: `src/pages/AtlasPlacementEditor.tsx` (wrap in `ViewModeProvider`; add the toggle to the header at lines ~1010–1015)
- Test: extend `src/test/entity/EntityReadingView.test.tsx`

In `player` mode `EntityReadingView` renders the projection (current behaviour). In `dm` mode it renders the entity **as-is** (no projection → `%%dm%%` and dm fields visible) through the same shared `EntityPanel`.

- [ ] **Step 1: Write the failing test (append)**

```tsx
// add to src/test/entity/EntityReadingView.test.tsx
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";

it("dm lens shows raw DM content; player lens hides it", () => {
  const corven = ent({ id: "corven", title: "Corven", visibility: "dm",
    body: "Public.\n\n%%\nsecret truth\n%%\n" });
  const tree = (
    <MemoryRouter>
      <ViewModeProvider>
        <EntityReadingView entity={corven} entitiesById={new Map([[corven.id, corven]])} />
      </ViewModeProvider>
    </MemoryRouter>
  );
  // Default lens = dm → secret visible.
  const { unmount } = render(tree);
  expect(screen.getByText(/secret truth/)).toBeInTheDocument();
  unmount();
  // Force player lens via storage.
  localStorage.setItem("atlas.viewMode", "player");
  render(tree);
  expect(screen.queryByText(/secret truth/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/entity/EntityReadingView.test.tsx -t "dm lens shows raw"`
Expected: FAIL — `EntityReadingView` does not yet read the lens (it always projects).

- [ ] **Step 3: Implement the lens read**

In `src/atlas/entity/EntityReadingView.tsx`, consume `useViewMode()` and only project in player mode. For DM mode, the entity still needs a rendered `bodyHtml` — render its body with `%%` **kept**, via the shared `parseWikilinks` + `marked` + `sanitizeAtlasHtml` (no redaction, no strip):

```tsx
import { useViewMode } from "@/atlas/view/ViewModeProvider";
import { marked } from "marked";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
// ...
const { mode } = useViewMode();
const view = useMemo(() => {
  if (mode === "player") {
    return projectEntityForPlayer(entity, buildProjectionContext(entitiesById));
  }
  // DM lens: render the raw body (keeps %%dm%%), no redaction.
  const byName = new Map<string, string>();
  for (const e of entitiesById.values()) {
    byName.set(e.title.toLowerCase(), e.id);
    for (const a of e.aliases ?? []) byName.set(a.toLowerCase(), e.id);
  }
  const { tokenized, links } = tokenizeWikilinks(entity.body ?? "", {
    resolveByName: (n) => byName.get(n.trim().toLowerCase()),
  });
  const html = marked.parse(tokenized, { async: false }) as string;
  const bodyHtml = sanitizeAtlasHtml(renderLinkTokens(html, links, {}));
  return { ...entity, bodyHtml };
}, [entity, entitiesById, mode]);
```

Use `view` where `projected` was passed to `<EntityPanel entity={…} />`. Keep the "not yet visible to players" note logic, but only show it in **player** mode (in DM mode the DM is intentionally seeing secrets):

```tsx
const notYetVisible = mode === "player" && !PLAYER_VISIBLE.has(entity.visibility);
```

In `src/pages/AtlasPlacementEditor.tsx`: wrap the editor tree in `<ViewModeProvider>` (at the top-level return, outermost), and add the toggle to the header right after the `<div className="flex-1" />` spacer (line ~1015). Add a small client component to avoid prop-drilling:

```tsx
// near other local components in AtlasPlacementEditor.tsx, or inline:
function ViewModeToggle() {
  const { mode, setMode } = useViewMode();
  return (
    <div className="inline-flex rounded border overflow-hidden text-xs" role="group" aria-label="View mode">
      <button type="button"
        className={mode === "dm" ? "px-2 py-1 bg-primary text-primary-foreground" : "px-2 py-1"}
        aria-pressed={mode === "dm"} onClick={() => setMode("dm")}>DM view</button>
      <button type="button"
        className={mode === "player" ? "px-2 py-1 bg-primary text-primary-foreground" : "px-2 py-1"}
        aria-pressed={mode === "player"} onClick={() => setMode("player")}>Player view</button>
    </div>
  );
}
```

Import `useViewMode`, `ViewModeProvider` from `@/atlas/view/ViewModeProvider`. Render `<ViewModeToggle />` in the header after the flex spacer.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/test/entity/EntityReadingView.test.tsx`
Expected: PASS (all — earlier cases now wrap in `ViewModeProvider`; if an earlier case rendered `EntityReadingView` without the provider, wrap it, since `useViewMode` throws outside the provider — update those earlier renders in this file to include `<ViewModeProvider>`).

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/entity/EntityReadingView.tsx src/pages/AtlasPlacementEditor.tsx src/test/entity/EntityReadingView.test.tsx
git commit -m "feat(view): global lens drives the entity reading view + chrome Player/DM toggle"
```

---

### Task B4.3: Category/rail lists honour the lens

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` (the entity list passed to `CategoryPanel`s)
- Test: `src/test/editor/category-list-lens.test.tsx`

In `player` lens, `dm`/`hidden` entities are not listed (they don't exist for players). In `dm` lens, all are listed.

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/editor/category-list-lens.test.tsx
import { describe, it, expect } from "vitest";
import { filterEntitiesForLens } from "@/atlas/view/filterEntitiesForLens";
import type { Entity } from "@/atlas/content/schema";

const mk = (id: string, visibility: Entity["visibility"]) =>
  ({ id, title: id, type: "npc", visibility, aliases: [], tags: [], images: [],
     body: "", bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [] } as Entity);

describe("filterEntitiesForLens", () => {
  const all = [mk("a", "player"), mk("b", "rumor"), mk("c", "dm"), mk("d", "hidden")];
  it("player lens hides dm/hidden", () => {
    expect(filterEntitiesForLens(all, "player").map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("dm lens shows all", () => {
    expect(filterEntitiesForLens(all, "dm").map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/editor/category-list-lens.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement + wire**

Create `src/atlas/view/filterEntitiesForLens.ts`:

```ts
// src/atlas/view/filterEntitiesForLens.ts
import type { Entity } from "@/atlas/content/schema";
import type { ViewMode } from "@/atlas/view/ViewModeProvider";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

export function filterEntitiesForLens(entities: Entity[], mode: ViewMode): Entity[] {
  if (mode === "dm") return entities;
  return entities.filter((e) => PLAYER_VISIBLE.has(e.visibility));
}
```

In `src/pages/AtlasPlacementEditor.tsx`, read `const { mode } = useViewMode();` in the component body and apply `filterEntitiesForLens(project.entities, mode)` to the entity list feeding the six `CategoryPanel`s (find where entities are grouped by category — apply the filter before grouping). Do **not** filter the data used for saving/import — filter only the *display* list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/editor/category-list-lens.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Types + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/atlas/view/filterEntitiesForLens.ts src/pages/AtlasPlacementEditor.tsx src/test/editor/category-list-lens.test.tsx
git commit -m "feat(view): category/rail lists honour the global lens (player hides dm/hidden)"
```

---

### Task B4.4: Retire the superseded local DM-notes preview

**Files:**
- Delete: `src/atlas/categories/EntityBodyPreview.tsx`
- Delete: its test (`src/test/categories/EntityBodyPreview.test.tsx` if it exists; otherwise remove the `EntityBodyPreview` cases from `src/test/categories/EntityEditPanel.test.tsx`)
- Modify: `src/atlas/categories/EntityEditPanel.tsx` (remove the `showDmNotes`/`focus` local preview + its toggle/checkbox; the edit form stays)
- Test: `src/test/categories/EntityEditPanel.test.tsx` (update)

The global lens now provides "see as player / see DM secrets" for the *reading* view. The Edit form is for editing source; its embedded body *preview* + local "Show DM notes" toggle (Sub-project A) is superseded. Remove the preview/toggle; keep the body textarea and Save.

- [ ] **Step 1: Read the panel + its tests**

Read `src/atlas/categories/EntityEditPanel.tsx` — the `showDmNotes`/`focus` state (lines ~23–24), the focus split rendering (lines ~145–171, uses `<EntityBodyPreview … />` line ~156), the checkbox/button (lines ~185–193). Read `src/test/categories/EntityEditPanel.test.tsx` to see which cases assert on the preview/toggle vs the edit/save flow.

- [ ] **Step 2: Update the tests first (red)**

In `src/test/categories/EntityEditPanel.test.tsx`: delete the test case(s) that assert on `EntityBodyPreview`/"Show DM notes"/focus mode. Keep (and keep passing) the load/edit/save case (`getByDisplayValue(/old body/)`, edit body, Save → `onSaved`). Add an explicit assertion that the preview/toggle are gone:

```tsx
it("edit panel has no embedded preview/DM-notes toggle (superseded by the global lens)", async () => {
  // render EntityEditPanel exactly as the existing load/edit/save test does
  // (reuse that test's fetch mock + render), then:
  await waitFor(() => screen.getByDisplayValue(/old body/));
  expect(screen.queryByText(/show dm notes/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /focus mode/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify the new expectation fails**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx -t "no embedded preview"`
Expected: FAIL — the toggle/preview still render.

- [ ] **Step 4: Implement the removal**

In `src/atlas/categories/EntityEditPanel.tsx`: remove the `showDmNotes` and `focus` state, the `import { EntityBodyPreview } from "./EntityBodyPreview";`, the focus split branch, the `<EntityBodyPreview … />` usage, and the "Show DM notes" checkbox + "Focus mode" button. Keep the body `<textarea aria-label="Body" …>` (single-column always) and the Save/Close footer. Delete `src/atlas/categories/EntityBodyPreview.tsx`. Delete `src/test/categories/EntityBodyPreview.test.tsx` if it exists. Grep the repo for any other `EntityBodyPreview` import and remove it (`npx vitest` will fail on dangling imports otherwise).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/test/categories/EntityEditPanel.test.tsx`
Expected: PASS — load/edit/save still green; the "no embedded preview" case green; no dangling-import failures elsewhere.

- [ ] **Step 6: Types + commit**

Run: `npx tsc --noEmit` → clean (no unresolved `EntityBodyPreview`).

```bash
git add -A src/atlas/categories/ src/test/categories/
git commit -m "refactor(categories): retire superseded EntityBodyPreview/local DM-notes toggle (global lens supersedes)"
```

---

### Task B4.5: Slice B4 full gate (Sub-project B done)

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test -- --run` → green except the two pre-existing `fake-indexeddb` failures; no new failures; no dangling `EntityBodyPreview` references.
- [ ] **Step 3:** `npm run lint` → no new errors.
- [ ] **Step 4:** `npm run atlas:publish` → secrets + derived scans clean; player build still tree-shakes the editor; **no `%%`/dm content in player output**.
- [ ] **Step 5: Full browser smoke (the spec's §G.3 done criterion):**
  - `npm run atlas:build` then `npm run dev`, open `/atlas/edit`.
  - Header shows the **DM view / Player view** toggle. Default = DM view.
  - Open a **hidden/draft** entity (pin click or row) → Reading shows it with `%%dm%%` visible (DM lens).
  - Flip the header to **Player view** → the same entity re-renders exactly as the player site would (secrets stripped, links to other hidden entities → `…`), with the "not yet visible to players" note. Category lists drop the hidden entities.
  - Flip back to **DM view** → secrets return; hidden entities back in the lists.
  - Click **Edit** → Sub-project A's form (no embedded preview/toggle now); fix a line; Save → returns to Reading in the active lens; change persisted.
  - On the real player site nothing leaked; `npm run atlas:publish` clean.
- [ ] **Step 6:**

```bash
git commit --allow-empty -m "chore(sliceB4): global Player/DM lens gate green — Sub-project B complete"
```

---

## Self-Review

**1. Spec coverage**

- §A.1 shared `EntityPanel` + `readerAffordances` → Task B1.4. ✓
- §A.2 `projectEntityForPlayer` (mirrors build; reuses shared units) → Tasks B1.1 (parseWikilinks share), B1.2 (function), B1.3 (build-parity lock). The §A.2 `renderEntityMarkdown` mechanism is deliberately corrected to the build's real pipeline (documented in the plan header) — the spec *goal* (faithful, parity-locked projection) is met. ✓
- §A.3 `ViewModeProvider`/`useViewMode`, persisted, not session work → Task B4.1 (+ test asserts localStorage, default, rehydrate; B4.1 does not touch Part 2 — no session wiring added, so it cannot register as work). ✓
- §B Slice B1 (extract+share, parity test) → B1.1–B1.5. ✓
- §C Slice B2 (Reading default, Edit orthogonal, A's local toggle kept) → B2.1–B2.3. ✓
- §D Slice B3 (pin+row click/dblclick → open; remove stub; Ctrl-K kept) → B3.1–B3.3. ✓
- §E Slice B4 (global toggle, lens-driven surfaces, category lists, delete superseded) → B4.1–B4.5. ✓
- §F ordering B1→B2→B3→B4, dependencies → reflected in slice order + each gate. ✓
- §G.1 unit (projection parity linchpin; readerAffordances snapshot; useViewMode not session work) → B1.3, B1.4 test, B4.1 test. ✓
- §G.2 regression (player site identical; A panel still works; player build clean) → B1.4 Step 5, B2.3/B3.3/B4.5 gates. ✓
- §G.3 full gate + browser smoke → each slice gate task; the §G.3 done criterion is B4.5 Step 5. ✓
- §H risks (projection drift → B1.3 parity; extraction regression → B1.4; B2↔B4 capability gap → B2 keeps A's toggle, deleted only in B4.4; lens-as-work → B4.1 test) → covered. ✓
- §I independently shippable → every slice ends in its own green gate marker commit. ✓

No spec requirement is left without a task.

**2. Placeholder scan**

- B1.2 notes `as never` only as a *fallback* with an explicit instruction to use the real `filterRelationshipsForPlayer` options by reading `profileBuild.ts` and the build call site — a bounded decision rule with a hard oracle (the B1.3 parity test), not an open TODO.
- B1.3 lists concrete drift-fix guidance with exact build line ranges; the acceptance oracle is the real player `atlas.json`. The one soft spot — the exact build output-dir CLI flag — is explicitly delegated with "match `src/test/atlas-build.test.ts` exactly" (that file is the authority; the implementer reads it in Step 1). Concrete, not a placeholder.
- B3.2 and B4.4 test snippets say "reuse this file's existing render helper/fixtures" — this is a deliberate instruction to match existing harness conventions (the files exist and are read in Step 1), with the exact assertion given. Acceptable (same pattern Sub-project A's plan used for extend-existing-test tasks).
- No "TBD"/"implement later"/bare "add error handling" anywhere.

**3. Type consistency**

- `projectEntityForPlayer(entity, ctx: ProjectionContext)` + `buildProjectionContext(Map): ProjectionContext` — defined B1.2, consumed identically in B1.3, B2.1, B4.2. ✓
- `tokenizeWikilinks`/`renderLinkTokens` signatures from `@/atlas/content/parseWikilinks` — established B1.1, reused B1.2 + B4.2 with the same call shape. ✓
- `EntityPanel` props = existing + `readerAffordances?: boolean` — B1.4; consumed by `EntityReadingView` (B2.1) with `readerAffordances={false}`. ✓
- `EntityReadingView` props (`entity`, `entitiesById`, optional `placements`/`onOpenEntity`/`onClose`/`onShowOnMap`) — B2.1; reused unchanged in B2.2 (`EntitySurface`) and B4.2. ✓
- `EntitySurface` props (`entity`, `entitiesById`, `renderEdit`, `onClose`, …) — B2.2; host passes the existing `EntityEditPanel` via `renderEdit`. ✓
- `ViewMode`/`useViewMode`/`VIEW_MODE_STORAGE_KEY`/`ViewModeProvider` — B4.1; consumed B4.2 (`EntityReadingView`, toggle), B4.3 (`filterEntitiesForLens` type import). ✓
- `resolvePinClickIntent` / `PinClickIntent` — B3.1, self-contained. ✓
- `filterEntitiesForLens(entities, mode)` — B4.3, self-contained, imports `ViewMode` from B4.1. ✓

No signature/name drift. Plan is internally consistent and complete.
