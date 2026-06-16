# Obsidian Read-Only Merge ("Sync from Obsidian") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make re-importing Obsidian notes safe and repeatable — a one-button "Sync from Obsidian" that merges updated prose into existing entities, provably preserves atlas-side work (pins/visibility/relationships), never writes to the vault, and never silently exposes anything to players.

**Architecture:** A pure client-side merge function (`mergeImportFrontmatter`) starts from the on-disk entity frontmatter and overlays only the vault's content keys, then rides the existing `saveAtlasPatchToLocalFs` → `/__atlas/save` path (baseHash conflict guard + `.atlas-backups`). A new read-only dev endpoint (`/__atlas/vault-scan`) reads the configured vault folder; a machine-local `.local-atlas/editor-settings.json` holds the vault path + ignore globs; a new Sync panel drives it.

**Tech Stack:** TypeScript, React, Vite (dev plugin middleware), Vitest, `js-yaml` (via existing `parseFrontmatter`/`stringifyFrontmatter`), `picomatch` (new dep for ignore globs).

**Spec:** `docs/superpowers/specs/2026-06-16-obsidian-readonly-merge-design.md` (read it first — this plan implements it section-by-section).

---

## Conventions for every task

- **Test runner:** `npx vitest run <path-to-test-file>` for a single file (fast). Do NOT run the whole suite per task — the full `npm test` OOMs the coordinator (known issue); only run the file(s) you touched. The final ship-gate task runs the sharded suite.
- **TDD:** write the failing test → run it (see it fail) → minimal implementation → run it (see it pass) → commit. Each step below is one action.
- **Commits:** small and frequent, one per task. Conventional-commit prefixes (`feat:`, `test:`, `refactor:`).
- **Do not hand-edit generated artifacts** (`public/atlas/atlas.json`, `.local-atlas/`, `dist/`). A pre-tool hook enforces this.
- **Player-secrecy is the prime directive.** Phase 1 must be fully green before any other phase ships.

---

## File structure (what gets created / modified)

**New:**
- `src/atlas/import/mergeImportFrontmatter.ts` — the pure merge (Phase 1).
- `src/atlas/import/ignoreRules.ts` — shared picomatch + built-in ignore predicate (Phase 3).
- `src/atlas/sync/useSyncSettings.ts` — load/save `.local-atlas/editor-settings.json` + `sync-map.json` (Phase 3/4).
- `src/atlas/sync/SyncPanel.tsx` — the "Sync from Obsidian" panel (Phase 4).
- `src/test/import/mergeImportFrontmatter.test.ts`, `src/test/import/ignoreRules.test.ts`, `src/test/import/vault-scan.test.ts` — new tests.

**Modified:**
- `src/atlas/import/buildImportChanges.ts` — route update/rename-link rows through the merge (Phase 1).
- `src/atlas/import/stagingState.ts` — `needsReview` flag, identity precedence, threaded visibility map (Phase 1/2).
- `src/atlas/import/useMdImportFlow.ts` — `openWithVaultScan()`, DM-build precondition, toasts (Phase 2/4).
- `src/atlas/import/summarizeImport.ts` — `needsReview` bucket (Phase 4).
- `scripts/vite-plugin-atlas-save.ts` — `/__atlas/vault-scan` + `.local-atlas` config routes (Phase 3).
- `src/atlas/save/sourcePathAllowlist.ts` — `isReadableVaultPath`, `isReadableLocalAtlasPath` (Phase 3).
- `src/atlas/shell/railRegistry.tsx` + `src/pages/AtlasPlacementEditor.tsx` — mount Sync panel; **delete ImportPanel** (Phase 4).
- `package.json` — add `picomatch` (Phase 3).

**Deleted:**
- `src/atlas/import/ImportPanel.tsx` (+ unmount) — removes the leftover Export Patch flow (Phase 4, D8).

---

# PHASE 1 — Merge engine + secrecy core (no UI)

> Delivers "never lose work" and "never auto-expose" provably, before any UI. Independently shippable.

## Task 1.1: `resolveEffectiveVisibility` + exposure detection (pure helpers)

**Files:**
- Create: `src/atlas/import/mergeImportFrontmatter.ts`
- Test: `src/test/import/mergeImportFrontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/import/mergeImportFrontmatter.test.ts
import { describe, it, expect } from "vitest";
import { resolveEffectiveVisibility, detectExposureIncrease } from "@/atlas/import/mergeImportFrontmatter";

describe("resolveEffectiveVisibility (mirrors build-atlas.ts:345)", () => {
  it("uses explicit visibility when valid", () => {
    expect(resolveEffectiveVisibility({ visibility: "dm" })).toBe("dm");
    expect(resolveEffectiveVisibility({ visibility: "rumor" })).toBe("rumor");
  });
  it("defaults to player when no visibility and publish !== false", () => {
    expect(resolveEffectiveVisibility({})).toBe("player");
    expect(resolveEffectiveVisibility({ publish: true })).toBe("player");
  });
  it("defaults to dm only when publish === false", () => {
    expect(resolveEffectiveVisibility({ publish: false })).toBe("dm");
  });
  it("ignores an invalid visibility string and falls back", () => {
    expect(resolveEffectiveVisibility({ visibility: "bogus" })).toBe("player");
  });
});

describe("detectExposureIncrease", () => {
  it("flags disk dm + vault wanting player exposure", () => {
    expect(detectExposureIncrease("dm", { visibility: "player" })).toBe(true);
    expect(detectExposureIncrease("dm", { publish: true })).toBe(true);
    expect(detectExposureIncrease("hidden", { visibility: "rumor" })).toBe(true);
  });
  it("does NOT flag when disk is already player-visible", () => {
    expect(detectExposureIncrease("player", { publish: true })).toBe(false);
    expect(detectExposureIncrease("rumor", { visibility: "player" })).toBe(false);
  });
  it("does NOT flag when vault is silent or less exposed", () => {
    expect(detectExposureIncrease("dm", {})).toBe(false);
    expect(detectExposureIncrease("dm", { visibility: "dm" })).toBe(false);
    expect(detectExposureIncrease("dm", { publish: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/mergeImportFrontmatter.test.ts`
