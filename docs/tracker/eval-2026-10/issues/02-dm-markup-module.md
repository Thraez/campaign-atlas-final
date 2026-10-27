# One module for DM markup

Status: done
Area: publish safety

The build strips `%%…%%` and `:::dm … :::` (`src/atlas/content/stripDmBlocks.ts:22,28`), but the
shape scan only looks for `%%` (`scripts/check-artifact-shape.ts:22`), so a `:::dm` block that
survived the build would pass. The `{{secret:` pattern is written out three times
(`scripts/atlas/stripSecretMarkers.ts`, `scripts/check-player-secrets.ts`,
`src/atlas/content/projectEntityForPlayer.ts`).

## Acceptance criteria

- One module owns each DM syntax (`%%`, `:::dm`, `{{secret:`) and offers both "strip" and
  "any left?". The build and every scan use it.
- `check-artifact-shape` fails on a leftover `:::dm` block (test).
- One fixture table tests strip and detect together.
- The real content still builds and scans clean.

## Comments

2026-10-27, branch `eval-02-dm-markup`:

- `src/atlas/content/stripDmBlocks.ts` became `dmMarkup.ts`, which holds every pattern once. It
  strips (`stripDmBlocks`, `stripDmFromShippingString`, `stripSecretMarkers`) and detects
  (`findDmMarkup`, `hasSecretMarker`, `secretMarkerIds`). The `scripts/atlas/` copies and the
  parity test are gone; the build imports the module directly.
- The shape scan uses `findDmMarkup`, so it now fails on `:::dm` and `{{secret:` as well as `%%`.
  Its message reads "contains unstripped <syntax> DM markup".
- From the review: any `%%` counts as markup, a lone one too, so "Name %% the king is dead" can
  no longer ship. `:::DM` in any case is stripped and detected. The import auto-summary now drops
  `:::dm` blocks and secret markers (it only dropped `%%`), and the Publish check's
  `dm-block-in-player-body` warning covers `:::dm`.
- `src/test/content/dmMarkup.test.ts` is the fixture table.
