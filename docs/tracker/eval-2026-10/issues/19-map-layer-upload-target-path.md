# Map layer uploads always get a real target path

Status: ready-for-agent
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
