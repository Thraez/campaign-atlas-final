# DM Editor UX Overhaul — Handover (2026-05-15)

This document hands a fresh Claude conversation everything it needs to continue the multi-phase DM editor overhaul where I left off. Read it end-to-end first; do not start work without skimming the spec + plan files it references.

---

## 0. Where to start

Read these, in order, before touching anything:

1. **Design spec** — `docs/superpowers/specs/2026-05-15-dm-editor-ux-fixes-design.md`
   The authoritative description of every Phase 1 sub-task, the data contracts, and the open risks. Sections A–I.
2. **Implementation plan** — `C:\Users\pvpro\.claude\plans\sunny-brewing-cray.md`
   The decomposed Phase 1A / 1B / 1C with file lists and verification gates. (Lives outside the repo because it's the harness's plan file.)
3. **PR** — https://github.com/Thraez/campaign-atlas-final/pull/7
   Branch `claude/zen-spence-094b14`, two commits.
4. **CLAUDE.md** at repo root — the hard rules the project enforces (don't edit generated artifacts, player builds must not contain DM content, editor code gated by `__INCLUDE_EDITOR__`).

If anything in this handover contradicts the spec, the spec wins.

---

## 1. State of the work

### Landed (Phase 1A, 12 of 13 sub-tasks)

Both commits on branch `claude/zen-spence-094b14`. All 410 vitest tests pass. Lint clean for every file this work touched.

| Commit | Subject | Scope |
|---|---|---|
| `0dfe42b` | Fix /atlas tablet dead zone, gray-screen, and map name display | A1 + A2 + A3 + design spec |
| `f6e1ccc` | Harden /__atlas/save with baseHash, backups, rollback, save chip | A4–A12 |

#### What works now

- **`/atlas` (player view)**: search → pick → entity panel populates in the desktop aside without a gray overlay; tablet 768–1023px sees a bottom sheet instead of nothing; mobile unchanged.
- **`/atlas`, `/atlas/browse`, `/atlas/timeline`**: hamburger nav at `<lg`, inline nav at `≥lg`. Hamburger gives Map / Browse / Timeline / Edit pins (gated by `isDmToolsEnabled()`).
- **Aside collapse**: chevron in the panel collapses to a 28px strip; state persists in `localStorage["atlas.viewer.asidePinned"]`.
- **`/atlas/edit` Maps tab**: panel header shows the user-typed `map.name` ("Overview"), not the slug id. Layer rows show a friendly name (derived from filename) with the technical id below.
- **Save endpoint** (`POST /__atlas/save`): accepts `{ files: [{ path, content, kind: "entity-md" | "world-yaml", baseHash }], rebuild }`. Returns 200 / 207 / 400 / 409 / 423 / 500 with documented payloads.
- **`SaveStatusChip`** in the editor toolbar: Saved + relative time / Unsaved + file-impact sub-line / Saving / Save failed. Clickable when Unsaved or Failed → force-save (same as main Save button).
- **5-minute idle nudge** as a Sonner toast with `Save now` / `Remind me later` actions.

#### Deferred (still TODO)

- **A13** — one-click Save that writes pins **AND** world.yaml in a single batch. See §3 below for the full scope.
- **A10 in-process rebuild** — the behavioural 200/207 differentiation landed, but the spawn-vs-import refactor of `scripts/build-atlas.ts` did not. Documented in code at `scripts/vite-plugin-atlas-save.ts` around the `runAtlasBuild` call.
- **Phase 1B** — undo/redo, edit-geometry mode, drag-to-move, resize handles, center-anchored scale presets, "+ Place Pin" toolbar.
- **Phase 1C** — `.md` import staging modal, paste-markdown dialog.

---

## 2. Critical files and where logic lives

### New files this work added

| Path | Purpose |
|---|---|
| `src/hooks/use-has-desktop-aside.tsx` | `useHasDesktopAside()` — `>= 1024px` media query. The pivot for A1/A2 viewport gating. |
| `src/atlas/AtlasNavMenu.tsx` | Shared hamburger Sheet used by `/atlas`, `/atlas/browse`, `/atlas/timeline`. `lg:hidden`. |
| `src/atlas/SaveStatusChip.tsx` | The chip + `dirtyFileSummary()` helper + `relativeTime()` helper. |
| `src/atlas/yaml/worldYamlSerialize.ts` | `captureLeadingCommentBlock()` and `serializeWorldYaml()` — re-prepends the existing `world.yaml` comment header byte-for-byte. Used by A13 when it lands. |
| `src/test/save-status-chip.test.tsx` | 13 cases covering the chip + helpers. |
| `src/test/world-yaml-serialize.test.ts` | 8 cases pinning the comment-preservation behaviour. |
| `docs/superpowers/specs/2026-05-15-dm-editor-ux-fixes-design.md` | The authoritative spec. |

### Touched files of note

| Path | What changed |
|---|---|
| `scripts/vite-plugin-atlas-save.ts` | Endpoint rewritten end-to-end. Read the file top-to-bottom — A4 payload, A5 conflict, A6 validation, A7 backups, A8 (delegated to `worldYamlSerialize`), A9 rollback, A10 status, A11 mutex all live here. |
| `src/atlas/save/localFsSave.ts` | Client signature matches new contract. New `FileChange.kind` + `FileChange.baseHash`. New error classes: `ConflictError`, `SaveBusyError`. New `hashContent()` helper. |
| `src/atlas/save/canonicalPlacementSave.ts` | `buildCanonicalPlacementChanges()` now emits `kind: "entity-md"` and computes `baseHash` from the read response. |
| `src/atlas/save/DiffPreviewModal.tsx` | Updated to the new `LocalSaveResult.saved` field (was `written`). No other behavioural change. |
| `src/atlas/MapLayerPanel.tsx` | `layerDisplayName()` helper + panel header showing `map.name`. |
| `src/pages/AtlasViewer.tsx` | Gray-screen fix + aside breakpoint move + hamburger + aside collapse. |
| `src/pages/AtlasBrowse.tsx`, `src/pages/AtlasTimeline.tsx` | Hamburger injection. |
| `src/pages/AtlasPlacementEditor.tsx` | Chip wired in toolbar + 5-min nudge effect. **Did NOT touch the existing `onSaveClick` flow** — placements still route through `DiffPreviewModal`. A13 will reorganise this. |
| `.gitignore` | Added `.atlas-backups/`. |

### Existing files you should know about (don't reinvent)

| Path | What's in it |
|---|---|
| `src/atlas/save/sourcePathAllowlist.ts` | `isWritableSourcePath()` — the path-safety gate. Always run paths through this. |
| `src/atlas/yaml/buildPatches.ts` | Builds per-tab YAML *patches* (fragments). Phase 1A1 still uses this for per-tab Export Patch buttons. A13 will need to build *full* `world.yaml` content alongside or instead of these. |
| `src/atlas/yaml/dump.ts` | `dumpYaml()` — js-yaml wrapper with the project's quoting/indent conventions. Use this when emitting world.yaml from objects. |
| `src/atlas/yaml/validatePatch.ts` | `validatePatchYaml()` — heavier per-kind validator for *patches*. Not directly useful for the unified Save endpoint (we use lightweight parse-back instead). |
| `src/atlas/useMapLayers.ts` | `LocalLayer[]` state hook. Already extends `MapLayer` with `name`, `filename`, `dataUrl`, etc. |
| `src/atlas/regions/useRegionDraft.ts`, `src/atlas/routes/useRouteDraft.ts` | Per-tab draft state hooks. **A13 needs to read these** to build the full world.yaml. |
| `scripts/atlas/mapImport.ts` | Map import pipeline; already preserves user-typed map name in `targetMapName`. The display bug was UI-only and is now fixed. |

---

## 3. A13 in detail — what's left to do

A13 is the only remaining Phase 1A item. Spec says:

> One click writes pins **plus** world.yaml in a single batch. baseHash tracking for both. Files routed through the unified `/__atlas/save` endpoint.

### Why I deferred it

The editor doesn't track `world.yaml` dirty state cohesively. Each tab (Regions / Routes / Fog / Map metadata / Map layers) has its own local-draft hook and its own Export Patch button. Stitching them into one save batch needs:

1. A canonical-state snapshot mechanism per tab — so we know "current in-memory regions" differs from "regions on disk".
2. A `buildFullWorldYaml(project, drafts)` function that emits the **full** `world.yaml` content (not patch fragments). I built the comment-preservation helper for this (`src/atlas/yaml/worldYamlSerialize.ts`) but didn't write the dump-the-world function itself.
3. A `baseHash` capture for `world.yaml` at editor-load time — currently the editor never reads `world.yaml` directly; it consumes the built `atlas.json`. The editor's load path needs a `GET /__atlas/read?path=content/<world>/_atlas/world.yaml` to capture the hash.
4. UI affordance for "you're about to overwrite the on-disk world.yaml" — even with baseHash, the user wants to see what's about to change.

### How to start A13

Order of work:

1. **`buildFullWorldYaml(project, drafts) → string`** — new pure function. Walks the project's worlds → maps[] → layers/regions/routes/fog/grid/scale/etc and emits a single YAML string via `dumpYaml()` + `serializeWorldYaml()` (the latter handles comment preservation). **Unit-test this in isolation** with a few sample drafts and assert round-trip parses back to the same object.
2. **Editor-side `useWorldYamlBaseline()`** — fetch `world.yaml` at editor mount, compute its SHA-256 (`hashContent()` in `localFsSave.ts`), store both the raw content and hash in state. The raw is used to pass `existing` into `serializeWorldYaml()`. The hash is the `baseHash` for the save payload.
3. **Aggregate dirty state in `AtlasPlacementEditor.tsx`** — a `worldYamlDirty` boolean derived from comparing the in-memory tab states to their initial-load values. Watch out: `useRegionDraft.ts` already has an `applyServerCanon` / `markClean` pattern — reuse it. The `dirtyFileSummary` in the chip starts to mean something real at this point.
4. **`buildSavePayload(): FileChange[]`** — extends the existing `buildCanonicalPlacementChanges` flow. Returns the entity .md files (existing) **plus** a `world-yaml` file when `worldYamlDirty`.
5. **Wire into `onSaveClick`** — replace the existing DiffPreviewModal handoff with a unified flow. The DiffPreviewModal can stay as a confirm-before-write step OR be replaced with a single-shot save+toast based on user preference.
6. **A13 verification** (from the spec):
   - Edit a pin + a region + a route + a fog reveal + map metadata in one session.
   - Click Save once.
   - Verify entity `.md` files updated, `world.yaml` updated with leading comment block intact, `.atlas-backups/<ts>/` contains prior versions of everything, atlas rebuilds.

### Risk callouts for A13

- **The 882-line `scripts/build-atlas.ts` reads `world.yaml` strictly.** Round-tripping in-memory state → YAML → disk → build-atlas must round-trip cleanly. The existing `validateProject.ts` helper might be useful to assert before write.
- **Comments inline between YAML keys are not preserved** (documented limitation). If the DM has hand-written inline comments, they'll be silently dropped on first save. Worth a one-time pre-save warning if `world.yaml` has any `#` characters not in the leading block.
- The existing per-tab Export Patch buttons should stay working as a power-user escape hatch — the spec is explicit about this. Don't delete them.

---

## 4. Phase 1B — Map editing + undo

The full plan is in the plan file. High-level summary:

### B0 — Session undo/redo (prerequisite for B1/B2)

In-memory mutation stack (cap 50). Each mutation pushes its inverse:

- Place / Move / Delete pin
- Drag / Resize layer geometry
- Add / Edit / Delete region, route, fog reveal
- Map metadata changes

Cmd+Z / Cmd+Shift+Z (Ctrl+Y as well). Toolbar Undo/Redo buttons with disabled states. **Persists across Saves** — undoing past a save boundary flips the chip back to Unsaved; the user has to Save again to commit the rollback. Stack is in-memory only — cleared on tab close.

`.md` import (1C) is NOT undoable through this stack — backups in `.atlas-backups/` cover that.

### B1 — "Edit geometry" toggle + drag-to-move

A toggle in the Maps → Layers panel header. When ON:

- Selected layer becomes draggable. Leaflet's `map.dragging.disable()` while dragging the layer; re-enable on `mouseup`.
- Outside the selected layer, normal map pan works.

`Esc` exits the mode and reverts any in-progress drag.

X/Y number fields update live during drag; drop commits + pushes inverse onto undo stack.

### B2 — Corner resize handles

Four `L.Marker` with div-icons at the layer's corners. Visible only when "Edit geometry" is ON and a layer is selected.

- Drag → opposite corner stays put.
- Shift held → aspect locked regardless of checkbox.
- Alt held → center-anchored (all four corners move).

### B3 — Center-anchored scale presets

`MapLayerPanel.tsx` scale buttons (50/75/100/125/150/FitW/FitH) recompute X/Y to keep the layer's center fixed across the resize. Push inverse onto undo stack.

### B4 — "+ Place Pin" toolbar action

Button next to Save. Opens a Radix `<Popover>` listing unplaced entities for the active map. Picking one enters the existing crosshair placement flow. Banner gains a visible Cancel button (Esc already works).

---

## 5. Phase 1C — Content import

### C1 — Entry points

- Toolbar "Import .md files…" → native `<input type="file" multiple accept=".md">`.
- Drag-and-drop overlay on the `/atlas/edit` route shell for individual `.md` files. **Folder DnD is explicitly not supported** (`webkitdirectory` is unreliable across browsers).

Both funnel into the same staging modal.

### C2 — Staging modal with folder allowlist

Radix `<Dialog>`. Columns: include checkbox, filename, inferred type dropdown, target path (editable), conflict warning chip.

- **Target paths restricted** to `content/<active-world-id>/{places,people,factions,items,events,regions,imports}/**`. Rows outside the allowlist render red and are uncheckable.
- **File-frontmatter `path` is IGNORED** — shown only as a tooltip suggestion. Never used as the actual target.
- **Conflicts default UNCHECKED** with a warning chip. Re-checking is required to overwrite.

Reuse `src/atlas/import/inferType.ts` and `src/atlas/import/parseObsidian.ts` for type inference / frontmatter parsing.

### C3 — Commit through unified Save

Staging set → unified Save payload (one `entity-md` per row, `baseHash: null` for new, hash-of-existing for overwrites). Goes through `/__atlas/save`. Same atomic batch semantics from 1A.

### C4 — Paste markdown dialog

Standalone "Paste markdown" button in the Entities tab. Radix `<Dialog>` with title input, type dropdown, body textarea. Submit creates one file (no staging needed — only one row).

---

## 6. Phase 2 / Phase 3 — out of scope for the current effort

Documented in the spec's "Out of scope" section. **Do not pull these in without an explicit user request.**

**Phase 2** (separate spec):
- Drag pins on the map (separate from layer drag — pins use `L.Marker` already)
- Right-click context menus on map objects
- Marquee multi-select
- **Cross-session persistent undo**
- Keyboard shortcut customization
- Snap-to-grid
- Vertical icon-rail toolbar redesign
- Layers panel polish
- **Opt-in true autosave** (the user was clear: deferred until undo + diff-preview are stronger)

**Phase 3** (separate spec):
- "Publish to live site" button — commits + pushes content changes from the editor. The existing GHA at `.github/workflows/publish-atlas.yml` already handles deploy on push to `main`.

**Always out**:
- Playwright suite (user direction; revisit later).
- Landing-page redesign, Timeline visual axis, Browse type-filter chips, Player-mode build audit.

---

## 7. Key technical contracts to keep in mind

### The Save endpoint payload

```jsonc
POST /__atlas/save
{
  "files": [
    {
      "path": "content/astrath-deeprealm/places/thornhold.md",
      "content": "---\n...\n",
      "kind": "entity-md",     // or "world-yaml"
      "baseHash": "sha256:abc…" // or null for create-only
    }
  ],
  "rebuild": true
}
```

### Response codes

- **200** — full success. Body: `{ saved, paths, files: [{path, hash}], rebuilt?: true, publishedAt?, build? }`.
- **207** — writes succeeded but either rebuild failed OR mid-batch write failed and was rolled back. Body distinguishes via `rebuilt: false` (rebuild failure) vs `partialWrite: true` (write failure).
- **400** — `InvalidBody`, `DisallowedPath`, `OversizedContent`, `InvalidContent` (parse-back failed), `InvalidBody` with `reason: "duplicate-path"`.
- **409** — `Conflict` with `reason: "stale-base" | "missing-base" | "already-exists"` + `failedPath` + `currentHash`.
- **423** — `Locked` (another save is in flight).
- **500** — internal errors (read failed, backup failed, write failed without rollback).

### Backup layout

```
.atlas-backups/
  2026-05-15T05-30-12-345Z/
    content/astrath-deeprealm/places/thornhold.md   ← prior content
  2026-05-15T05-31-08-002Z/
    content/astrath-deeprealm/places/thornhold.md
    content/astrath-deeprealm/_atlas/world.yaml
  ...
```

Per-path retention: 3 most recent timestamps. Pruning runs after each successful write.

### `world.yaml` comment preservation

`captureLeadingCommentBlock(existing)` grabs every leading blank-or-`#` line up to the first YAML key. `serializeWorldYaml(newBody, existing)` re-prepends that exact block. Default boilerplate when `existing === null`. **Inline mid-file comments are not preserved** — documented.

---

## 8. How to run + verify

From the worktree at `.claude/worktrees/zen-spence-094b14/`:

```
npm run dev                          # vite, port 8080
npm test                              # vitest single run
npm run test:watch                    # vitest in watch mode
npm run lint                          # eslint (pre-existing issues in unrelated files)
npm run atlas:build                   # rebuild public/atlas/atlas.json
npm run atlas:check-secrets <dir>     # secret-leak scan
npm run atlas:check-shape <atlas.json># schema shape scan
npm run atlas:publish                 # full player build + all scans (used by GHA)
```

The dev plugin's two endpoints:
- `GET /__atlas/read?path=content/...` — read an allowlisted file. Returns `{ path, contents }`.
- `POST /__atlas/save` — see contract above.

Both are gated by `apply: "serve"` in `vite-plugin-atlas-save.ts` — they do **not** exist in production builds.

To inspect backups during testing:

```
ls .atlas-backups/                                    # timestamp dirs
ls .atlas-backups/<ts>/content/astrath-deeprealm/     # backed-up tree
```

To trigger the 409 stale-base path manually: edit any entity `.md` outside the editor while the editor is open, then save in the editor. Toast should turn red with "Reload" CTA.

---

## 9. Decisions made (so the next conversation doesn't re-litigate)

Across two ChatGPT design reviews, the user adopted these positions. They're worth knowing because some are non-obvious:

1. **Autosave is opt-in only and deferred** — until undo, conflict detection, and rollback UX are mature. The chip and 5-minute nudge make dirty state visible without committing surprise writes.
2. **Dirty count is file-impact, not mutation count** — chip shows "world.yaml + 2 entities", not "17 unsaved changes". 17 sounds scarier than it is.
3. **Backups live OUTSIDE `content/`** — at `.atlas-backups/<ts>/...`, gitignored. The `content/` tree is treated by every scanner / loader / build script; putting backups there would have caused leaks.
4. **Per-file `baseHash` is mandatory** — never overwrite a file the editor didn't read first. Three 409 reason codes (stale-base, missing-base, already-exists) cover the matrix.
5. **Multi-file write is best-effort, not truly atomic** — clear wording: "validated before any write, then per-file backup + atomic temp+rename, with best-effort batch rollback on partial failure". Partial failures return 207 with `partialWrite: true` and a `rolledBack` count.
6. **`.md` import frontmatter `path` is ignored** — shown as a tooltip suggestion only. Target paths are forced under `content/<active-world-id>/{places,people,factions,items,events,regions,imports}/**`. Conflict rows default UNCHECKED.
7. **Folder drag-and-drop is explicitly not supported** in Phase 1. `webkitdirectory` is too fragile across browsers. Use the file picker for multi-file imports.
8. **Layer drag/resize requires "Edit geometry" mode** — fights map panning otherwise. Toggle in Maps → Layers panel header.
9. **Undo persists across saves but not across tab close** — in-memory only; cross-session persistent undo is Phase 2.
10. **Tablet breakpoint pivot**: A1 + A2 both use `useHasDesktopAside()` at `>= 1024px`. The Sheet (entity panel) renders for everything below `lg`, not just below `md`. This closes a tablet dead zone where neither aside nor sheet was visible.

---

## 10. Recommended first move for the next conversation

1. Read this doc end-to-end.
2. Read the spec + plan.
3. Check out the PR (`gh pr checkout 7` if running locally; or `git fetch && git checkout claude/zen-spence-094b14`).
4. Run `npm test` and `npm run lint` to confirm everything's still green.
5. Spin up the dev server, manually verify the §1 "What works now" list, then ask the user which of A13 / Phase 1B / Phase 1C to start.

If A13: start with the `buildFullWorldYaml(project, drafts)` pure function and its unit tests. The rest of A13 builds on that primitive.

If Phase 1B: start with B0 (undo stack). It's a prerequisite for B1/B2 and is self-contained enough to land on its own.

If Phase 1C: start with the staging modal UI scaffold, point its commit-button at the existing `saveAtlasPatchToLocalFs()` — the endpoint already supports this flow.
