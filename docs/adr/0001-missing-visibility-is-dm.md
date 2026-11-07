# 0001. A note with no visibility is DM-only

Status: accepted (2026-10-27)

## Context

The docs, the glossary and Sync all said a missing `atlas.visibility` means `dm`. The build
(`scripts/build-atlas.ts`) said `player`, unless `atlas.publish: false`. Three NPC notes with no
visibility key (Corven, Edric, Soreth) were on the live site because of that, although their vault
folder (`03_Entities`) isn't one the DM publishes. Their `%%` DM notes were stripped correctly.

With about 600 vault notes about to sync, and none of them carrying an `atlas:` block, the
build's default would have published every one.

## Decision

Missing or invalid visibility is `dm` everywhere. A note ships only when something marks it
`player` or `rumor`: its own `atlas.visibility`, the legacy `atlas.publish: true`, or Sync tagging
notes from the vault's already-public folders (`01_Lore`, `02_Regions`). A top-level
`visibility:` outside the `atlas:` block isn't read.

`world.yaml` items (regions, routes, sound areas) are out of scope: the DM writes them by hand in
one file, and their defaults are untouched by this ADR.

## Consequences

- The three NPCs leave the site at the next publish unless they are tagged `player`.
- Authors must tag what they want public; forgetting hides a note instead of leaking it.
- `atlas.publish: false` stays as a second way to hide a note.

## Addendum (2026-11-07): an invalid world.yaml visibility is `dm`

`world.yaml` defaults stay out of scope, but a typo is a different case. The loader turned a value
such as `visibility: secret` into `player`, so a mistyped DM-only region or route shipped. The
editor's player lens already assumed `dm` for such values, so the preview and the build disagreed.

Decision (Isak): in `world.yaml`, a missing `visibility` is still `player`; a value that is present
but not a valid visibility (any typo, a different case, `true`, an empty value) loads as `dm`, with a
build warning naming the item. Sound-only areas already dropped on such values. The loader is
`normalizeVis` in `scripts/atlas/loadWorldConfig.ts`.
