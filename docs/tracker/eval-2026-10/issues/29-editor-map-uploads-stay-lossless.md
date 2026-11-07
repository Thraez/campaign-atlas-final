# Map uploads through the editor are never re-encoded lossy

Status: done
Area: editor, save pipeline, maps

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

## Comments

2026-11-07 (agent): done on branch `eval-29-lossless-jpg-maps`.

- `scripts/atlas/jpegMetadata.ts` walks the JPEG's segments without decoding. It keeps the frame,
  tables and every scan (entropy-coded data copied byte for byte, progressive scans included), and
  APP0 JFIF (without its thumbnail), APP2 ICC_PROFILE and APP14 Adobe, which change how the pixels render. It drops every
  other APPn (APP1 EXIF/XMP, APP13 IPTC, APP2 MPF, maker blocks), COM, and anything after EOI.
- `cleanImageBytes` sends a JPG under `assets/maps/` there instead of the q85 re-encode. A JPG
  under a map name other than `.jpg`/`.jpeg` is refused (`map-format-refused`, "Save it under a
  .jpg name instead"). Images outside `maps/` are unchanged.
- `mapLayerTarget.ts`: `mapTargetFitsSource` and `mapLayerTargetPath` give a map its real
  extension (the dataUrl's MIME type first, then the file name), so a JPG typed or defaulted as
  `.webp`/`.png` is saved as `.jpg`; PNG under `.webp` stays allowed (eval-22's lossless encode).
  MapLayerPanel says so under the path field. The Map Import Wizard blocks a JPG whose asset path
  isn't `.jpg`.
- The eval-22 refusal of JPG to `maps/*.webp` stays: there is no lossless way to get there. It now
  tells the DM to keep `.jpg` instead of naming this ticket, and the editor never sends that
  combination any more.
- Provisional calls: ICC is kept (dropping it shifts colours on wide-gamut scans). EXIF
  orientation can't survive the strip and a JPEG can't be rotated without decoding, so a JPG map
  whose orientation isn't 1 is refused with a clear error ("rotate it in an image editor"), rather
  than published sideways or kept with a minimal EXIF block.
- Review fixes (same day): the walker allowlists the decoder's markers (SOFn, DHT, DAC, DQT, DRI,
  DNL, DHP, EXP, SOS, RSTn, TEM) and calls anything else malformed, so a stray second SOI or a JPGn
  segment can't carry an EXIF span through. APP0 JFIF is rebuilt with no embedded thumbnail; JFXX
  is dropped. `cleanImageBytes` re-reads the stripped bytes with sharp and refuses the save
  (400, nothing written) if EXIF, XMP or IPTC is still there.
- Follow-up (not fixed here): the Map Import Wizard's zip download writes the file's raw bytes,
  metadata and all; that path never goes through the save endpoint, and those bytes reach
  `public/atlas` if the DM extracts the zip into the repo. `check-image-privacy` blocks EXIF, IPTC
  and XMP but not COM segments or data after EOI.
