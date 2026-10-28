# Timeline events with no parsable year don't land in year 0

Status: ready-for-agent
Area: timeline, build

Found by the third sweep (2026-10-28). An entity with a `dateValue` but no date that parses gets
no `dateYear` (`build-atlas.ts` ~1254-1256), and the Timeline falls back to `?? 0`
(`AtlasTimeline.tsx` ~62). A `dateValue` override can also put a year's group out of order.
`dateRaw` actually holds the formatted label (~1251), so the name misleads.

## Acceptance criteria

- Events with no year go in their own "Undated" group, not under 0.
- Within a year, events sort by `dateValue`, and the year groups stay in order.
- Rename `dateRaw` to say it holds the label, and update its uses. This changes the player
  `atlas.json` field name, so check the viewer and the safety scans still read it.
- Tests for an undated event, an override that crosses years, and the rename.
