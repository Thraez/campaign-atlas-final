# Publish Check's wikilink and relationship leak rules match the build

Status: in-review
Area: publish safety (Publish Check, player build)

Found in the review of eval-46 (2026-11-07). eval-46 made the region and route rules ask one
predicate; `validateProject.ts`'s wikilink and relationship rules still used `dmEntityIds`
(visibility `dm | hidden` only).

What the strict player build (`npm run atlas:build:player`) does, read from
`scripts/build-atlas.ts` and `src/atlas/content/projectEntityForPlayer.ts`:

- A note ships when it is player-visible and not `atlas.publish: false`
  (`readNote`'s `isSecret`). Folder-excluded notes never ship.
- **Wikilinks:** a shipped note's wikilink to any note that doesn't ship (dm/hidden,
  `publish: false`, folder-excluded) is redacted and counted as a cross-ref leak, which fails the
  build (exit 8).
- **Relationships:** `filterRelationshipsForPlayer` drops a player-visible relationship whose
  target doesn't ship, unknown targets included, as a leak, which fails the build (exit 5).
  Relationships with visibility dm/hidden are dropped quietly.

What Publish Check did:

- **Wikilinks:** only a *warning* (`wikilink-to-dm`), and only for dm/hidden targets. A link to a
  `publish: false` note or a folder-excluded note passed. So Publish Check could show "No
  DM-content leakage detected" for an atlas whose publish fails.
- **Relationships:** blocking only for dm/hidden targets. An unknown target got a warning
  (`relationship-unresolved`); a `publish: false` target passed.

## Acceptance criteria

- Failing tests first (`src/test/publish-check-link-leaks.test.ts`): a rumor note wikilinking a
  dm note; wikilinks to a `publish: false` note and to a folder-excluded note; a player
  relationship to an unknown note and to a `publish: false` note. All blocking.
- Publish Check blocks exactly where the build fails: both rules ask `linkLeaksToPlayers` against
  the shipped-note visibility map from the player projection's own `buildProjectionContext`.
- Nothing loosens: an unknown relationship target still warns `relationship-unresolved`, for any
  relationship visibility.

## Comments

- 2026-11-07: Built. `validateProject` computes `shippedVisibility` once from
  `buildProjectionContext` (the same context the editor preview uses, and the same
  `isSecret` rule as the build), and the wikilink and relationship rules call
  `linkLeaksToPlayers(itemVis, shippedVisibility.get(id))`. The wikilink issue is now blocking
  with code `spoiler-leak-wikilink` (was the warning `wikilink-to-dm`), so the "No DM-content
  leakage detected" check sees it. Tests: `src/test/publish-check-link-leaks.test.ts` (5 of 8
  failed on the old code), `src/test/atlas-publish-check.test.ts` (code renamed).
- Merge with eval-46: this branch adds `linkLeaksToPlayers` and `linkTargetLabel` to
  `src/atlas/content/visibility.ts` with text identical to eval-46's (same place, same diff), so
  merging both keeps one copy. Leak messages here use their own wording
  (`describeHiddenTarget`), since `linkTargetLabel` can't name the `publish: false` case.
- Provisional calls: a player relationship to an unknown target now gets both the blocking leak
  and the existing `relationship-unresolved` warning. The source check stays "player-visible
  visibility", so a `publish: false` note's own links are still checked although it doesn't
  ship (stricter than the build, never looser).
