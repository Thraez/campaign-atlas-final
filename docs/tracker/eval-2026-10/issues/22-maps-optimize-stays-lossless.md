# `maps:optimize` keeps maps lossless

Status: done (PR #72, merged 2026-10-28)
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
- 2026-10-28, review fixes:
  - One format rule in `imageEncoding.ts`: `formatOfFileName` and `mapKeepReason` sit next to
    `shouldConvertMapToWebp`. Every map the script doesn't convert is listed with a reason (`kept`:
    JPG, WebP, GIF, SVG, other; `skipped`: PNGs under the threshold, PNGs whose twin already
    exists, PNGs that wouldn't come out exact). None is ignored silently.
  - Encoding and the pixel check live in `scripts/atlas/mapWebp.ts` (node-only, needs sharp), used
    by both the script and the save pipeline. It compares all four RGBA channels before anything is
    kept. sharp 0.34.5 has no WebP `exact` option (it isn't in `output.js` or the typings, and
    passing it changes nothing), so libwebp rewrites the colour under fully transparent pixels. A
    PNG with such hidden colour, or a 16-bit PNG (WebP is 8-bit), is therefore skipped by the
    script and refused by the save pipeline. `MAP_WEBP_OPTIONS` stays `{ lossless: true }`.
  - The save pipeline's `.webp` map branch: a PNG is encoded through `mapWebp.ts`, a WebP keeps its
    bytes, and a JPG or GIF is refused with a 400 `map-format-refused` that names ticket 29. One
    helper, `isWebpTargetIn(path, "images" | "maps")`, replaces the two duplicate checks.
  - `scripts/dev/devFiles.ts` holds the file walk and `escapeRegExp` for both optimizers.
  - The script never overwrites an existing `.webp` (it skips the PNG and says so). Two PNGs that
    would share a twin (`Region.PNG` + `Region.png`) stop the run before anything is written.
  - Like `images:optimize`, the source PNG is deleted once the twin is written and world.yaml
    repointed (git keeps it). A second run is a no-op (tested).
  - Repointing matches the whole `src:` value, quoted or not, so `region.png.bak` is left alone
    (tested).
  - CLI: `npm run maps:optimize -- <mapsDir> [--content <dir>]...`. Given a folder, it repoints only
    the `--content` roots named. Ran it for real on a temp copy of two real map PNGs, an SVG and the
    placeholder: both maps converted (3.2 MB to 2.3 MB each), both world.yaml layers repointed
    (one of them quoted), the `.png.bak` line untouched, the SVG listed as kept and the placeholder
    as under the threshold. A second run converted nothing.
  - Carve-out (provisional call in State.md): the editor's JPG map path goes to ticket 29, stacked
    after #68 (ticket 19 owns map target naming). That covers `cleanImageBytes` at quality 85 on a
    `.jpg` map target, and a JPG or lossy WebP sent to a `maps/*.webp` target. It is not in this
    branch.
