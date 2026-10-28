# Timeline events with no parsable year don't land in year 0

Status: in-review (review pending)
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

## Comments

- 2026-10-28, agent: built on branch `eval-26-timeline-undated`, stacked on
  `code-retro-06-read-note` (PR #74). `dateRaw` is now `dateLabel` in `atlas.json` and
  `search-index.json`; readers updated: `schema.ts`, `loader.ts` (search entry), `EntityPanel`,
  `SearchPalette`, `AtlasTimeline`. `check-artifact-shape` scans `dateLabel` on entities and now
  also on search-index entries (it never scanned the search entry's date before). The other scans
  are field-agnostic. The Timeline groups by year with groups ordered by year, sorts by
  `dateValue` inside each, and puts year-less events in a last "Undated" group. Tests:
  `timeline-date-label.test.ts` (build), `artifact-shape.test.ts`, `AtlasTimeline.test.tsx`.
  This ticket file isn't on the base branch yet, so the branch adds it; expect a trivial conflict
  with main's copy on merge.
