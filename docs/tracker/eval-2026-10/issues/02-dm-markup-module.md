# One module for DM markup

Status: ready-for-agent
Area: publish safety

The build strips `%%…%%` and `:::dm … :::` (`src/atlas/content/stripDmBlocks.ts:22,28`, now `dmMarkup.ts`), but the
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
