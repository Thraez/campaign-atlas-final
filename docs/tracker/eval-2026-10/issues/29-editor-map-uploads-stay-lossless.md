# Map uploads through the editor are never re-encoded lossy

Status: ready-for-agent
Area: editor, save pipeline, maps
Blocked by: #68 (ticket 19 owns map target naming)

Found by the eval-22 reviews on 2026-10-28. `maps:optimize` keeps maps lossless, but the editor's
save path does not:

- A `.jpg` map imported through the editor keeps its name (`defaultTargetPath` in
  `src/atlas/import/mapImport.ts` ~121). `cleanImageBytes` in `scripts/vite-plugin-atlas-save.ts`
  then strips its metadata by re-encoding it at quality 85.
- A JPG or lossy WebP sent to a `maps/*.webp` target would be re-encoded or grow. Until this
  ticket lands, eval-22 refuses that write.

Provisional call (State.md): a map upload is never re-encoded lossy. A JPG map keeps its own
compressed image data. Its metadata (EXIF, XMP, IPTC, comments) is removed by dropping those JPEG
segments, without decoding the image.

## Acceptance criteria

- A JPG map saved through the editor keeps its image data byte for byte, with no EXIF, XMP, IPTC or
  comment segments.
- A WebP map keeps its bytes. A PNG map follows eval-22 (lossless WebP).
- The target name (ticket 19's `mapLayerTarget.ts`) keeps the source's real extension, so a JPG is
  never saved under `.png` or `.webp`.
- Images outside `maps/` keep today's behaviour.
- Tests: a JPG with GPS EXIF is saved with its scan data unchanged and no EXIF. A JPG sent to a
  `.webp` map target is named `.jpg`, or refused with a clear error.
- tidemarrow/02 can then say "import through the editor" again.
