Ticket: `docs/tracker/eval-2026-10/issues/29-editor-map-uploads-stay-lossless.md`

A JPG map saved through the editor is never re-encoded: its image data is kept byte for byte and its
metadata is stripped by walking the JPEG segments without decoding.

- `scripts/atlas/jpegMetadata.ts` (`stripJpegMetadata`): copies only the decoder's segments (SOFn,
  DHT, DAC, DQT, DRI, DNL, DHP, EXP, SOS + scan data, RSTn, TEM). Drops EXIF, XMP, IPTC, MPF, other
  APPn, comments and data after EOI. Keeps ICC (APP2) and Adobe (APP14); APP0 JFIF is rebuilt without
  its thumbnail. Any other marker (stray SOI, JPGn, reserved) is refused as malformed.
- `cleanImageBytes`: a JPG under `assets/maps/` goes through the strip, then sharp re-reads it and
  refuses the save (400, nothing written) if EXIF/XMP/IPTC survived. A JPG under a `.png`/`.webp` map
  name is refused; the editor now names it `.jpg` (`mapLayerTarget.ts`, panel hint, import wizard).
- Images outside `maps/` unchanged. tidemarrow/02 says "import it through the editor" again.
- Provisional calls: ICC profiles are kept; a JPG map with EXIF orientation other than 1 is refused
  ("rotate it in an image editor") since stripping the tag would show it sideways.
- Follow-up in the ticket: the Map Import Wizard's zip download still writes raw bytes, which reach
  `public/atlas` if the DM extracts it into the repo; `check-image-privacy` catches EXIF/IPTC/XMP
  there but not comments or data after EOI.

Review (Opus, medium, privacy lens): found that unknown markers were passed through (a stray SOI
could carry an EXIF span into the output) and the JFIF thumbnail; fixed in 484e5b7; re-check CLEAN
(six sharp-made variants strip pixel-identical; the probe fails safe).

## Local gate (2026-11-07, branch at 484e5b7, on origin/main 2f4e7e6)

```
typecheck:all exit 0 · lint exit 0 · format:check exit 0
test:ci exit 0 — all shards green
atlas:publish exit 0 · atlas:check-secrets dist exit 0 · atlas:check-derived dist exit 0
GATE PASSED
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
