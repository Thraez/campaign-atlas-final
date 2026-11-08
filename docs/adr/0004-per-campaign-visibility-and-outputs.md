# 0004. One per-campaign visibility resolver, one player output per campaign

Status: proposed (2026-11-08)

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
the loaded model (v1 or v2, ADR-0003), the notes as `readNote` reads them, and a campaign id, and
returns, for that campaign: the verdict for every map, frame, region, route, pin, sound area and
note, and the campaign's **must-not-ship set** (ids, names, titles and aliases of everything that
doesn't ship). The build, the old Publish Check, the scans and, later, the new editor's preview all
call it. No other code decides visibility.

**Rules, all fail closed.**

1. A value is one visibility (every campaign) or a per-campaign map. Missing, invalid, or a
   campaign not named in the map: `dm`. `player` and `rumor` ship; `dm` and `hidden` don't
   (ADR-0001 and its addenda, unchanged).
2. A map ships to a campaign only if its visibility ships there **and** its state in that campaign's
   file is not `unknown`. A map that doesn't ship hides its whole subtree there: its child maps,
   their frames on it, and every pin, region, route and sound area on any of them.
3. Fog: on a map whose state is `fogged`, a pin under fog doesn't ship; a region, route, frame or
   sound-only area with any point under fog doesn't ship (today's region and route rule,
   `scripts/build-atlas.ts:814` and `:932`). Ride-on sound areas take their region's verdict.
4. Notes: frontmatter `atlas.visibility` stays one value. A `notes:` entry can only narrow it: if
   the frontmatter value doesn't ship, the note doesn't ship in any campaign, whatever the entry
   says (and the build warns). An entry's `basedOn` records the frontmatter value it was written
   against; if they differ, or `basedOn` is missing, the entry resolves to `dm` for every campaign
   and the Publish Check flags it.
5. A pin ships only if its note and its map ship in that campaign and it is not under fog.

**One player output per campaign.** Each campaign gets its own output dir holding its `atlas.json`,
search index, images (its fog baked in) and audio, sharing no asset dir with another campaign. Its
`atlas.json` names only its own campaign: no other campaign's id, name, items or files. Every scan
in the registry runs on every campaign's output; the registry reads the campaign list from the
loaded model, so a listed campaign whose output is missing fails the publish (R-03's rule). A
cross-campaign scan checks each campaign's output against that campaign's must-not-ship set, which
also covers DM-only region, route and sound-area ids and names.

**Today's output doesn't move.** v1 content (`content/` until cutover) is one campaign, `main`; its
outputs stay `public/atlas/` and `dist/`, so the live site and `publish-atlas.yml` are unchanged
through phase 2. Per-campaign dirs are used by v2 content (`content-next/` until cutover).

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

## Consequences

- R-11a builds the resolver (and folds arch-08); R-11b and R-11c move the build and the old Publish
  Check onto it (R-11b folds arch-02); R-15 teaches the registry campaign dirs; R-17 builds
  per-campaign outputs and the cross-campaign scan; R-18 bakes fog per campaign and makes the fog
  scan source-driven; R-19 runs publish over every campaign.
- The new editor's E13 ("start hidden" or "copy visibility from campaign X") and E11 (preview as a
  campaign's players) are thin callers of the resolver.
- Hosting per campaign (one Cloudflare Pages project each) is ADR-0007, phase H.

## Open for Isak

1. **Does a note with frontmatter `player` show in a brand-new campaign?** Rule 1 makes every
   `world.yaml` item start hidden in a new campaign, but a note's frontmatter value is one value for
   every campaign, so a new campaign would see every player note in Browse and search at once.
   Recommended: a campaign file field `notes: vault | hidden`. `vault` (what the migration writes for
   `main`) uses the frontmatter value narrowed by `notes:`; `hidden` (what "start hidden" writes)
   ships only notes whose `notes:` entry names that campaign as `player` or `rumor`, still never a
   vault `dm` note. The resolver reads it in R-11a.
2. **Is `unknown` map state needed on top of map visibility?** Both hide a map. Recommended: keep
   both: visibility is the DM's spoiler call ("the drow city is secret"), state is the party's
   progress ("they haven't found it yet"); the editor's Fog job (E7) sets state without touching
   visibility. A map ships only when both allow it.
3. **Where do per-campaign outputs go?** Recommended: player stores at
   `.atlas-campaigns/<id>/atlas/` and site builds at `dist-campaigns/<id>/`, both gitignored and
   outside `public/` (Vite copies all of `public/` into every site build, so a campaign store
   there would land in every campaign's site). Each campaign's site build uses its own store as
   the atlas dir. Today's `public/atlas/` and `dist/` stay for v1 `main` until cutover.
4. **May a campaign's own name appear in its output?** Recommended: yes, its own `id` and `name`
   only (the viewer shows it); never another campaign's.
