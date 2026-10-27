# Missing visibility means dm in the build

Status: done
Source: architecture retro (bug list); ADR-0001

`scripts/build-atlas.ts` published a note with no `atlas.visibility` as `player`; the docs, the glossary and Sync said `dm`. Corven, Edric and Soreth were live because of it.

## Acceptance criteria

- [x] A note with no `atlas` block stays out of the player build (`src/test/atlas-build.test.ts`, "no visibility is dm").
- [x] The legacy `atlas.publish: true` still ships.
- [x] `resolveEffectiveVisibility` in `src/atlas/import/mergeImportFrontmatter.ts` agrees with the build.
- [x] `npm run test:ci` and `npm run atlas:build:player` pass.

## Comments

Next publish drops the three NPCs from the site. They go anyway with the Astrath sample content (see `tidemarrow/`).
