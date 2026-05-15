# DM Editor UX Overhaul — Phase 1C Handover (2026-05-15)

Hands a fresh Claude conversation everything needed to ship Phase 1C — the only Phase 1 chunk that remains. Read this end-to-end before touching anything. If anything here contradicts the design spec, the spec wins.

---

## 0. Where to start

Read these in order:

1. **Design spec** — `docs/superpowers/specs/2026-05-15-dm-editor-ux-fixes-design.md` (sections H and §"Verification approach"). Authoritative description of every Phase 1C sub-task.
2. **Implementation plan** — `C:\Users\pvpro\.claude\plans\sunny-brewing-cray.md` (the Phase 1C section). Lives outside the repo because it's the harness's plan file.
3. **Earlier handovers** — `docs/superpowers/specs/2026-05-15-dm-editor-phase1a-handover.md` is still useful for the Save endpoint contract and the file/folder map.
4. **PRs already merged** — #7 (A1–A12), #8 (A13), #9 (Phase 1B + A10 + B0 save-boundary undo).
5. **CLAUDE.md** at repo root — the hard rules the project enforces (don't edit generated artifacts; player builds must not contain DM content; editor code gated by `__INCLUDE_EDITOR__`).

---

## 1. State of the work

### Landed (everything except Phase 1C)

Status as of 2026-05-15:

| Phase | What | Where |
|---|---|---|
| **1A.1–1A.12** | Gray-screen fix, responsive nav, unified Save endpoint with backups + 409 + 423 + 207 | PR #7 (`f6e1ccc`, `0dfe42b`) |
| **1A.13** | One-click Save writes pins + world.yaml + uploaded asset binaries in a single batch | PR #8 (`97286e4`) |
| **1B.B0** | Session undo/redo stack — `useUndoStack`, wired into pins / map metadata / layers / region / route / fog drafts | PR #9 (`f0afdd8`) |
| **1B.B0 save boundary** | Single undo entry across save restores all pre-save dirty state in one Cmd+Z | PR #9 (`c152643`) |
| **1B.B1** | "Edit geometry" toggle + drag-to-move on selected layer | PR #9 (`f0afdd8`) |
| **1B.B2** | Corner resize handles, Shift = aspect lock, Alt = center-anchored | PR #9 (`f0afdd8`) |
| **1B.B3** | Center-anchored scale presets (50/75/.../FitW/FitH no longer drift the layer) | PR #9 (`f0afdd8`) |
| **1B.B4** | "+ Place Pin" toolbar popover with filterable unplaced-entity list | PR #9 (`f0afdd8`) |
| **A10** | `runBuild()` exported from `scripts/build-atlas.ts`; the dev save plugin now imports and awaits it instead of spawning `tsx scripts/build-atlas.ts` | PR #9 (`c152643`) |

### What works now (verifiable in the dev editor)

- Save chip, 5-min nudge, backup machinery, 409 stale-base + 423 Locked + 207 partial-rebuild.
- Single Save writes pins + world.yaml + uploaded asset binaries atomically.
- Cmd+Z / Cmd+Shift+Z (and Ctrl+Y) undoes any editor mutation; toolbar Undo / Redo buttons with disabled states.
- Save boundary itself is a single undo entry — Cmd+Z after a save restores all the dirty drafts in one keystroke, chip flips Saved → Unsaved.
- "Edit geometry" toggle in Maps → Layers panel. Selected layer body is draggable; map dragging is disabled mid-drag; Esc cancels.
- Four corner handles when in edit-geometry + selected; Shift locks aspect; Alt scales from center; Esc cancels in-progress resize.
- Scale presets keep layer center fixed.
- "+ Place Pin" toolbar popover lists unplaced entities, filterable, picks into the existing crosshair flow.
- Atlas rebuild after save runs in-process (~600ms-3s faster than the old `spawn(tsx ...)` path).

### Still TODO — Phase 1C only

- **C1** — entry points: toolbar "Import .md files…" + drag-and-drop overlay on `/atlas/edit`.
- **C2** — staging modal with folder allowlist + conflict-default-unchecked semantics.
- **C3** — commit through unified `/__atlas/save` as one batch.
- **C4** — paste-markdown dialog (single-file fast path).

Everything beyond Phase 1 (Phase 2 drag-pins/persistent-undo/autosave, Phase 3 publish-from-editor) is out of scope per the design spec; don't pull them in without explicit user direction.

---

## 2. Critical files and where logic lives

### Files you'll likely create

| Path | Purpose |
|---|---|
| `src/atlas/import/StagingModal.tsx` | The Radix `<Dialog>` for C2. Lists pending files; lets the DM curate type, target path, conflict opt-in; commits via unified Save. |
| `src/atlas/import/EditorImportDropZone.tsx` *(or inline into AtlasPlacementEditor)* | Full-area drag-and-drop overlay on `/atlas/edit` for C1. Files dropped here open the staging modal. |
| `src/atlas/import/PasteMarkdownDialog.tsx` | C4 standalone dialog: title + type + body → one .md file. Commits via unified Save (no staging needed). |
| `src/test/staging-modal.test.tsx` | Coverage for C2 inference + path-allowlist + conflict-default-unchecked. |
| `src/test/paste-markdown.test.tsx` | Coverage for C4 happy path + path-allowlist guard. |

### Files you'll touch but not rewrite

| Path | What to change |
|---|---|
| `src/atlas/tabs/EntitiesTab.tsx` | Add the C1 toolbar button (`<input type="file" multiple accept=".md">`) and the C4 "Paste markdown" button. |
| `src/pages/AtlasPlacementEditor.tsx` | Mount the drag-drop overlay on the route shell; thread import-staging state into the editor; pass project + activeWorldId into StagingModal so it can build target paths. |

### Existing infrastructure to REUSE — do not reinvent

| Path | What it gives you |
|---|---|
| `src/atlas/import/parseObsidian.ts` | `parseObsidianFile()`, gray-matter parsing, wikilink extraction, summary generation. Designed for the existing ImportPanel but works on individual .md files too. |
| `src/atlas/import/inferType.ts` | `inferTypeFromPath(relPath)` + `IGNORED_FOLDERS`. Returns "place", "person", "faction", etc. |
| `src/atlas/save/localFsSave.ts` | `saveAtlasPatchToLocalFs(batch)` — the unified Save client. Already takes `FileChange[]` with `kind: "entity-md"`, `baseHash`, `content`. Use this as your commit endpoint. |
| `src/atlas/save/canonicalPlacementSave.ts` | `mergePlacementsIntoFrontmatter()` — pattern for building the entity-md content. Not directly reusable for import (no existing placements) but useful as a reference. |
| `src/atlas/save/sourcePathAllowlist.ts` | `isWritableSourcePath()`. Run every staging row's target path through this on the client side too — the server enforces it, but UX is better if invalid rows turn red before the user clicks Commit. |
| `src/atlas/save/DiffPreviewModal.tsx` | The post-Save toast + write-result UI. Phase 1C does NOT need to render this — the unified Save endpoint already drives it via the existing wiring. Just make sure your batch goes through the same `onSaveClick`-style flow. |
| `src/components/ui/dialog.tsx` | Radix Dialog wrapper. Use this for C2 and C4 modals. |
| `src/components/ui/scroll-area.tsx` | For long lists in the staging modal. |
| `src/atlas/import/ImportPanel.tsx` | The pre-existing Obsidian-vault import tab. Keep it intact — it's a power-user tool that emits YAML patches. C1–C4 add the "drop a couple files quickly" path; both can coexist. |
| `gray-matter` (npm) | Already a dependency. Use `matter.parse()` to read frontmatter from staged files. |

---

## 3. The four sub-tasks in detail

### C1 — Entry points

**Toolbar button (preferred path).** In `src/atlas/tabs/EntitiesTab.tsx`, add a button labeled *"Import .md files…"* near the existing Entities header. Clicking opens a native file picker:

```tsx
<input type="file" multiple accept=".md" hidden ref={fileInputRef}
  onChange={(e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onStartStaging(files);
    e.target.value = "";
  }} />
```

The native picker is the recommended UX because the OS lets the DM cmd-click exactly the files they want.

**Drag-and-drop overlay.** Wrap the `/atlas/edit` route shell in a drop zone (or add a sibling overlay element in `AtlasPlacementEditor.tsx`). On dragenter, show a full-area overlay: *"Drop .md files to stage for import"*. Reject non-.md files with a Sonner toast: *"Only .md files supported"*.

**Folder drag-and-drop is explicitly out of scope.** `webkitdirectory` and `DataTransferItem` folder traversal are too fragile across browsers and offer marginal UX gain over the file picker. Document this if a DM asks.

Both paths funnel into the same staging modal — files are NEVER written to disk before the DM clicks Import.

### C2 — Staging modal

Radix `<Dialog>`. Each row:

| ☑ | Filename | Inferred type | Target path | Notes |
|---|---|---|---|---|
| ☑ | `thornhold.md` | `place` (from frontmatter) | `content/<worldId>/places/thornhold.md` | — |
| ☑ | `garron.md` | — → `imports` | `content/<worldId>/imports/garron.md` | No `type` in frontmatter |
| ☐ | `conflict.md` | `place` | `content/<worldId>/places/conflict.md` | **Will overwrite — explicit confirm required** |

#### Per-row logic

1. **Parse frontmatter via `gray-matter`** — pull `title`, `id`, `type`. Don't fail the row if frontmatter is missing; just fall back.
2. **Infer the type**: prefer frontmatter `type` → otherwise null → maps to the `imports/` folder.
3. **Compute target path**: `content/<active-world-id>/<type-folder>/<id-or-filename-stem>.md`. The `<type-folder>` is the pluralized type (`place` → `places`, etc.); fall back to `imports/` when type is unknown.
4. **Validate via `isWritableSourcePath()`** — show the row in red and disable its checkbox if the path is outside `content/<active-world-id>/{places,people,factions,items,events,regions,imports}/**`.
5. **Check for existing file** — issue a GET `/__atlas/read?path=<targetPath>` (already supported by the dev plugin). On 200, set `existing: true`, default the row UNCHECKED, show "Will overwrite — explicit confirm required". On 404, set `existing: false` and default checked. Compute `baseHash` from the existing content for conflict-safe saves.
6. **Surface frontmatter `path` as a tooltip suggestion only** — never use it as the target. Spoiler-safety: an imported file could otherwise steer itself into `_atlas/world.yaml` or another world's folder.

#### Editing a row

- **Type dropdown** → updates the target path live (re-folders the file).
- **Target path input** → free-form, but immediately re-validated against the allowlist.
- **Include checkbox** → if path is outside the allowlist, this is disabled.

#### Footer

- Cancel: discard everything; no files touched.
- Import N file(s): builds a `FileChange[]` for only the checked rows, with `kind: "entity-md"`, `baseHash` set to the captured hash for overwrites or `null` for new files, then routes through `saveAtlasPatchToLocalFs()`.

### C3 — Commit through unified Save

The unified Save endpoint (`POST /__atlas/save`) already handles every contract you need:

- 409 `already-exists` if the row was new (`baseHash: null`) but the file appeared between staging-check and commit.
- 409 `stale-base` if an overwrite row's hash changed since staging.
- 400 `duplicate-path` if two rows in the same batch resolve to the same target (you should pre-check this on the client to avoid a wasted round-trip).
- Backups under `.atlas-backups/<ts>/` for every overwrite.
- 207 partial-write if a mid-batch rename fails, with rollback.
- 207 rebuild-failed if the post-write atlas rebuild fails.

After a successful commit:
- Toast: *"Imported N entities. Atlas rebuilt in {ms}ms."*
- The editor's existing `onSaved` handler (in `AtlasPlacementEditor.tsx`) will re-load `atlas.json` and surface the new entities. Phase 1C should NOT duplicate that flow — call into the same code path.

### C4 — Paste markdown dialog

Standalone Radix Dialog in the Entities tab. Inputs:

- **Title** (required) — used as the entity `title` in frontmatter.
- **Type dropdown** (defaults to `place`) — drives the target folder.
- **Body textarea** — the markdown body. Frontmatter is auto-built; the DM doesn't have to type `---` blocks.

Submit:

1. Build the frontmatter: `{ title, type, visibility: "dm" }` (DM-default — explicit publish is a separate edit).
2. Compute `target_path = content/<active-world-id>/<type-folder>/<slug(title)>.md`.
3. `FileChange = { path: target_path, content: matter.stringify(body, frontmatter), kind: "entity-md", baseHash: null }`.
4. Route through unified Save. On 409 `already-exists`, surface a "File already exists — pick a different title" toast.

No staging modal needed for C4 — intent is unambiguous (one file, DM typed everything).

---

## 4. The unified Save payload contract (reference)

```jsonc
POST /__atlas/save
{
  "files": [
    {
      "path": "content/astrath-deeprealm/places/thornhold.md",
      "content": "---\n...\n",
      "kind": "entity-md",
      "baseHash": "sha256:abc…"  // null for create-only
    }
  ],
  "rebuild": true
}
```

Response codes:

- **200** — full success. `{ saved, paths, files: [{path, hash}], rebuilt: true, publishedAt, build }`.
- **207** — writes succeeded but either rebuild failed (`rebuilt: false`, `rebuildError`) OR mid-batch write failure and rollback (`partialWrite: true`, `rolledBack`).
- **400** — `InvalidBody`, `DisallowedPath`, `OversizedContent`, `InvalidContent` (parse-back failed), `duplicate-path`.
- **409** — `Conflict` `{reason, failedPath, currentHash}`. Reason is one of `stale-base | missing-base | already-exists`.
- **423** — `Locked` (another save in flight).
- **500** — internal errors.

Path allowlist on the server: `content/**/*.md`, `content/**/_atlas/*.yaml`, and `public/atlas/assets/maps/**/*.{png,jpg,jpeg,webp,gif}`. Anything else returns 400 `DisallowedPath`. For Phase 1C you only emit `entity-md` (.md under `content/<world>/`) so the allowlist surface is narrow.

---

## 5. Key decisions (so the next conversation doesn't relitigate)

1. **Frontmatter `path` is ignored as a target source** — surfaced only as a tooltip suggestion. Prevents an imported file from steering itself into `_atlas/world.yaml`, another world's folder, or a DM-only folder.
2. **Target paths are restricted to `content/<active-world-id>/{places,people,factions,items,events,regions,imports}/**`**. Rows outside this allowlist are red and uncheckable.
3. **Conflict rows default UNCHECKED** with a "Will overwrite — explicit confirm required" chip. Re-checking opts in.
4. **Folder drag-and-drop is NOT supported.** `webkitdirectory` / folder traversal is too fragile. Use the file picker for multi-file imports.
5. **`.md` import is NOT undoable through the editor's undo stack.** The undo stack is in-memory and doesn't represent file-system mutations. Backups under `.atlas-backups/<ts>/` cover rollback if the DM imports the wrong file.
6. **DM-visibility default for new files** — paste-markdown uses `visibility: "dm"`. The DM must explicitly publish via a follow-up edit. This is intentional spoiler-safety; don't change it.
7. **The existing `ImportPanel` stays.** It's a power-user Obsidian-vault migration tool. C1–C4 are the "drop a few files quickly" path. Both should coexist.
8. **Use unified Save for commit** — never write through the legacy ImportPanel patch-download flow. The unified Save endpoint owns backups, rebuilds, and 409/207 semantics; bypassing it loses all of that.

---

## 6. How to run and verify

From the worktree:

```
npm run dev                            # vite, port 8080 — full editor + save endpoint
npm test                                # vitest (currently 491/491)
npm run test:watch                      # vitest in watch mode
npm run lint                            # eslint (only pre-existing baseRegions/baseRoutes warnings)
npx tsc --noEmit                        # typecheck
npm run atlas:build                     # rebuild .local-atlas/atlas.json (dev)
npm run atlas:check-secrets <dir>       # secret-leak scan
npm run atlas:publish                   # full player build + all scans
```

The dev plugin's endpoints (gated by `apply: "serve"`):

- `GET /__atlas/read?path=content/...` — reads an allowlisted file. Returns `{ path, contents }` on 200, `{ error, path }` on 4xx.
- `POST /__atlas/save` — the unified Save endpoint described above.

To inspect backups during testing:

```
ls .atlas-backups/                                       # timestamp dirs
ls .atlas-backups/<ts>/content/astrath-deeprealm/        # backed-up tree
```

To trigger 409 stale-base manually: edit any entity .md outside the editor while the editor is open, then save in the editor — toast should turn red with a Reload CTA.

---

## 7. Phase 1C verification gates (must pass before merging)

From the design spec §H "Verification" + §"Verification approach":

1. Toolbar "Import .md files…" → pick three .md files → staging modal lists all three with inferred types + target paths under approved folders. Uncheck one → click "Import 2 file(s)" → only those two land on disk; the third is not written.
2. Drag three individual .md files onto the editor route shell. All three appear in the staging modal. DM curates the selection. Only selected files import.
3. Drag a binary (e.g. .png) → toast: *"Only .md files supported"*; staging modal does NOT open.
4. Import a .md whose frontmatter has `path: somewhere/else.md` → staging row uses the inferred default; the file's frontmatter `path` is surfaced as a tooltip only.
5. Try to edit a row's target path to something outside the allowlist (e.g. `content/<world>/_atlas/world.yaml`) → row turns red, checkbox is disabled until the DM fixes the path.
6. Import a .md whose target conflicts with an existing entity → staging row defaults UNCHECKED with "explicit confirm required". Re-check explicitly → import → `.atlas-backups/<ts>/...` has the prior version.
7. Paste-markdown dialog → title + body + type → submit → file at expected path, atlas rebuilds, entity appears in the editor.
8. Verify the post-import toast + chip behaviour matches the rest of the unified Save flow (Saved + relative time, 5-min nudge if dirty edits remain, etc.).
9. Full happy path from spec §"Verification approach" still works end-to-end.

Stage gate before merging: `npm test` green, `npx tsc --noEmit` clean, `npm run lint` 0 new errors, `npm run build` succeeds, `npm run atlas:check-secrets dist` clean.

---

## 8. Recommended first move for the next conversation

1. Read this doc, then `2026-05-15-dm-editor-ux-fixes-design.md` §H, then the plan file's Phase 1C section.
2. `git fetch && git checkout main && git pull` to get the latest. Phase 1B + A10 + B0 polish merged via PR #9 (or the branch `claude/charming-hoover-af639c` if it hasn't merged yet — check first).
3. Start a worktree on a new branch for Phase 1C.
4. Run `npm test` and `npm run lint` to confirm baseline is green.
5. Build C2's StagingModal FIRST — it's the keystone. C1's two entry points and C4's paste dialog all feed into (or wrap) the same primitive: a `FileChange[]` going through `saveAtlasPatchToLocalFs()`.
   - Write the staging-modal tests first (TDD). Test path inference, allowlist guard, conflict-default-unchecked.
   - Then build the modal UI.
   - Then build the two C1 entry points (toolbar button + drop zone).
   - Then build C4 last — it's the smallest piece.

Good luck. The Save endpoint is solid; Phase 1C should be straightforward UI work with disciplined target-path validation.
