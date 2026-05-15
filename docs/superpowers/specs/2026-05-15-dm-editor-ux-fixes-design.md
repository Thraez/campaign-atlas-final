# DM Editor UX Fixes — Design

**Date:** 2026-05-15
**Owner:** Thraez
**Status:** Draft — pending user approval

## Problem

The DM editor and player viewer have a cluster of issues that block daily DM work:

1. **Gray-screen bug in player viewer.** Clicking a pin or picking a search result on desktop dims the whole screen and requires a second click to dismiss.
2. **Save button does not actually save** anything beyond pin coordinates. Map layers, regions, routes, fog reveals, grid, and map metadata are local browser drafts that have to be exported as patches and applied manually.
3. **Map manipulation is coordinate-only and anchor-inconsistent.** No drag-to-move on the image overlay, no resize handles, and the bottom-right grows when scaling because the top-left stays put.
4. **Placement workflow is buried.** The per-row "Place" button in the Pins tab is the only entry point — no toolbar action.
5. **Map import shows the wrong name.** The user-typed map name is preserved in data but the UI surfaces a filename-derived id in at least one place.
6. **Responsive break at 768–1023px.** The 420px desktop side panel kicks in at `md` and consumes 55% of a tablet viewport. Mobile users have no nav to reach Browse / Timeline / Edit.

## In scope (Phase 1: Foundation)

- Bug fixes for items 1, 5; semantic fix for items 3, 6.
- Save semantics rewrite (item 2): one click persists all dirty changes to canonical locations, with baseHash conflict protection, validated batches, backups in `.atlas-backups/`, and best-effort rollback on partial failure.
- Affordances for item 4 (Place Pin toolbar action).
- **Save status indicator + 5-minute nudge** — manual save only; visible status chip with file-impact sub-line, and a soft 5-minute-idle toast nudge.
- **Session undo/redo** (Phase 1B prerequisite) — in-memory mutation stack, Cmd+Z / Cmd+Shift+Z, persists across Saves but not across reloads.
- **`.md` import with staging review** — pick or drop individual `.md` files, hand-curate in a staging modal, target paths restricted to a folder allowlist, conflicts default unchecked, then commit as one batch.

## Out of scope (deferred to later phases)

- **Phase 2 (separate spec):** drag pins on the map; right-click context menus; marquee multi-select; **cross-session persistent undo**; keyboard shortcut customization; snap-to-grid; vertical icon-rail toolbar redesign; layers panel polish; **opt-in true autosave**.
- **Phase 3 (separate spec):** "Publish to live site" button that commits and pushes content changes from the editor (existing GHA at `.github/workflows/publish-atlas.yml` handles deploy).
- Playwright test infrastructure (user direction: skip for now).
- Landing-page redesign, Timeline axis, Browse type-filter, Player-mode build audit (separate tasks, tracked in earlier audit notes).

---

## A. Gray-screen fix

### Root cause

`AtlasViewer.openEntity()` ([src/pages/AtlasViewer.tsx:184-194](../../../src/pages/AtlasViewer.tsx)) unconditionally calls `setMobilePanelOpen(true)`. The Radix `<SheetOverlay>` in [src/components/ui/sheet.tsx:16-28](../../../src/components/ui/sheet.tsx) renders `fixed inset-0 z-50 bg-black/80` with no viewport gate. On desktop the SheetContent is `md:hidden` and invisible, but the overlay covers the screen.

### Fix

1. Introduce a new `useHasDesktopAside()` hook (matches `(min-width: 1024px)`). The sheet acts as the entity panel for every viewport below `lg`, not just mobile — closes the tablet dead zone where neither the aside nor the sheet was available.
2. In `AtlasViewer.tsx`:
   - Only set `setMobilePanelOpen(true)` when `!hasDesktopAside`.
   - Wrap the entire `<Sheet>` JSX in `{!hasDesktopAside && (...)}` so neither Content nor Overlay mounts when the aside is in use. This is safer than relying on `md:hidden` on Content alone.
3. No change to `sheet.tsx`; the component is correct, only its caller misuses it.

### Verification

