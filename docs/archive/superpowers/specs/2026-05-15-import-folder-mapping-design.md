# Spec: per-world import folder mapping + in-place update

Date: 2026-05-15
Status: approved design, ready for implementation plan
Audience: a fresh implementation session (Sonnet) — self-contained, execute without prior context.

## 1. Problem

The `.md` import staging layer hardcodes a 7-folder taxonomy and forces every
import into it:

- `src/atlas/import/stagingState.ts` — `ALLOWED_FOLDERS = [places, people,
  factions, items, events, regions, imports]`, `inferTargetFolder()` maps
  `npc → people`, `settlement → places`, etc.

This taxonomy exists nowhere else in the system:

- The build read side (`scripts/build-atlas.ts` `walk()`) is **folder-agnostic**:
  it recursively scans every `.md` under `content/` (excluding only the
  `atlas.config.json` globs `_drafts/`, `_dm/`, `archive/`, `deprecated/`) and
  derives entity `type` from frontmatter `atlas.type`, never from the folder.
- The real write-side security gate `src/atlas/save/sourcePathAllowlist.ts`
  `isWritableSourcePath()` already permits `content/<any-segments>/<file>.md`.

Consequences for the DM's actual world (`astrath-deeprealm`, whose real folders
are `npcs/ settlements/ ruins/ factions/ events/ regions/ items/ imports/`):

1. An imported NPC (`atlas.type: npc`) is written to
   `content/astrath-deeprealm/people/<slug>.md` — a parallel folder the DM never
   browses. The entity *is* in `atlas.json` (the build walks everything) but the
   DM can't find it in the vault → reported as "imports didn't get saved".
2. **Silent data loss:** if the import shares an `atlas.id`/slug with an
   existing entity living in `npcs/`, staging's path-based conflict check does
   not fire (different paths), but the build's duplicate-slug guard
   (`build-atlas.ts:333`) then drops one of the two entities with an error.

## 2. Decisions (already made with the user — do not re-litigate)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Folder source | Per-world config in `world.yaml`, delivered to the editor via `atlas.json` |
| D2 | Duplicate-slug data loss | In scope — close it |
| D3 | No-config fallback | Single `imports/` folder (no scattering) |
| D4 | Config delivery | Emit into `atlas.json` (`project.worlds[].importFolders`), DM builds only; no new endpoint |
| D5 | Type sorting | Yes — type → folder is the headline behavior; pre-seed the user's world config so it works with zero setup |
| D6 | UX | One **Import** button. No DM decisions: no folder picker, no slug/conflict triage, no required path edits. Same-id import = silently update the existing entity in place with an automatic backup |
| D7 | Scalability | Adding an entity type = one config line, zero code. One shared config type, one delivery channel, no hardcoded type/folder list anywhere |

## 3. Target experience

DM drops/picks `.md` files → single **Import** button → done. Per-file the
system silently does the obvious thing:

- **New entity** → `content/<world>/<folders[type] ?? defaultFolder>/<slug>.md`.
- **File for an entity that already exists** (same resolved id) → overwrite the
  existing entity *at its current on-disk path* (wherever it lives), prior
  version backed up automatically by the Save endpoint. Never creates a parallel
  copy; this is what closes D2.

The staging list shows one plain line per row with an include checkbox the DM
can untick:

- `Create — Goblin Warren → npcs/`
- `Update — Captain Vale (backup kept)`

No "slug", no "conflict", no blocking states, no path/type editing in the
common path. Save and "make changes" flows are untouched.

## 4. Shared config type (single source of truth — D7)

Add to `src/atlas/content/schema.ts` (imported by both `scripts/` and `src/`):

```ts
export interface ImportFolderConfig {
  /** entity `atlas.type` → destination folder name (single safe path segment). */
  folders: Record<string, string>;
  /** Folder for unknown/typeless entities and unconfigured worlds. */
  defaultFolder: string;
}
```

Extend `World`:

```ts
export interface World {
  id: string;
  name: string;
  defaultMapId?: string;
  importFolders?: ImportFolderConfig; // present in DM builds only
}
```

`ImportFolderConfig` is the ONLY place this shape is defined; every other file
imports it. Adding a new entity type never touches code — only `folders`.

## 5. File-by-file changes

### 5.1 `scripts/atlas/loadWorldConfig.ts`

- `WorldYaml` interface: add
  `import?: { folders?: Record<string, unknown>; defaultFolder?: unknown }`.
