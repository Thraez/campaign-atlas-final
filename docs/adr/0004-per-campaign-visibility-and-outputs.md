# 0004. One per-campaign visibility resolver, one player output per campaign

Status: accepted (2026-11-08)

## Context

Campaigns differ by visibility, not only by fog (`docs/GOALS.md`, "Campaigns"; Isak's follow-up of
2026-11-07). Today one rule decides what ships, written in several places that have disagreed
before (audit-01, eval-46, eval-50, arch-07, arch-08): the build filters with
`PLAYER_VISIBLE_VISIBILITY` and `worldItemVisibility` (`src/atlas/content/visibility.ts`), notes
with `readNote`'s `isSecret` (`src/atlas/content/readNote.ts:91`) and a copy of it,
`entityIsSecret` (`src/atlas/content/projectEntityForPlayer.ts:181`); the old Publish Check
re-derives it in `src/atlas/yaml/validateProject.ts`; the scans derive secret names from notes only,
so a DM-only region or route id is guarded by nothing (R-06 follow-up). There is one player output
(`public/atlas/`, then `dist/`), and the scan registry (`scripts/atlas/scanRegistry.ts`,
`artifactDirs`) knows only those two dirs.

Schema v2 (ADR-0003) adds per-campaign visibility values, a map tree, campaign files with map states
and fog, and a `notes:` block in `world.yaml`.

## Decision

**One resolver.** A pure function in `src/atlas/content/` (so the app and `scripts/` share it) takes
the in-memory model (v2, or v1 through one adapter in `src/atlas/content/`), the notes as
`readNote` reads them, and a campaign id, and returns, for that campaign: the verdict for every
world, map, frame, region, route, pin, sound area and note; its **must-not-ship set** (ids, names,
titles and aliases of everything that doesn't ship); and any name collisions (rule 8). The build,
the old Publish Check, the scans and, later, the new editor's preview all call it. No other code
decides visibility.

**Rules, all fail closed.**

1. A value is one visibility (every campaign) or a per-campaign map. Missing, invalid, or a
   campaign not named in the map: `dm`. `player` and `rumor` ship; `dm` and `hidden` don't
   (ADR-0001 and its addenda, unchanged).
2. A map ships to a campaign only if its visibility ships there **and** its state in that campaign's
   file is not `unknown`. A map that doesn't ship hides its whole subtree there: its child maps,
   their frames on it, and every pin, region, route and sound area on any of them. Both checks
   stay because they answer different questions: visibility is the DM's spoiler call ("the drow
   city is secret"), state is the party's progress ("they haven't found it yet"), and the editor's
   Fog job (E7) sets state without touching visibility.
3. Fog: on a map whose state is `fogged`, a pin under fog doesn't ship; a region, route or
   sound-only area with any part under fog doesn't ship: a region's or sound area's whole area,
   a route's whole path, so fog between lit corners or lit waypoints counts. Ride-on sound areas
   take their region's verdict.
4. **A frame under fog hides the child.** A child map whose frame has any part of its area under
   its parent's fog (the region rule of rule 3, applied to the frame's rectangle) doesn't ship to that campaign, with its whole subtree (as rule 2). Dropping only the frame
   would ship a city the party can't have reached.
5. **Worlds.** A world ships to a campaign only if at least one of its maps ships there. Otherwise
   it is left out of that campaign's `worlds` and `ocean`, its id and name join that campaign's
   must-not-ship set, and none of its notes (entities whose world is that world) ship there either,
   whatever their own visibility. So a world that has notes but no maps yet ships none of its
   notes until one of its maps ships.
6. Notes: frontmatter `atlas.visibility` stays one value. A `notes:` entry can only narrow it: if
   the frontmatter value doesn't ship, the note doesn't ship in any campaign, whatever the entry
   says (and the build warns). An entry's `basedOn` records the frontmatter value it was written
   against; if they differ, or `basedOn` is missing, the entry resolves to `dm` for every campaign
   and the Publish Check flags it. The campaign's note default (below) then applies.
7. A pin ships only if its note and its map ship in that campaign, it is not under fog and it is
   not hidden by rule 9.
8. **Name collisions fail the build.** When an item or note that doesn't ship to a campaign (hidden,
   fogged, or under a hidden map) has the same name, title or alias as a note that ships there, the
   player build for that campaign fails and names both. Otherwise the shipped note would carry the
   hidden name and no scan could tell them apart. Not a collision:
   - a hidden or fogged item that links a note that ships, for the names equal to that note's
     title or aliases only (a `dm` or fogged region `salt-marsh` linking the `salt-marsh` note):
     those names belong to the note, so they stay out of must-not-ship. The exemption follows the
     name, not the link: the item's own id and name, where they differ (a hidden region
     "Drow Ambush" linking `salt-marsh`), stay in must-not-ship;
   - a pin dropped by fog: it adds its location (map id, coordinates, that placement) to
     must-not-ship, not its note's name, so the note can still ship elsewhere.