- Open `/atlas` at 1440×900, search and pick a result. Right aside populates, no overlay.
- Open `/atlas` at 900×900 (between md and lg), click a pin. Bottom sheet slides up.
- Open `/atlas` at 375×812, click a pin. Bottom sheet appears as before.
- Console clean during all flows.

## B. Responsive aside + mobile nav

### Aside breakpoint

In `AtlasViewer.tsx:401`, change `hidden md:flex w-[420px]` → `hidden lg:flex w-[400px]` so the side panel only mounts at ≥1024px viewports. Add a collapse toggle inside the panel header (chevron icon) that hides the panel and replaces it with a thin re-expand strip. State persisted to `localStorage` under `atlas.viewer.asidePinned`.

### Mobile + tablet nav

Add a `Menu` icon on the left of the viewer toolbar with `lg:hidden` — visible at **every viewport below 1024px**, not just mobile. This closes the tablet dead zone (768–1023px) that would otherwise have neither the desktop aside nor a hamburger. Clicking opens a Radix `<Sheet side="left">` containing:
- Browse, Timeline, Edit pins (when `isDmToolsEnabled()`)
- Offline status block
- Updated-at timestamp

Same `lg:hidden` treatment in `AtlasBrowse.tsx` and `AtlasTimeline.tsx` headers so the nav is uniform across routes.

### Verification

- `/atlas` at 375, 768, 900, 1024, 1440 — verify there's always either a hamburger or the aside, never neither.
- Hamburger opens, routes navigable from inside any sub-route of `/atlas`.

## C. Unified Save

### Current model

- Pin placements: written to per-entity `.md` frontmatter via `/__atlas/save`.
- Map layers, regions, routes, fog reveals, grid, map metadata: held only in browser drafts. Each tab's "Export patch" button serializes a YAML fragment that the user pastes/applies to `content/<world>/_atlas/world.yaml` manually.

### New model

One Save button persists all dirty changes to their canonical files: the batch is validated before any write, then for each file a backup is taken and the new content is written via a `<path>.tmp` then `fs.rename` (atomic per file). If a rename fails partway through a batch, the endpoint attempts best-effort rollback by restoring the already-written files from their backups and surfaces a `partialWrite` flag to the UI.

#### Payload contract

`POST /__atlas/save` accepts a single JSON body:

```jsonc
{
  "files": [
    {
      "path": "content/astrath-deeprealm/places/thornhold.md",
      "content": "---\n... full file body ...\n",
      "kind": "entity-md",
      "baseHash": "sha256:abc123…"   // SHA-256 of file content at editor-load time, or null for new files
    },
    {
      "path": "content/astrath-deeprealm/_atlas/world.yaml",
      "content": "...full yaml...",
      "kind": "world-yaml",
      "baseHash": "sha256:def456…"
    }
  ],
  "rebuild": true
}
```

The endpoint:

1. Validates every file's `path` is inside the allowlisted `content/` tree (existing guard in `scripts/vite-plugin-atlas-save.ts`).
2. **Conflict check (per file).** For each file with a non-null `baseHash`, compute SHA-256 of the current on-disk content. If it does not match `baseHash`, abort the whole batch and return:
   ```jsonc
   { "error": "File changed on disk since editor loaded", "failedPath": "...", "reason": "stale-base", "currentHash": "sha256:..." }
   ```
   Status 409. No writes occur. The UI surfaces *"This file changed outside the editor — reload before saving."*
3. For each file, parses the proposed content:
   - `entity-md`: gray-matter parse to confirm valid YAML frontmatter + markdown.
   - `world-yaml`: `js-yaml` parse to confirm round-trippable, then re-prepend the captured leading-comment block from the existing file (see Risks section for full semantics).
4. If any file fails validation, returns 400 with `{ "error": "...", "failedPath": "..." }`. No writes occur.
5. For each file: copies the existing file to **`.atlas-backups/<timestamp>/<original-relative-path>`** at repo root (preserving directory structure), then writes the new content to `<path>.tmp` and `rename`s it over the original (atomic on POSIX, sufficiently atomic on Windows for our single-user case). Backup timestamps are pruned to the most recent **3** per `<original-relative-path>` so a DM can roll back the last three saves of any given file. `.atlas-backups/` is added to `.gitignore`.
6. If `rebuild: true`, runs the atlas build (same code path as `npm run atlas:build`) in-process. If the rebuild **fails after files were written**, return:
   ```jsonc
   { "saved": N, "rebuilt": false, "rebuildError": "...", "publishedAt": null }
   ```
   Status **207 Multi-Status** so the UI can distinguish *"files saved, atlas didn't rebuild — run `npm run atlas:build` manually"* from *"save failed entirely"*.