- `WorldConfig` interface: add `importConfig: ImportFolderConfig` (always set).
- New pure validator (place near `sanitizeScale`/`normalizeVis`):

  ```ts
  const SAFE_SEGMENT = /^[A-Za-z0-9_\-. ]+$/;
  function sanitizeFolderSegment(v: unknown): string | null {
    if (typeof v !== "string") return null;
    if (v === "." || v === ".." || v === "_atlas") return null;
    if (!SAFE_SEGMENT.test(v)) return null;
    return v;
  }
  function sanitizeImportConfig(
    raw: WorldYaml["import"], warnings: string[]
  ): ImportFolderConfig {
    const folders: Record<string, string> = {};
    for (const [type, val] of Object.entries(raw?.folders ?? {})) {
      const seg = sanitizeFolderSegment(val);
      if (seg && typeof type === "string" && type.length > 0) folders[type] = seg;
      else warnings.push(`world.yaml import.folders["${type}"]: invalid folder "${String(val)}" — ignored`);
    }
    const def = sanitizeFolderSegment(raw?.defaultFolder);
    if (raw?.defaultFolder !== undefined && !def)
      warnings.push(`world.yaml import.defaultFolder: invalid "${String(raw?.defaultFolder)}" — using "imports"`);
    return { folders, defaultFolder: def ?? "imports" };
  }
  ```

- In `loadWorldConfig`, compute `importConfig = sanitizeImportConfig(data.import, warnings)` and include it in the returned object. Absent `import:` ⇒ `{ folders: {}, defaultFolder: "imports" }` (D3 — the empty case *is* the fallback; no special-casing).

### 5.2 `scripts/build-atlas.ts`

- Line ~829 `worlds: [{ id: worldId, name: "Astrath Deeprealm", defaultMapId: primaryMapId }]`:
  attach `importFolders` **only in DM builds**:

  ```ts
  worlds: [{
    id: worldId, name: "Astrath Deeprealm", defaultMapId: primaryMapId,
    ...(flags.player ? {} : { importFolders: worldCfg?.importConfig ?? { folders: {}, defaultFolder: "imports" } }),
  }]
  ```

  Player builds must NOT carry it (authoring metadata; player atlas.json stays clean).

### 5.3 `src/atlas/content/schema.ts`

Add `ImportFolderConfig` (§4) and the `World.importFolders?` field.

### 5.4 `src/atlas/import/stagingState.ts` — core rewrite

Remove `ALLOWED_FOLDERS`, `TargetFolder`, `ALLOWED_FOLDER_SET`.

- `inferTargetFolder(type: string, cfg: ImportFolderConfig): string`
  → `cfg.folders[type] ?? cfg.defaultFolder`.
- `isAllowedTargetPath(worldId, path, allowed: ReadonlySet<string>)`: same
  structural checks (exactly 4 segments `content/<worldId>/<folder>/<file>.md`,
  safe filename), but membership tested against the passed-in `allowed` set
  (= `new Set([...Object.values(cfg.folders), cfg.defaultFolder])`).
- Resolved id (MUST exactly equal what `build-atlas.ts` will compute, or
  update-detection misfires — D2 soundness):
  - Build computes `id = parsed.atlas.id || slugify(title)` where `title` =
    `deriveTitle(file, fm.title)` = `fm.title.trim()` if non-empty, else
    `basename(file,'.md').replace(/[-_]+/g,' ').trim()` (`build-atlas.ts:160`).
  - Staging MUST mirror this: `resolvedId = atlas.id || slugify(deriveTitle)`
    using the same title derivation, and the SAME slug function the build uses.
  - Implementation check: staging currently has its own local `slugify`. Verify
    it is character-for-character equivalent to `scripts/atlas/slugify`; if not,
    make staging use a slug function with identical output. A mismatch here
    silently reopens D2.
- `StagingContext` gains: `importConfig: ImportFolderConfig`,
  `allowedFolders: ReadonlySet<string>` (memoized from importConfig),
  `existingById: ReadonlyMap<string, string>` (entity id → its on-disk sourcePath).