9. **A hidden region hides what is inside or reaching into it.** On a map that ships, a region that doesn't
   ship for its own sake (its visibility, or a hidden linked note; not fog) hides, there: a pin
   inside it or on its edge; a route with any point inside it or any segment crossing into it, touching its edge or running along it;
   a sound-only area, region or child-map frame that overlaps its interior without wholly
   containing it (a child map so hidden takes its whole subtree, as rule 2). Hidden wins over any
   shipped region covering the same point. A region hidden only by fog or only by this rule hides
   nothing (rule 3 tests fog per point; no cascade). A hidden region too malformed to test fails
   the player build. Items hidden by this rule join must-not-ship as in rule 8; a note stays
   decided by rule 6, with a build warning when all its pins are hidden this way. A pin hidden by
   this rule adds its location to must-not-ship, not its note's name.

**The campaign note default (`notes:` in the campaign file).** Rule 1 makes every `world.yaml` item
start hidden in a new campaign, but a note's frontmatter value is one value for every campaign, so
without a default a new campaign would see every vault-`player` note in Browse and search at once.
A campaign file's `notes:` field says how that campaign reads notes:

- `hidden` (what the editor's "start hidden" writes): a note ships only if its `notes:` entry names
  this campaign explicitly as `player` or `rumor`. A bare (one-value) entry doesn't count.
- `vault` (what the migration writes for `main`): the frontmatter value, narrowed by `notes:`
  (rule 6).
- No `notes:` field means `hidden` (fail closed).

Either way a vault `dm` note never ships. `vault` widens visibility for its campaign (every
vault-`player` note at once), which is why it is an explicit switch and not the default. In v2 the
build warns on notes whose frontmatter says `player` but that ship to no campaign, so the DM sees
why. The alternative, a `notes:` entry per note for every new campaign, means hundreds of entries
once the vault syncs.

**One player output per campaign.** Each campaign gets its own output dir holding its `atlas.json`,
search index, images (its fog baked in) and audio, sharing no asset dir with another campaign. Its
`atlas.json` names only its own campaign: its own `id` and `name` (the viewer shows them), never
another campaign's id, name, items or files. Every scan
in the registry runs on every campaign's output; the registry reads the campaign list from the
loaded model, so a listed campaign whose output is missing fails the publish (R-03's rule).

**The isolation check is structural.** Short ids (`main`, `a`) appear in every bundle, and
`check-derived-secrets` already skips names shorter than `MIN_NAME_LENGTH` (4) and common words
(`scripts/check-derived-secrets.ts:50-60`). So the cross-campaign scan compares parsed
`atlas.json` fields (its campaign fields, and every world, map, item and note id) against the
campaign's must-not-ship set and the other campaigns' ids, and uses a text search over the output's
files only for names at or over that threshold that aren't common words.

**Today's output doesn't move.** v1 content (`content/` until cutover) is one campaign, `main`; its
outputs stay `public/atlas/` and `dist/`, so the live site and `publish-atlas.yml` are unchanged
through phase 2. Per-campaign dirs are used by v2 content (`content-next/` until cutover): the
player store at `.atlas-campaigns/<id>/atlas/` and the site build at `dist-campaigns/<id>/`, both
gitignored and outside `public/` (Vite copies all of `public/` into every site build, so a
campaign store there would land in every campaign's site). Each campaign's site build uses its
own store as the atlas dir.

## Options rejected

- **A separate DM file (`world.dm.yaml`) or a gitignored DM folder.** A file split by "hidden" can't
  say "hidden in A, shown in B", and the repo goes private before real content (ADR-0002). The split
  is the build.
- **Per-campaign values in note frontmatter.** Notes are the vault's; the editor doesn't write vault
  notes (round-1 Q3). `world.yaml` `notes:` keeps campaign data in the atlas.
- **One output with a campaign switch in the viewer.** Every campaign's data would ship to every
  player; one campaign's players could read another's.
- **Each caller keeps its own filter, checked by parity tests.** That is the shape that disagreed
  six times.
- **A plain text search for isolation.** False hits on short ids, and blind to short names.

## Consequences

- R-11a builds the resolver; R-12 builds the loader and the one v1 adapter (in
  `src/atlas/content/`, so `scripts/` and `validateProject` share it); R-11b and R-11c move the
  build and the old Publish Check onto both (R-11b folds arch-02); R-11d does arch-08's link
  redaction; R-15 teaches the registry campaign dirs; R-17 builds per-campaign outputs; R-17b adds
  the isolation scan; R-18 bakes fog per campaign and makes the fog scan source-driven; R-19 runs
  publish over every campaign.
- The new editor's E13 ("start hidden" or "copy visibility from campaign X") and E11 (preview as a
  campaign's players) are thin callers of the resolver.
- Hosting per campaign (one Cloudflare Pages project each) is ADR-0007, phase H.

## History

- 2026-11-08: proposed with questions 5-8 (1-4 and 9 are in ADR-0003) and with rules 4, 5 and 8
  decided fail-closed by the agent for Isak to overrule. Isak accepted every recommendation and
  all three rules the same day; they are folded into the text above: the campaign note default
  (question 5), keeping both `unknown` state and visibility (6), the per-campaign output dirs (7)
  and a campaign's own id and name in its output (8). The campaign note default departs from
  plan.md, which kept per-campaign note visibility only in `world.yaml`'s `notes:` block.
- 2026-11-08: rule 9 added (R-11e) for the GOALS "hidden zones" promise, found by R-16's test
  world. Isak chose that an item partly inside a hidden region hides whole, and that hidden wins
  over a shipped region covering the same point. Fail closed like rules 3 and 4. The container
  exception (an area wholly containing a hidden region still ships) and leaving fog-only regions
  out were decided by the agent for Isak to overrule.