7. On full success: returns `{ "saved": N, "rebuilt": true, "publishedAt": "..." }` status 200.

#### Concurrency

- The endpoint is single-threaded: a second concurrent request is rejected with 423 Locked while one is in flight.
- Editor side: the Save button (and the chip click) is disabled while a save is in flight. Spamming Save can't cause overlapping writes.

#### Editor side

`AtlasPlacementEditor.tsx`:
- A single `buildSavePayload()` function gathers:
  - Dirty entity placements → entity `.md` files (existing `buildCanonicalPlacementChanges` logic, lifted into the new payload).
  - Dirty `world.yaml` slice: map layers, regions, routes, fog reveals, grids, map metadata (including map `name`).
- For each file in the payload, the SHA-256 hash captured at editor-load (or last successful save) is attached as `baseHash`. New files (no on-disk counterpart) carry `baseHash: null` — the endpoint treats those as create-only and refuses if the path already exists.
- `onSaveClick` (and chip-force-save) disables itself while a request is in flight. On success, clears all dirty flags, updates the in-memory hashes from the response, and toasts:
  - 200: *"Saved {entities} entities and world.yaml — atlas rebuilt in {ms}ms."*
  - 207: *"Saved files but atlas rebuild failed — run `npm run atlas:build`. Details: {error}."*
  - 409: *"{path} changed outside the editor. Reload before saving."* with a Reload button.
  - 400 / 423 / 5xx: generic *"Save failed: {error}"* with retry.
- Existing per-tab "Export patch" buttons remain as a power-user escape hatch but get a sub-label: *"Or save all changes with Save (top right)."*

#### Safety

- Backups in `.atlas-backups/<timestamp>/<original-relative-path>` at repo root (NOT inside `content/`). Added to `.gitignore`.
- Validation parse-back before write (described above).
- 3-version retention per file path; older timestamps pruned after each write.
- Per-file atomic temp + rename. Multi-file batch is **best-effort transactional** — partial-write failures attempt rollback from backups and surface `partialWrite: true` to the UI rather than claim true atomicity.
- Endpoint stays behind `apply: "serve"` in the Vite plugin — production player builds never expose it.

### Verification

- Make changes in 3 tabs (e.g., move a layer, add a region, place a pin), click Save.
- Inspect: entity `.md` frontmatter has new placement, `world.yaml` has new region + updated map metadata, `.atlas-backups/<ts>/` has the previous versions.
- Atlas rebuilds; `/atlas` shows the changes without page reload (loader re-fetches on focus or via SW network-first).
- Force an invalid YAML edit (e.g., insert a syntax error via a hex editor in the draft state if possible) — Save fails, no files written.

## D. Map manipulation: drag + resize

### Current behavior

X/Y are top-left coordinates. Nudge buttons step ±100 / ±1000 / ±10000. Scale-preset buttons multiply width/height without touching X/Y, so the bottom-right grows.

### New behavior

When a layer is selected in the Maps → Layers tab:

1. **Drag-to-move.** The selected `ImageOverlay` becomes draggable. While dragging, X/Y number fields update live. Drop commits the change.
2. **Corner resize handles.** Four small square markers (`L.Marker` with a div-icon) overlay the layer corners. Dragging a corner anchors the opposite corner — width and height update live; X and Y move only on the corners adjacent to that opposite corner. The "Lock aspect ratio" checkbox controls aspect lock.
3. **Modifier overrides.** Hold Alt while dragging a corner: scale from center (X and Y both adjust). Hold Shift while dragging a corner: force aspect lock regardless of checkbox.
4. **Scale-preset buttons** (50%/75%/100%/125%/150%/FitW/FitH) change to anchor at the layer's **center** — these are one-shot transforms, not drags, so "opposite corner" doesn't apply. Center is the natural default for "make this 75% size in place".