- `StagingRow` gains `resolvedId: string` and replaces `conflict: boolean` with
  `rowKind: "create" | "update" | "path-collision"`:
  - `existingById.has(resolvedId)` → `update`; `targetPath = existingById.get(resolvedId)!` (the real path, any folder); `baseHash` from current content; backup handled by Save endpoint.
  - else compute `targetPath = content/<world>/<inferTargetFolder>/<slug>.md`; if that path is an existing sourcePath of a *different* id → `path-collision` (keep today's overwrite-with-backup behavior, default included=false until re-checked); else `create`.
- `buildStagingRow` / `updateStagingRow`: thread `importConfig`/`allowedFolders`/`existingById`; default `included` = `!parseError && pathAllowed && rowKind !== "path-collision"` (create and update default ON; path-collision needs explicit opt-in, same as today's conflict).

### 5.5 `src/atlas/import/useMdImportFlow.ts`

`UseMdImportFlowArgs` gains `importConfig: ImportFolderConfig` and
`existingById: ReadonlyMap<string,string>` (replaces `existingPaths`). Thread
into the `ctx` memo (memoize `allowedFolders` there).

### 5.6 `src/pages/AtlasPlacementEditor.tsx`

- Replace the `importExistingPaths` memo with `importExistingById`:
  `Map(project.entities.filter(e => e.sourcePath).map(e => [e.id, e.sourcePath]))`.
- Read `importConfig` off the active world:
  `project.worlds.find(w => w.id === worldId)?.importFolders ?? { folders: {}, defaultFolder: "imports" }`
  (fallback covers atlas.json built before this change).
- Pass both into `useMdImportFlow`.

### 5.7 `src/atlas/import/buildImportChanges.ts`

- Eligibility unchanged (`included && pathAllowed && !parseError`).
- Compute `baseHash` (read current + hash) for `rowKind === "update"` **and**
  `rowKind === "path-collision"`; `null` for `create`. (Update now also targets
  an existing file, so it needs the same optimistic-concurrency baseHash the
  old conflict branch used.)

### 5.8 `src/atlas/import/ImportStagingModal.tsx`

- `blocked = !!parseError || !pathAllowed` (unchanged).
- Row status line driven by `rowKind`:
  - `create`: `Create — {title} → {folder}/`
  - `update`: badge `Update — {title} (backup kept)` (amber, not destructive)
  - `path-collision`: keep current amber overwrite badge + opt-in checkbox copy.
- Remove any "slug"/"conflict" wording from DM-facing strings (D6).

### 5.9 Seed the user's world config (D5)

Edit (or create) `content/astrath-deeprealm/_atlas/world.yaml` adding:

```yaml
import:
  folders:
    npc: npcs
    settlement: settlements
    ruin: ruins
    dungeon: ruins
    location: places
    faction: factions
    event: events
    region: regions
    item: items
  defaultFolder: imports
```

(Confirm the file's existing top-level shape first; insert as a sibling key.
Never hand-edit generated artifacts — this is source.)

## 6. Tests (rewrite the contract)

- `src/test/import-staging-state.test.ts` — rewrite against `ImportFolderConfig`
  ctx: routing by config, `defaultFolder` for unknown type, empty-config →
  everything to `imports/`, `update` when id exists (targets existing path in a
  different folder), `path-collision` opt-in, resolved-id = `atlas.id || slugify(title)`.
- `src/test/import-staging-modal.test.tsx` — assert create/update/path-collision
  rendering; assert no "slug"/"conflict" text in DM-facing copy.
- `src/test/build-import-changes.test.ts` — baseHash null for create,
  non-null for update and path-collision.
- New: `loadWorldConfig` import-block parse/validation (valid, invalid segment
  dropped+warned, `_atlas`/`..` rejected, absent → `{folders:{},defaultFolder:"imports"}`).
- New: build-atlas asserts `worlds[0].importFolders` present in DM build,
  absent in `--player` build.
- Full gate: `npm test`, `npm run lint`, `npm run atlas:publish` (player-safe +
  secret/derived scans) must pass.

## 7. Security invariants (preserve — CLAUDE.md flags this area)

- Folder set stays an explicit allowlist, now sourced from validated config.
  `isAllowedTargetPath` still enforces exactly `content/<worldId>/<folder>/<file>.md`,
  world-scoped, safe filename.
- Config values validated with the same safe-segment regex family as
  `sourcePathAllowlist`; `_atlas`, `.`, `..`, unsafe chars rejected at parse time
  → cannot widen the write surface.
- `isWritableSourcePath` (server gate) is **unchanged** and remains the backstop.
- Frontmatter `path` is still never used as a target.
- No new endpoint → no new server attack surface.

## 8. Out of scope (YAGNI)

- No separate allowlist config field (derived from `folders` + `defaultFolder`).
- No per-world HTTP endpoint.
- No change to the build's folder-agnostic read (correct as-is; the fix makes
  import agree with it).
- No editor-wide UI redesign — only the Import flow is touched. Save / "make
  changes" flows are unchanged.

## 9. Definition of done

- One **Import** button; no folder/slug/conflict decisions surfaced to the DM.
- Imports type-sort into the user's real folders out of the box (seeded config);
  unconfigured worlds/types → `imports/`.
- Same-id import updates the existing entity in place with a backup; build
  duplicate-slug data loss can no longer occur via import.
- Adding a future entity type = one line in `world.yaml`, zero code change.
- `npm test`, `npm run lint`, `npm run atlas:publish` all green.