Expected: FAIL — "resolveEffectiveVisibility is not a function" (module not created yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/atlas/import/mergeImportFrontmatter.ts
import type { EntityVisibility } from "@/atlas/content/schema";

const VALID_VIS = new Set<EntityVisibility>(["player", "dm", "hidden", "rumor"]);
const PLAYER_VISIBLE = new Set<EntityVisibility>(["player", "rumor"]);

/** Effective visibility build-atlas.ts:345 would derive from a frontmatter atlas block. */
export function resolveEffectiveVisibility(atlas: Record<string, unknown>): EntityVisibility {
  const v = atlas.visibility;
  if (typeof v === "string" && VALID_VIS.has(v as EntityVisibility)) return v as EntityVisibility;
  return atlas.publish === false ? "dm" : "player";
}

/** True iff disk is hidden-tier AND the vault copy would expose it to players. */
export function detectExposureIncrease(
  diskEffective: EntityVisibility,
  vaultAtlas: Record<string, unknown>,
): boolean {
  if (PLAYER_VISIBLE.has(diskEffective)) return false; // already visible — not an increase
  const vaultVis = vaultAtlas.visibility;
  const vaultWantsExposure =
    (typeof vaultVis === "string" && PLAYER_VISIBLE.has(vaultVis as EntityVisibility)) ||
    vaultAtlas.publish === true;
  return vaultWantsExposure;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/mergeImportFrontmatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/mergeImportFrontmatter.ts src/test/import/mergeImportFrontmatter.test.ts
git commit -m "feat(merge): visibility resolution + exposure detection helpers"
```

## Task 1.2: `resolveType` (the §3.6 two-way / 3-way merge)

**Files:**
- Modify: `src/atlas/import/mergeImportFrontmatter.ts`
- Test: `src/test/import/mergeImportFrontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/test/import/mergeImportFrontmatter.test.ts
import { resolveType } from "@/atlas/import/mergeImportFrontmatter";

describe("resolveType (two-way, base = last-synced vault type)", () => {
  it("no base recorded → vault wins (first sync)", () => {
    expect(resolveType({ diskType: "npc", vaultType: "faction", baseType: undefined }))
      .toEqual({ type: "faction", conflict: false });
  });
  it("vault changed, disk unchanged → vault wins", () => {
    expect(resolveType({ diskType: "npc", vaultType: "faction", baseType: "npc" }))
      .toEqual({ type: "faction", conflict: false });
  });
  it("disk changed, vault unchanged → disk kept", () => {
    expect(resolveType({ diskType: "location", vaultType: "npc", baseType: "npc" }))
      .toEqual({ type: "location", conflict: false });
  });
  it("neither changed → disk (no-op)", () => {
    expect(resolveType({ diskType: "npc", vaultType: "npc", baseType: "npc" }))
      .toEqual({ type: "npc", conflict: false });
  });
  it("both changed → conflict, disk kept unless ticked", () => {
    expect(resolveType({ diskType: "location", vaultType: "faction", baseType: "npc" }))
      .toEqual({ type: "location", conflict: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/mergeImportFrontmatter.test.ts`
Expected: FAIL — "resolveType is not a function".

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to src/atlas/import/mergeImportFrontmatter.ts
export function resolveType(args: {
  diskType: string;
  vaultType: string;
  baseType: string | undefined;
}): { type: string; conflict: boolean } {
  const { diskType, vaultType, baseType } = args;
  if (baseType === undefined) return { type: vaultType, conflict: false }; // first sync
  const diskChanged = diskType !== baseType;
  const vaultChanged = vaultType !== baseType;
  if (vaultChanged && !diskChanged) return { type: vaultType, conflict: false };
  if (!vaultChanged && diskChanged) return { type: diskType, conflict: false };
  if (!vaultChanged && !diskChanged) return { type: diskType, conflict: false };
  return { type: diskType, conflict: true }; // both changed → keep disk, flag for review
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/mergeImportFrontmatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/mergeImportFrontmatter.ts src/test/import/mergeImportFrontmatter.test.ts
git commit -m "feat(merge): two-way type resolution via last-synced base"
```

## Task 1.3: `mergeImportFrontmatter` (the disk-base merge)

**Files:**
- Modify: `src/atlas/import/mergeImportFrontmatter.ts`
- Test: `src/test/import/mergeImportFrontmatter.test.ts`

> **Verify-first note (tags/aliases location):** Before implementing, confirm where the build reads
> entity tags/aliases. `scripts/atlas/parseFrontmatter.ts` declares `atlas.tags`/`atlas.aliases`, and
> `build-atlas.ts` reads them there (~:460-461). But `rewriteFrontmatter` historically wrote a
> **top-level** `tags`. Read `build-atlas.ts` around the entity-tag read and grep the player projection
> (`projectEntityForPlayer.ts`) for `tags`/`aliases` to confirm the authoritative location. Implement the
> union at that location. The test below assumes **`atlas.tags` / `atlas.aliases`** (the typed
> interface); adjust if the grep shows otherwise.

- [ ] **Step 1: Write the failing test** (the core §9 matrix — base, atlas-owned preservation, content overlay, top-level, union, visibility)

```typescript
// append to src/test/import/mergeImportFrontmatter.test.ts
import { mergeImportFrontmatter } from "@/atlas/import/mergeImportFrontmatter";

const parsed = (data: Record<string, unknown>, content = "body") => ({ data, content });

describe("mergeImportFrontmatter (disk-base merge)", () => {
  it("preserves atlas-owned keys verbatim incl. unknown + legacy x/y", () => {
    const disk = parsed({
      atlas: {
        id: "corven", type: "npc", visibility: "dm",
        placements: [{ mapId: "m1", x: 1, y: 2 }],
        relationships: [{ to: "x" }], profile: { dm: { secret: "A" } },
        x: 9, y: 9,            // legacy coords
        fooBar: "keep-me",     // unknown future key
      },
    }, "OLD BODY");
    const vault = parsed({ atlas: { summary: "new summary" } }, "NEW BODY");
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.placements).toEqual([{ mapId: "m1", x: 1, y: 2 }]);
    expect(a.relationships).toEqual([{ to: "x" }]);
    expect(a.profile).toEqual({ dm: { secret: "A" } });
    expect(a.x).toBe(9); expect(a.y).toBe(9);
    expect(a.fooBar).toBe("keep-me");
    expect(a.id).toBe("corven");
    expect(a.summary).toBe("new summary"); // content overlaid from vault
    expect(r.content).toBe("NEW BODY");    // prose from vault
  });

  it("always writes an explicit visibility = disk effective (never omitted)", () => {
    const disk = parsed({ atlas: { id: "x", publish: false } }); // effective dm, no visibility key
    const vault = parsed({ atlas: {} });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
    expect(r.diskVisibility).toBe("dm");
    expect(r.exposureIncrease).toBe(false);
  });

  it("flags exposure increase but keeps disk visibility in the data", () => {
    const disk = parsed({ atlas: { id: "x", visibility: "dm" } });
    const vault = parsed({ atlas: { publish: true } });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect(r.exposureIncrease).toBe(true);
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm"); // NOT exposed in data
  });

  it("top-level Obsidian props: vault wins (and deletions propagate)", () => {
    const disk = parsed({ role: "stale", title: "Old", atlas: { id: "x", visibility: "dm" } });
    const vault = parsed({ role: "active", title: "New", atlas: {} });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "note", baseType: "note" });
    expect(r.data.role).toBe("active");
    expect(r.data.title).toBe("New");
  });

  it("unions tags/aliases and appends the resolved type as a tag", () => {
    const disk = parsed({ atlas: { id: "x", visibility: "dm", tags: ["a"], aliases: ["A1"] } });
    const vault = parsed({ atlas: { tags: ["b"], aliases: ["A2"] } });
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    const a = r.data.atlas as Record<string, unknown>;
    expect(a.tags).toEqual(expect.arrayContaining(["a", "b", "npc"]));
    expect(a.aliases).toEqual(expect.arrayContaining(["A1", "A2"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/mergeImportFrontmatter.test.ts`
Expected: FAIL — "mergeImportFrontmatter is not a function".

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to src/atlas/import/mergeImportFrontmatter.ts
import type { ParsedFrontmatter } from "@/atlas/import/frontmatter";

const VAULT_CONTENT_KEYS = ["summary", "race", "date", "dateValue", "images", "canon", "world"] as const;

function unionStrings(...sources: unknown[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    const arr = Array.isArray(s) ? s : typeof s === "string" && s.trim() ? [s.trim()] : [];
    for (const v of arr) if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}

export interface MergeImportInput {
  disk: ParsedFrontmatter;          // parsed on-disk entity (.md)
  vault: ParsedFrontmatter;         // parsed vault note
  inferredType: string;             // type inferred from the vault note (as today)
  baseType: string | undefined;     // last-synced vault type from sync-map (§3.6)
}
export interface MergeImportResult {
  data: Record<string, unknown>;
  content: string;
  diskVisibility: EntityVisibility; // effective, pre-merge
  exposureIncrease: boolean;
  typeConflict: boolean;
}

export function mergeImportFrontmatter(input: MergeImportInput): MergeImportResult {
  const diskData = input.disk.data;
  const vaultData = input.vault.data;
  const diskAtlas = (diskData.atlas as Record<string, unknown>) ?? {};
  const vaultAtlas = (vaultData.atlas as Record<string, unknown>) ?? {};

  // (1) base = disk atlas verbatim (preserves placements, x/y, relationships, profile, id, unknowns)
  const atlas: Record<string, unknown> = { ...diskAtlas };

  // (2) overlay vault content keys
  for (const k of VAULT_CONTENT_KEYS) {
    if (vaultAtlas[k] !== undefined) atlas[k] = vaultAtlas[k];
  }

  // (3) two-way type, then append type as a tag (preserve today's behavior)
  const diskType = typeof diskAtlas.type === "string" ? diskAtlas.type : input.inferredType;
  const { type: resolvedType, conflict: typeConflict } = resolveType({
    diskType, vaultType: input.inferredType, baseType: input.baseType,
  });
  atlas.type = resolvedType;
  atlas.tags = unionStrings(diskAtlas.tags, vaultAtlas.tags, [resolvedType]);
  const aliases = unionStrings(diskAtlas.aliases, vaultAtlas.aliases);
  if (aliases.length > 0) atlas.aliases = aliases;

  // (4) visibility: disk effective, ALWAYS explicit; detect exposure increase
  const diskVisibility = resolveEffectiveVisibility(diskAtlas);
  const exposureIncrease = detectExposureIncrease(diskVisibility, vaultAtlas);
  atlas.visibility = diskVisibility;

  // (5) top-level: vault wins entirely; then set merged atlas; body from vault
  const data: Record<string, unknown> = { ...vaultData, atlas };

  return { data, content: input.vault.content, diskVisibility, exposureIncrease, typeConflict };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/mergeImportFrontmatter.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/mergeImportFrontmatter.ts src/test/import/mergeImportFrontmatter.test.ts
git commit -m "feat(merge): disk-base mergeImportFrontmatter (preserve atlas work, overlay vault prose)"
```

## Task 1.4: Wire the merge into `buildImportChanges` for update rows

**Files:**
- Modify: `src/atlas/import/buildImportChanges.ts:64-82`
- Test: `src/test/import/build-import-changes.test.ts` (extend existing)

> Current code (`:64-82`) calls `rewriteFrontmatter(row.rawContent, …)` for ALL rows — the data-loss
> line. We change update rows to parse the **fresh on-disk** content + the vault row content, run the
> merge, and serialize. Create/path-collision rows keep `rewriteFrontmatter` BUT with the create-row
> `dm` default for visibility (see Phase 1 secrecy: a new note never auto-publishes). The row carries
> `baseType` (from the sync-map; Phase 2 populates it — default `undefined` here) and the merge's
> `exposureIncrease`/`typeConflict` are surfaced via the row's `needsReview` flag (set in stagingState,
> Task 1.6 below). `buildImportChanges` only ACTS on already-approved rows.

- [ ] **Step 1: Write the failing test** (round-trip: update row keeps atlas data, updates prose)

```typescript
// extend src/test/import/build-import-changes.test.ts
import { buildImportChanges } from "@/atlas/import/buildImportChanges";

it("update row merges: keeps placements/visibility from disk, takes prose from vault", async () => {
  const diskRaw = [
    "---", "atlas:", "  id: corven", "  type: npc", "  visibility: dm",
    "  placements:", "    - mapId: m1", "      x: 10", "      y: 20",
    "---", "OLD PROSE",
  ].join("\n");
  const vaultRaw = ["---", "atlas:", "  summary: updated", "---", "NEW PROSE"].join("\n");

  const fetchFn = (async (url: string) => ({
    ok: true, status: 200,
    json: async () => ({ contents: diskRaw }),
  })) as unknown as typeof fetch;

  const rows = [{
    id: "r1", filename: "corven.md", inferredType: "npc",
    resolvedId: "corven", targetPath: "content/w/npcs/corven.md", pathAllowed: true,
    rowKind: "update" as const, included: true, content: vaultRaw, rawContent: vaultRaw,
    typeWasExplicit: true, typeWasGuessed: false, resolvedVisibility: "dm",
    // baseType comes from sync-map in Phase 2; undefined here:
  }];
  const changes = await buildImportChanges(rows as never, { fetchFn });
  expect(changes).toHaveLength(1);
  expect(changes[0].content).toContain("NEW PROSE");
  expect(changes[0].content).not.toContain("OLD PROSE");
  expect(changes[0].content).toContain("placements"); // atlas work preserved
  expect(changes[0].content).toContain("visibility: dm");
  expect(changes[0].baseHash).toMatch(/^sha256:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/import/build-import-changes.test.ts`
Expected: FAIL — current code rewrites from vault text, so `placements` is absent → assertion fails.

- [ ] **Step 3: Write minimal implementation** (replace the merge body in `buildImportChanges`)

```typescript
// src/atlas/import/buildImportChanges.ts — imports
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";
import { mergeImportFrontmatter } from "./mergeImportFrontmatter";
// keep rewriteFrontmatter import for create/path-collision rows

// inside the for-loop, replace lines 65-81:
let baseHash: string | null = null;
let content: string;
if (row.rowKind === "update") {
  const currentRaw = await readSourceFile(row.targetPath, fetchFn);
  baseHash = await hashContent(currentRaw);
  const merged = mergeImportFrontmatter({
    disk: parseFrontmatter(currentRaw),
    vault: parseFrontmatter(row.rawContent),
    inferredType: row.inferredType,
    baseType: row.baseType, // from sync-map (Phase 2); undefined → vault wins on type
  });
  content = stringifyFrontmatter(merged.content, merged.data);
} else {
  // create / path-collision: no atlas data to preserve. New entities import DM-only
  // unless the row was explicitly approved as a secrecy-increase (Phase 1 secrecy rule).
  if (row.rowKind === "path-collision") {
    baseHash = await hashContent(await readSourceFile(row.targetPath, fetchFn));
  }
  const safeVisibility = row.needsReview?.reason === "secrecy-increase"
    ? row.resolvedVisibility            // DM ticked exposure → honor vault visibility
    : "dm";                             // default new entities to DM-only
  content = rewriteFrontmatter(row.rawContent, {
    id: row.resolvedId,
    type: row.inferredType,
    visibility: safeVisibility,
    tagsAdd: row.inferredType ? [row.inferredType] : [],
  });
}
changes.push({ path: row.targetPath, content, kind: "entity-md", baseHash });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/import/build-import-changes.test.ts`
Expected: PASS. (Add a second test: a `create` row with vault `publish: true` and no `needsReview` → output `visibility: dm`.)

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/buildImportChanges.ts src/test/import/build-import-changes.test.ts
git commit -m "feat(merge): update rows merge instead of overwrite; new entities default DM-only"
```

## Task 1.5: Leak-regression — re-import never exposes, real blocks stripped

**Files:**
- Modify: `src/test/entity/player-preview-leak-regression.test.tsx` (add a describe block)

- [ ] **Step 1: Write the failing/anchoring test**

```typescript
// add to player-preview-leak-regression.test.tsx
import { mergeImportFrontmatter } from "@/atlas/import/mergeImportFrontmatter";
import { stripDmBlocks } from "@/atlas/content/stripDmBlocks";

describe("re-import merge: never auto-exposes, strips real DM blocks", () => {
  it("DM-only entity re-synced from a visibility-less vault copy stays dm", () => {
    const disk = { data: { atlas: { id: "villain", visibility: "dm" } }, content: "secret plans" };
    const vault = { data: { atlas: {} }, content: "updated public lore %%dm only note%%" };
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
    expect(r.exposureIncrease).toBe(false);
  });
  it("a real (non-sentinel) %% %% and :::dm::: block in merged prose is stripped on the player path", () => {
    const body = "Public.\n%%hidden plot twist%%\n:::dm\nGM only\n:::\nMore public.";
    const out = stripDmBlocks(body);
    expect(out.text).not.toContain("hidden plot twist");
    expect(out.text).not.toContain("GM only");
    expect(out.text).toContain("Public.");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/test/entity/player-preview-leak-regression.test.tsx` — Expected: PASS (these assert the existing pipeline + the merge from Task 1.3 already behave correctly). If either fails, the merge or strip has a real hole — fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/test/entity/player-preview-leak-regression.test.tsx
git commit -m "test(merge): re-import leak-regression (no auto-expose, real DM blocks stripped)"
```

## Task 1.6: `needsReview` flag in stagingState (surface exposure/type conflicts)

**Files:**
- Modify: `src/atlas/import/stagingState.ts` (add `needsReview` + `baseType` to `StagingRow`; default-off inclusion when present)
- Test: `src/test/import/import-staging-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// extend import-staging-state.test.ts — a row flagged needsReview defaults to included=false
it("a needsReview row defaults to NOT included and requires explicit opt-in", () => {
  // build a row via buildStagingRow with a context that produces an exposure increase,
  // OR directly assert updateStagingRow honors patch.included for a needsReview row.
  // (Construct per the existing test helpers in this file.)
});
```

- [ ] **Step 2–4:** Add to `StagingRow`: `baseType?: string;` and `needsReview?: { reason: "secrecy-increase" | "rename-link" | "type-conflict" }`. In `buildStagingRow`, when an update row's merge would produce `exposureIncrease` or `typeConflict`, set `needsReview` and `included = false`. Keep the existing `included` gate (`!parseError && pathAllowed && <ticked>`). Run the test; iterate to green.

> NOTE: `buildStagingRow` is pure and lacks disk frontmatter. Computing `exposureIncrease`/`typeConflict`
> at staging time requires the DM-canon visibility + type for the matched entity — Phase 2 threads an
> `id → { visibility, type, sourcePath }` map into `StagingContext`. Until Phase 2, this task only adds
> the FIELDS + the inclusion rule; the population of `needsReview` lands in Phase 2 Task 2.3.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/import/stagingState.ts src/test/import/import-staging-state.test.ts
git commit -m "feat(staging): needsReview flag + baseType field (off-by-default inclusion)"
```

---

# PHASE 2 — Identity hardening

> sync-map, precedence override, collision guard, DM-build precondition. Builds on Phase 1.

## Task 2.1: sync-map read/write hook

**Files:**
- Create: `src/atlas/sync/useSyncSettings.ts` (and a pure `syncMap.ts` for the data ops)
- Test: `src/test/import/sync-map.test.ts`

- [ ] Implement a pure module `src/atlas/import/syncMap.ts`:
  ```typescript
  export interface SyncMapEntry { id: string; baseType: string; }
  export type SyncMap = Record<string, SyncMapEntry>; // keyed by vault-relative POSIX path
  export function lookupByPath(map: SyncMap, relPath: string): SyncMapEntry | undefined { return map[relPath]; }
  export function recordSync(map: SyncMap, relPath: string, id: string, baseType: string): SyncMap {
    return { ...map, [relPath]: { id, baseType } };
  }
  ```
- [ ] TDD: test `lookupByPath` / `recordSync` (pure). The endpoint read/write of `.local-atlas/sync-map.json` lands in Phase 3 (Task 3.4); this task is just the pure data ops + their tests.
- [ ] Commit: `feat(sync): pure sync-map data ops`.

## Task 2.2: Identity precedence overrides resolvedId for routing + id

**Files:**
- Modify: `src/atlas/import/stagingState.ts` (matching in `buildStagingRow`)
- Test: `src/test/import/import-staging-state.test.ts`

- [ ] **Test:** a vault note whose `slugify(title)` ≠ an existing entity id, but whose `vaultRelPath` is in the sync-map pointing at that entity, produces an **update** row targeting the entity's `sourcePath`, with `resolvedId` == the entity's id (NOT the title-slug), and `rowKind: "update"` (not create).
- [ ] **Implement:** extend `StagingContext` with the sync-map + an `existingById` that already maps id→sourcePath. Matching precedence in `buildStagingRow`: (1) vault `atlas.id`; (2) `syncMap[vaultRelPath].id`; (3) `slugify(title)`. The matched id (1/2) overrides `resolvedId` and drives `targetPath = existingById.get(matchedId)`. **Collision guard:** if a candidate-new row's slug equals an existing id, force `rowKind` to surface a review (do not silent-create).
- [ ] Run test → green. Commit: `feat(staging): sync-map/atlas.id override title-slug for routing + id`.

## Task 2.3: Populate `needsReview` from DM-canon (exposure + type conflict)

**Files:**
- Modify: `src/atlas/import/stagingState.ts`, `src/pages/AtlasPlacementEditor.tsx` (build the id→{visibility,type,sourcePath} map from `project.entities`)
- Test: `src/test/import/import-staging-state.test.ts`

- [ ] **Test:** an update row whose matched entity is `visibility: dm` and whose vault copy has `publish: true` → row gets `needsReview.reason = "secrecy-increase"`, `included = false`. An update row where disk type and vault type both diverge from `baseType` → `needsReview.reason = "type-conflict"`.
- [ ] **Implement:** thread `entityMeta: Map<string, { visibility: EntityVisibility; type: string; sourcePath: string }>` into `StagingContext` (sourced in `AtlasPlacementEditor` from `project.entities`). In `buildStagingRow` for update rows, compute `detectExposureIncrease(entityMeta.visibility, vaultAtlas)` and the `resolveType(...).conflict`, set `needsReview` + `included=false` accordingly.
- [ ] Run → green. Commit: `feat(staging): flag secrecy-increase + type-conflict rows from DM canon`.

## Task 2.4: DM-build precondition guard

**Files:**
- Modify: `src/atlas/import/useMdImportFlow.ts` (add `openWithVaultScan`/sync entry guard)

- [ ] **Implement:** before a sync runs, if `existingById` is empty or entities lack `sourcePath` (player atlas loaded), refuse with a toast: "Rebuild in DM mode first — Sync needs the full DM atlas loaded." Mirror the existing `CanonicalSaveError` guard wording.
- [ ] Add a unit test for the guard (empty `existingById` → throws/sets an error toast, no fetch). Commit: `feat(sync): require DM build loaded before sync`.

---

# PHASE 3 — Vault reader + ignore engine + config

## Task 3.1: `isReadableVaultPath` + `isReadableLocalAtlasPath` (allowlist)

**Files:**
- Modify: `src/atlas/save/sourcePathAllowlist.ts`
- Test: `src/test/save/sourcePathAllowlist.test.ts` (extend)

- [ ] **Test:** `isReadableVaultPath(root, candidate)` accepts `<root>/notes/a.md`, rejects `<root>/../escape.md`, rejects a sibling `<root>-secrets/x.md` (separator-aware boundary), rejects non-`.md`, rejects symlink-escape (mock `realpathSync` if needed — or assert the resolve+sep check). `isReadableLocalAtlasPath` accepts ONLY the literal `.local-atlas/editor-settings.json` and `.local-atlas/sync-map.json`.
- [ ] **Implement** (server-side path module; takes absolute paths):
  ```typescript
  import path from "node:path";
  export function isReadableVaultPath(vaultRoot: string, candidateAbs: string): boolean {
    const root = path.resolve(vaultRoot);
    const cand = path.resolve(candidateAbs);
    const within = cand === root || cand.startsWith(root + path.sep);
    if (!within) return false;
    return /\.md$/i.test(cand);
  }
  export function isReadableLocalAtlasPath(relPath: string): boolean {
    return relPath === ".local-atlas/editor-settings.json" || relPath === ".local-atlas/sync-map.json";
  }
  ```
  (Symlink-escape: the vault-scan walker must `fs.realpath` each file and re-check containment — assert in Task 3.2.)
- [ ] Run → green. Commit: `feat(allowlist): read-only vault + local-atlas path validators`.

## Task 3.2: `/__atlas/vault-scan` endpoint (read-only)

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts` (register a new GET middleware, mirroring `/__atlas/read`)
- Test: `src/test/import/vault-scan.test.ts` (test the pure handler `handleVaultScanRequest`)

- [ ] **Implement** a pure handler + register it (mirror the existing `/__atlas/read` block and `isAllowedDevRequest` gate):
  ```typescript
  // GET /__atlas/vault-scan?vaultRoot=<abs>&ignore=<glob>&ignore=<glob>
  async function handleVaultScanRequest(vaultRoot: string, ignoreGlobs: string[]): Promise<
    | { ok: true; files: Record<string, string> }
    | { ok: false; status: number; error: string }
  > {
    // 1. stat vaultRoot is a directory; else 400.
    // 2. recursively walk; for each .md file: realpath + isReadableVaultPath(vaultRoot, real) else skip.
    // 3. compute vault-relative POSIX path; if isIgnored(rel, ignoreGlobs) (Task 3.3) skip.
    // 4. read contents; enforce aggregate cap (~25 MB) + per-file MAX_FILE_BYTES; over cap → 413-style error.
    // 5. return { ok: true, files: { [rel]: contents } }.
  }
  ```
  Register with `server.middlewares.use("/__atlas/vault-scan", …)` GET-only + `isAllowedDevRequest`, parsing `vaultRoot` + repeated `ignore` params from the query string. **No `fs.write*` anywhere in this path.**
- [ ] **Tests:** directory walk returns only `.md`; a file outside root via symlink is skipped; ignored globs are excluded; aggregate cap returns an error; assert the handler never calls a write. Also a test that `isWritableSourcePath(vaultRoot)` is `false` (the write boundary rejects the vault).
- [ ] Run → green. Commit: `feat(endpoint): read-only /__atlas/vault-scan`.

## Task 3.3: `ignoreRules` (picomatch + built-in folders)

**Files:**
- Create: `src/atlas/import/ignoreRules.ts`
- Modify: `package.json` (add `picomatch` + `@types/picomatch` dev dep)
- Test: `src/test/import/ignoreRules.test.ts`

- [ ] `npm install picomatch` and `npm install -D @types/picomatch`. (Touches the build — Opus-gated; this is approved per spec §5.2.)
- [ ] **Test:** `isIgnored("Templates/x.md", ["Templates/**"])` → true; `isIgnored("world/a.md", ["**/*.excalidraw.md"])` → false; `isIgnored("x.excalidraw.md", ["**/*.excalidraw.md"])` → true; a path inside a built-in `IGNORED_FOLDERS` segment (`_drafts/`) → true even with no DM globs; matching is case-insensitive; paths are vault-relative POSIX.
- [ ] **Implement:**
  ```typescript
  import picomatch from "picomatch";
  import { isIgnoredPath } from "./inferType"; // existing segment-based built-ins (IGNORED_FOLDERS)
  export function makeIgnore(globs: string[]): (relPath: string) => boolean {
    const match = picomatch(globs.length ? globs : ["__never__"], { nocase: true, dot: true });
    return (relPath) => isIgnoredPath(relPath) || match(relPath);
  }
  ```
  (Verify `isIgnoredPath`'s exact export name/signature in `inferType.ts`; adapt the import if different.)
- [ ] Run → green. Commit: `feat(sync): picomatch ignore rules over built-in IGNORED_FOLDERS`.

## Task 3.4: `.local-atlas` config endpoints + `useSyncSettings`

**Files:**
- Modify: `scripts/vite-plugin-atlas-save.ts` (GET via the existing `serveLocalAtlas` pattern for `editor-settings.json` + `sync-map.json`; a small POST writer gated by `isAllowedDevRequest` + `isReadableLocalAtlasPath`)
- Create: `src/atlas/sync/useSyncSettings.ts` (fetch/save settings + sync-map)
- Test: endpoint write test + hook test

- [ ] **Implement GET:** reuse `serveLocalAtlas("/__atlas/local/editor-settings.json")`-style handlers (the precedent reads `.local-atlas/<basename>`). **Implement POST** `/__atlas/local-write` that accepts `{ name, contents }` where `name ∈ {editor-settings.json, sync-map.json}` (validated by `isReadableLocalAtlasPath` on `.local-atlas/<name>`), writes atomically to `.local-atlas/<name>`. This is the one new vault-adjacent WRITE, and it is strictly limited to those two machine-local filenames — never `content/`, never the vault.
- [ ] `useSyncSettings`: `loadSettings()`, `saveSettings(s)`, `loadSyncMap()`, `saveSyncMap(m)`.
- [ ] Tests: POST rejects any `name` other than the two literals; round-trips settings.
- [ ] Commit: `feat(config): .local-atlas editor-settings + sync-map endpoints + hook`.

## Task 3.5: `openWithVaultScan` in the import flow

**Files:**
- Modify: `src/atlas/import/useMdImportFlow.ts`

- [ ] Add `openWithVaultScan(vaultRoot, ignoreGlobs)`: GET `/__atlas/vault-scan`, map `{ relPath: contents }` → `RawFileInput[]` (filename = basename, raw = contents, plus carry `vaultRelPath` for sync-map keying), then feed `buildStagingRows`. Reuse the existing staging path. Apply the DM-build precondition guard (Task 2.4).
- [ ] Test the mapping (mock fetch returning two files). Commit: `feat(sync): openWithVaultScan feeds the staging flow`.

---

# PHASE 4 — Sync panel UI + delete ImportPanel

## Task 4.1: `summarizeImport` gains a `needsReview` bucket

**Files:**
- Modify: `src/atlas/import/summarizeImport.ts`
- Test: `src/test/import/summarize-import.test.ts` (extend)

- [ ] **Test:** rows with `needsReview` set + `included=false` count into a new `needsReview` field (not `skipped`); `formatImportSummaryLine` shows "N need review" when non-zero.
- [ ] **Implement:** add `needsReview: number` to `ImportSummary`; in the loop, `else if (row.needsReview) needsReview++;` before the generic `skipped++`. Add the format clause.
- [ ] Run → green. Commit: `feat(import): summarize needsReview rows distinctly`.

## Task 4.2: `SyncPanel` component + rail item

**Files:**
- Create: `src/atlas/sync/SyncPanel.tsx`
- Modify: `src/atlas/shell/railRegistry.tsx` (add a `sync` system item), `src/pages/AtlasPlacementEditor.tsx` (add `sync` to the `panels` map; pass through `useSyncSettings` + `openWithVaultScan`)

- [ ] **Implement `SyncPanel`** (follow `WorldDetailsPanel` as the panel pattern): a text input for the absolute **vault path**, a textarea for **ignore globs** (one per line), a **Save settings** button (calls `useSyncSettings.saveSettings`), a **Sync now** button (calls `openWithVaultScan(vaultPath, ignoreGlobs)`), and a "last synced" line from `settings.lastSyncAt`. Disable "Sync now" if no vault path is set.
- [ ] **Register the rail item** in `railRegistry.tsx`:
  ```tsx
  mk("sync", "system", "Sync from Obsidian", <RefreshCw className={ICON} />, "O"),
  ```
  (import `RefreshCw` from `lucide-react`).
- [ ] **Mount the panel** in `AtlasPlacementEditor.tsx` `panels` map: `sync: (<SyncPanel … />)`. `EditorRail.onSelect` already routes non-`save` ids to `selectPanel(id)`, so the panel opens automatically; `EditorPanelHost` renders it.
- [ ] Manual verify in the editor (preview tools): open the panel, set a path, Sync now → review list appears. Commit: `feat(sync): Sync from Obsidian panel + rail item`.

## Task 4.3: Disable the visibility dropdown on sync update rows; show "show ignored"

**Files:**
- Modify: `src/atlas/import/ImportStagingModal.tsx`

- [ ] For rows produced by a vault sync with `rowKind === "update"`, disable the visibility dropdown (disk visibility is authoritative — §5.7). Add a "show ignored this run" toggle that re-runs the scan without ignore filtering (or surfaces ignored rows defaulted off). Render the `needsReview` reason as a plain-language line per row.
- [ ] Manual verify. Commit: `feat(sync): disable visibility edit on sync update rows; show-ignored toggle`.

## Task 4.4: Persist the sync-map after a successful commit

**Files:**
- Modify: `src/atlas/import/useMdImportFlow.ts` (in `commit`, after success)

- [ ] After a successful sync commit, for each imported row, `recordSync(map, vaultRelPath, resolvedId, vaultType)` and `saveSyncMap`; set `settings.lastSyncAt`. Commit: `feat(sync): record sync-map + lastSyncAt after commit`.

## Task 4.5: Delete `ImportPanel` (D8 — removes Export Patch)

**Files:**
- Delete: `src/atlas/import/ImportPanel.tsx`
- Modify: `src/pages/AtlasPlacementEditor.tsx` (remove the `import:` panel entry + the `ImportPanel` import + any command-palette/menu entry that opens the `"import"` panel)

- [ ] Grep for `ImportPanel`, `exportPatches`, `exportSafeAll`, and the `"import"` panel id; remove the component, its mount, and any now-dead helpers (`downloadText`, the export-patch path in `parseObsidian`) **only if no other surface uses them** (verify each with a grep before deleting).
- [ ] Run `npx tsc --noEmit` and the import test files to confirm nothing references the deleted symbols.
- [ ] Commit: `refactor(import): delete legacy ImportPanel + Export Patch flow (D8)`.

---

# PHASE 5 — Ship gate

## Task 5.1: Full verification

- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors (warnings pre-existing are OK).
- [ ] Sharded tests (avoid OOM): `npx vitest run --shard=1/4 --poolOptions.forks.maxForks=3` … `--shard=4/4`. All green.
- [ ] **Secrecy ship-gate (backstop):** `npm run atlas:build:player` then `npm run atlas:check-secrets public/atlas` and `npm run atlas:check-derived public/atlas` — both exit 0. Then `npm run atlas:publish:integrity-smoke`.
- [ ] **Manual dogfood:** in `npm run dev`, configure a small test vault, Sync now, confirm: an entity with a pin keeps its pin after re-sync; a DM-only note edited in the vault stays DM-only; a vault note with `publish: true` shows as a "needs review" row (not auto-published); a renamed-in-place note re-syncs to the same entity.
- [ ] Commit any fixups. Final commit: `chore(sync): ship-gate green for Obsidian read-only merge`.

---

## Self-review checklist (run before handing off)

- **Spec coverage:** §3 ownership → Tasks 1.1-1.3; §3.6 type → 1.2; §5.1 vault-scan → 3.2; §5.2 globs → 3.3; §5.3 identity/sync-map → 2.1-2.3; §5.4 config → 3.4; §5.5 needsReview → 1.6/4.1; §5.6 precondition → 2.4; §5.7 merge integration → 1.4; §7 secrecy → 1.4/1.5/2.3; §8 review surface → 4.3; §9 tests → throughout; §10 ImportPanel delete → 4.5. ✓
- **Placeholder scan:** the only "verify-first" notes (tags location in 1.3; `isIgnoredPath` signature in 3.3; symlink realpath in 3.2) name the exact thing to check and the code to write once confirmed — not hand-waving.
- **Type consistency:** `mergeImportFrontmatter` input/result shape is stable across 1.3/1.4; `StagingRow` gains `baseType` + `needsReview` (1.6) used in 1.4/2.2/2.3/4.1; `SyncMapEntry { id, baseType }` consistent across 2.1/4.4.
