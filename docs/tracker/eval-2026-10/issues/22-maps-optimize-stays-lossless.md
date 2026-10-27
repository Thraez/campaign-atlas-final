# `maps:optimize` keeps maps lossless

Status: in-review (review pending)
Area: images, publish
Blocks: tidemarrow/02

Found by the third sweep (2026-10-28) and spot-checked. AGENTS.md says maps stay lossless and
`maps:optimize` owns them, but `scripts/dev/optimize-maps.mjs` ~65 encodes WebP at quality 85
(lossy). It only picks up `.png` files over 1 MB (~48), so tidemarrow/02's `Tidemarrow.jpg` would
be skipped. Its quality constant is copied by hand from the save plugin (~17-19).

Provisional call (State.md): PNG becomes lossless WebP, JPG is copied as is (re-encoding a JPG
lossy smears labels and fog edges, and lossless makes it bigger), settings come from one place,
and tidemarrow/02 is reworded to match.

## Acceptance criteria

- A PNG map becomes lossless WebP; a JPG map is left as is. No map is ever lossy re-encoded.
- The encode settings live in one module that the script and the save pipeline share. The script
  is `.mjs`; if it can't import `imageEncoding.ts`, a test pins the two together.
- tidemarrow/02's wording matches what the script does.
- A test runs the script on a small PNG and JPG fixture and checks the output format and that the
  pixels are lossless.

## Comments

- 2026-10-28 (branch `eval-22-maps-optimize-lossless`): the script is now
  `scripts/dev/optimize-maps.ts` (run by `tsx`, like `images:optimize`), so it imports
  `imageEncoding.ts` directly and no pinning test is needed. New there: `MAP_WEBP_OPTIONS`
  (`{ lossless: true }`) and `shouldConvertMapToWebp` (PNG only). The 1 MB threshold now comes from
  `SIZE_WARN_BYTES`. A PNG map becomes a lossless WebP twin, never resized; a JPG map is reported
  and left byte for byte. The save pipeline used to write PNG bytes under a `.webp` map name (and
  would re-encode a WebP map lossy at 85); a `.webp` map target is now encoded with
  `MAP_WEBP_OPTIONS`. Tests: `src/test/dev/optimize-maps.test.ts` (noise fixtures, pixel-exact
  check), a save-plugin case and two `imageEncoding` cases. tidemarrow/02 reworded. On a temp
  copy, one real 3.3 MB map PNG became a 2.4 MB lossless WebP.
- Not covered: a JPG uploaded through the editor to a map target is still re-encoded at
  `REENCODE_QUALITY` by the metadata strip (and named `.png`; see 19).