### Verification

- Drag a layer from upper-left of map to lower-right — number fields track, drop commits.
- Drag bottom-right corner — top-left stays put, layer grows toward bottom-right.
- Drag top-left corner — bottom-right stays put.
- Hold Alt + drag corner — center stays put, all corners move.
- Click 75% — layer shrinks centered, doesn't drift to top-left.

## E. Place-pin discoverability

Add a `+ Place Pin` button to the editor toolbar (right of the Save button or in the secondary tier). Clicking opens a popover listing unplaced entities (filterable). Picking one enters the existing crosshair placement flow.

The existing per-row Place buttons in the Pins tab list stay as-is. The top-of-tab "Place next" toggle stays.

When in placement mode, the existing banner *"Click on the map to place {title}"* stays. Add a visible Cancel button in the banner (Esc shortcut already documented).

### Verification

- Toolbar button visible on desktop. Click → popover. Pick → crosshair appears.
- On mobile (≥md but <lg): button is still reachable from the toolbar's overflow.

## F. Map import name display

### Investigation note

Explore confirmed user-typed `mapName` is preserved in the data pipeline (`scripts/atlas/mapImport.ts:201-212`). The UI bug is in the editor display layer.

### Fix plan

Audit the Maps tab to find every place a map or layer name is rendered. Where the layer id is shown as the heading, switch to `map.name` and demote `layer.id` to a subtitle.

## G. Save status indicator + periodic nudge (no surprise autosave)

### Why not automatic autosave

Real autosave is unsafe when the DM is experimenting — moving a pin to test placement, dragging a layer to see if a position feels right, etc. Committing those mid-experiment is a worse experience than the current "Save does nothing" bug. So Phase 1 keeps writes explicit, but makes dirty state visible and reminds the DM when they've drifted.

### Status indicator (always visible)

A small chip in the editor toolbar shows the current state:

| State | Visual | When |
|-------|--------|------|
| Saved | green dot + "Saved" + relative time ("3s ago") | no dirty state, no save in flight |
| Unsaved | amber dot + "Unsaved" + sub-line `"world.yaml + 2 entities"` | one or more dirty edits since last save |
| Saving | spinner + "Saving…" | request in flight |
| Save failed | red dot + "Save failed — retry" (clickable) | endpoint returned error or network failed |

The sub-line shows the **file impact** ("world.yaml + 2 entities"), not a numeric mutation count — file/object impact is what a DM actually cares about. Clicking the chip force-saves (same as the main Save button).

### Periodic nudge

When the dirty state has persisted for more than 5 minutes *and* at least one edit has been made in that window, surface a non-blocking toast at the bottom-right: *"You have unsaved changes — last edit M minutes ago. [Save now] [Remind me later]"*. *Remind me later* re-arms the 5-minute timer. The toast is dismissible.

### Failure handling

- Save validation failure (Section C step 2): chip goes red, dirty state preserved, toast names the offending file. User can manually save again or undo their edit.
- Network failure: same red state. Retry on click.
- 409 stale-base: chip goes red; toast surfaces the conflicting file with a Reload button.
- 207 partial-write: chip transitions to a warning state with the impacted-file list and a link to `.atlas-backups/<ts>/`.

### Out of scope for Phase 1

True autosave (a checkbox that commits 5 seconds after an edit) is **deferred to Phase 2** along with cross-session undo/redo persistence. The status chip + 5-minute nudge are the only automatic save-related behaviors in Phase 1.

### Verification

- Make 3 edits, don't save. Chip reads *"Unsaved"* + sub-line *"world.yaml + 1 entities"*. Five minutes pass — nudge toast appears.
- Click Save. Chip transitions Unsaved → Saving → Saved with relative time.
- Hand-edit a file outside the editor → save in editor → chip turns red, toast surfaces the path + Reload.

## H. `.md` import with staging review

### Entry points

Two ways to start an import — both funnel into the same staging review:

1. **Toolbar button** — *"Import .md files…"* in the Entities tab opens the native OS file picker (`<input type="file" multiple accept=".md">`). This is the recommended path because the OS picker lets the DM hand-select exactly which files to include.
2. **Drag-and-drop** — dragging one or more individual `.md` files over the `/atlas/edit` route shows a full-area overlay: *"Drop .md files to stage for import."* Non-`.md` files are rejected with a toast. **Folder drag-and-drop is explicitly not supported** in Phase 1 (browser folder traversal APIs are unreliable); use the file picker for multi-file imports.

