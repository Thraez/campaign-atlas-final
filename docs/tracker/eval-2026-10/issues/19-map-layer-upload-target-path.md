# Map layer uploads always get a real target path

Status: ready-for-human
Area: editor, local save

Found by the eval-12 review (2026-10-27). These problems were already there before that work.

- Upload names. `useMapLayers.ts:207-231` names an upload with its own `safeFilename` and keeps the original extension.
- `.png` fallback. When a layer has no `targetPath`, `buildSaveBatch.ts` falls back to `public/atlas/assets/maps/${id}.png`, in two places (the world.yaml `src` and the binary path). Only old localStorage layers saved without `targetPath` reach it.
- Empty path. `MapLayerPanel.tsx:563-564` lets the DM clear the path field, which stores `""`. `??` doesn't catch an empty string, so Save would write to the path `""`.

AGENTS.md says published image naming belongs to `src/atlas/assets/imageEncoding.ts`, and that maps stay lossless with `maps:optimize` owning them. Check which rule covers map layer uploads before changing the naming.

## Acceptance criteria

- Every saved map layer upload has a non-empty `targetPath` under `public/atlas/assets/maps/`. Clearing the field shows an error or restores the default; it never stores `""`.
- One function names an upload's target, and `buildSaveBatch.ts` uses it instead of the `${id}.png` literals. That function either lives in `imageEncoding.ts` or is called by the code that owns map naming. Say which, and why, in a comment.
- Old layers with no `targetPath` get the same name on save as a fresh upload would.
- Tests cover the empty string, the missing path and a fresh upload.

## Comments

- 2026-10-28 (agent, branch eval-19-upload-target-path): "Maps stay lossless; maps:optimize owns them" governs, so naming lives in `src/atlas/assets/mapLayerTarget.ts` (`mapLayerTargetPath`) and keeps the extension, not in `imageEncoding.ts` (which renames to `.webp`). Used by `useMapLayers.ts` and both spots in `buildSaveBatch.ts`. Clearing the path field restores the default (stores no path; the placeholder shows the default) rather than showing an error. Needs Isak's look at the path field in the editor. Superseded in part by the review fixes below.
- 2026-10-28 (agent, review fixes): `mapLayerTarget.ts` now owns map file naming for editor uploads and the Map Import Wizard (`safeFilename`, `defaultTargetPath` moved from `mapImport.ts`), so both name a file the same; dashes at either end of the name are stripped (`Fog Overlay (v2).PNG` → `fog-overlay-v2.png`). Provisional call: typed paths are forced under maps/, because maps stay lossless and the spec says so. A typed path outside `public/atlas/assets/maps/`, or a bare name, saves to the default; the field shows an amber hint (not a blocking error) naming the path Save will use. With no filename, the extension comes from the `dataUrl` MIME type. Typed values are trimmed when stored, and a legacy `""` is cleaned on load from localStorage.
- Known edge, left as is: undoing past a Save can leave the written file on disk with no layer pointing at it (an orphan).
