# The Map Import Wizard's zip strips map metadata like an editor upload

Status: in-review
Area: editor (map import, dev save endpoint)

Found in the review of eval-29 (2026-11-07).

Since eval-29 an editor map upload goes through `cleanImageBytes` in
`scripts/vite-plugin-atlas-save.ts`: a JPG map loses its EXIF, XMP, IPTC and comments with its image
data kept byte for byte (`scripts/atlas/jpegMetadata.ts`), a PNG map is re-encoded losslessly
without metadata, and a JPG whose EXIF orientation isn't normal, or a JPG under a `.png`/`.webp`
name, is refused. The Map Import Wizard (`src/atlas/import/MapImportWizard.tsx`) skipped all of
that: its zip download wrote each picked file's raw bytes, GPS EXIF and all, and the DM extracts
those into `public/atlas/assets/maps/`. `check-image-privacy` catches EXIF, IPTC and XMP at publish
but not COM segments or data after EOI. The wizard's own README and patch also told the DM to
extract `atlas-assets.zip`, while the download is `atlas-map-import.zip`.

## Acceptance criteria

- A failing test first: a JPG with GPS EXIF, XMP and an ICC profile comes out of the wizard's zip
  with no EXIF or XMP, the ICC profile kept and the scan data byte for byte; a PNG map loses its
  EXIF with pixels unchanged.
- The same refusals as an editor upload: EXIF orientation other than 1, a JPG under a `.png` or
  `.webp` name, a path outside `public/atlas/assets/`. A refusal builds no zip and names the file.
- The wizard uses the editor upload's strip (imported, not copied).
- The zip name is one constant, used by the download, the README and the patch header.
- `README.md` and `docs/tracker/tidemarrow/issues/02-tidemarrow-map.md` say new maps are drafted
  with the wizard.
- Typecheck, lint and the affected tests pass.

## Comments

2026-11-07 (agent): done on branch `eval-48-wizard-zip-strips-metadata`.

- Provisional call: keep the wizard. The first plan was to delete it (~1,260 lines), but it is the
  only way to draft a new map in the app: the editor's upload adds layers to a map that already
  exists in `world.yaml`, and nothing else in `src/` or `scripts/` creates a map document. Fixing
  the zip is smaller than building a "New map" action.
- The strip runs in Node (sharp, `Buffer`), so the browser can't call it directly. The asset branch
  of `handleSaveRequest` became `decodeAndCleanAsset` (data URL decode, size caps,
  `cleanImageBytes`, the same refusal payloads), and a new dev route
  `POST /__atlas/clean-asset { path, content }` (`handleCleanAssetRequest`, `DEV_API_PATHS.cleanAsset`)
  returns those bytes as base64 instead of writing them. No build lock: it writes nothing.
- `src/atlas/import/mapImportZip.ts` builds the zip, cleaning each image through that route first
  (`cleanAssetViaDevServer`); the wizard shows a refusal as a toast and downloads nothing.
- `MAP_IMPORT_ZIP_NAME` (`mapImport.ts`) is the one zip name; the Export step's package list no
  longer names a nested `atlas-assets.zip`.
- Test: `src/test/import/map-import-zip.test.ts` drives the real route handler in process.
- Not fixed here: a WebP map keeps its bytes in both paths (`cleanImageBytes` returns a `.webp`
  map unchanged so it never re-encodes), so a WebP's EXIF/XMP survives until `check-image-privacy`.
  The wizard's README still ends with `git push`.