Both paths land in the staging review — files are *never* written to disk before the DM clicks "Import N file(s)" in the staging modal.

### Staging modal

A dialog lists each selected/dropped file as a row:

| ☑ | Filename | Inferred type | Target path | Notes |
|---|----------|---------------|-------------|-------|
| ☑ | `thornhold.md` | `place` (from frontmatter) | `content/astrath-deeprealm/places/thornhold.md` | — |
| ☑ | `garron.md` | (none) → `imports` | `content/astrath-deeprealm/imports/garron.md` | No `type` in frontmatter |
| ☐ | `notes.md` | (none) → `imports` | `content/astrath-deeprealm/imports/notes.md` | (DM unchecked this one) |

For each row the DM can:
- Toggle the include checkbox (default ON).
- Edit the inferred type via a dropdown (changes the target path live).
- Override the target path manually if they want.

A footer button reads *"Import N file(s)"* — only the checked rows are submitted to the unified Save endpoint as a single batch. Cancel discards the staging set entirely; no files are touched.

### Inference rules

For each file:

1. Read via `FileReader`.
2. Parse frontmatter with `gray-matter`. Pull `title`, `id`, `type`.
3. **The file's own frontmatter `path` field is IGNORED** — shown only as a suggestion in a tooltip *"Source file suggested path: …"*, never used as the actual target. This prevents an imported file from steering itself into `_atlas/world.yaml`, another world's folder, or a DM-only folder.
4. Compute default target: `content/<active-world-id>/<type-folder>/<id-or-filename-stem>.md`. `<type-folder>` is the pluralized type from frontmatter when known, otherwise `imports/`.
5. **Target paths must fall under `content/<active-world-id>/{places,people,factions,items,events,regions,imports}/**`**. Rows whose computed or DM-edited target falls outside this allowlist render in red and are uncheckable until the DM fixes the path.
6. Validate frontmatter parses back. Files that fail to parse appear in the staging modal as a disabled row with the error message; they cannot be included until the DM fixes the source file.

### Conflict handling

If a target path already exists, the staging row shows a warning chip *"Will overwrite — explicit confirm required"* and the row defaults to **unchecked**. The DM must explicitly re-check the row to opt in. Re-checking flips the chip to *"Will overwrite — existing file backed up"*. The unified Save endpoint's backup machinery (Section C) handles the actual backup.

### Paste alternative

A small "Paste markdown" button in the Entities tab opens a Radix dialog with: title input, type dropdown, textarea for the body. Submitting creates a single `.md` file and routes it through the same Save endpoint (no staging modal needed — only one file, intent is unambiguous).

### Verification

- Pick three `.md` files via the toolbar button; staging modal appears. Uncheck one. Click "Import 2 files". Verify only those two land on disk; the third is not written.
- Drag three individual `.md` files onto the editor. All appear in the staging modal. DM curates the selection. Only selected files import.
- Drag a binary: toast says "Only .md files supported"; staging modal does not open.
- Import a `.md` whose frontmatter has `path: somewhere/else.md` → the staging row's target uses the inferred default; the file's path appears only as a tooltip suggestion.
- Try to edit a row's target path outside the allowlist (e.g. `content/<world>/_atlas/world.yaml`) → row turns red and uncheckable.
- Import a `.md` whose path conflicts with an existing entity. Staging row defaults unchecked with *"explicit confirm required"*. Re-check explicitly → import → `.atlas-backups/<ts>/...` has the prior version of that file.

## I. Session undo/redo

Added in Phase 1B as a prerequisite for the drag/resize affordances — those operations would be too risky to ship without a way to back out an accidental move.

### Behavior

- A mutation stack in memory, capped at 50 entries. Each editor mutation (place pin, move pin, drag/resize layer, add/edit/delete region or route, fog reveal change, grid toggle, map metadata edit) pushes its inverse onto the stack.
- `Cmd+Z` / `Ctrl+Z` for undo; `Cmd+Shift+Z` / `Ctrl+Y` for redo. Toolbar Undo/Redo buttons mirror the shortcuts and gray out when their stack is empty.
- The stack **persists across Saves**. Undoing past a save boundary does NOT automatically re-write disk — it puts the editor back into the prior in-memory state and flips the chip back to Unsaved. The DM clicks Save again if they want the rollback committed.
- The stack is in-memory only — cleared on tab close or page reload. Cross-session persistent undo is deferred to Phase 2.
- `.md` import (Section H) is **not** undoable through this stack (those mutations are file-system level). Documented; cross-session safety is via `.atlas-backups/<ts>/`.

### Verification

- Drag a layer 100 px right → Cmd+Z → layer returns to original position; chip reads Unsaved.
- Cmd+Shift+Z → layer moves right again.
- Save, then undo across the save boundary → chip flips Saved → Unsaved; state matches pre-save.
- Tab close → reload → undo stack empty (documented).

## Non-goals (explicit)

- No Playwright suite at this time (user direction).
- No redesign of Landing or Timeline visual axes.
- No cross-session persistent undo in Phase 1 — session-only is enough; cross-session arrives in Phase 2.
- No true opt-in autosave in Phase 1 — deferred to Phase 2.
- No git commit/push from the editor in Phase 1 — that's Phase 3.

## Risks

- **YAML header-comment preservation in `world.yaml`.** The current `content/astrath-deeprealm/_atlas/world.yaml` opens with a 9-line comment block describing the canon/source-of-truth rules. `js-yaml` does not preserve comments on round-trip, so a naive write would strip it. **Mitigation (in scope for Phase 1):** the save routine reads the existing file (when present), captures the leading comment block (lines beginning with `#` or blank lines before the first non-comment line), and re-prepends that exact block to the serialized output. Inline comments between keys are not preserved — documented limitation, none exist in the current file. New worlds (no existing `world.yaml`) get a default boilerplate header.
- **In-process atlas rebuild may be slow** on large worlds. Current world has 3 entities; not a concern yet. If rebuild >2s, move to a debounced background rebuild and toast when done.
- **Backups directory could grow** if not cleaned. Mitigation: cap at 3 per file path at `.atlas-backups/`; surface the path in editor settings so the DM can manage manually if needed.
- **External edits during Save**. If the DM has a file open in Obsidian and edits it while the editor has it loaded, the baseHash conflict check (Section A5) returns 409 stale-base and the editor refuses to write. No silent overwrites.

## Verification approach

Manual only (no Playwright). Each section above lists a verification block. After implementation, walk the entire DM happy path:

1. Open `/atlas/edit`, import a map (drag a PNG), type a Name, see the typed name persists in the layer list.
2. Toggle "Edit geometry" ON. Drag the layer to reposition; resize from a corner (opposite corner anchored); hold Alt to scale-from-center. Cmd+Z undoes the resize.
3. Add a region, add a route, add a fog reveal, place 2 pins via the "+ Place Pin" toolbar button.
4. Watch the status chip — it reads *"Unsaved"* + sub-line `"world.yaml + 1 entities"`. Click Save (or the chip). Status goes Unsaved → Saving → Saved. Verify all dirty changes land in the right files (entity `.md` + `world.yaml` with its header comment preserved byte-for-byte), backups appear in `.atlas-backups/<timestamp>/`, and `/atlas` reflects them.
5. Click "Import .md files…", pick three `.md` files; staging modal lists all three with inferred types and target paths under approved folders. Uncheck one. Click "Import 2 file(s)". Verify only those two land on disk and appear as entities.
6. Navigate to `/atlas` (player view). Search for one of the placed entities → click → entity panel opens, **no gray screen**.
7. Resize the browser to 900×900 (between md and lg) — map and entity sheet (not the desktop aside) both usable, panel doesn't dominate.
8. Mobile viewport (375): hamburger nav opens; Browse / Timeline reachable from inside `/atlas`.
9. Roll-back test: open `.atlas-backups/<latest-ts>/`, copy a backed-up `.md` over its live counterpart, confirm `/atlas` reflects the rollback after rebuild.

## Open questions

None — all design decisions resolved with user during brainstorming session 2026-05-15.
