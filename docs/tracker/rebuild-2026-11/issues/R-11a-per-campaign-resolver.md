# R-11a Pure per-campaign visibility resolver

Status: ready-for-agent
Blocked by: R-10
Size: S-M
Branch: `rebuild-r11a-campaign-resolver`
Folds in: `docs/tracker/arch-2026-11/issues/08-one-secret-note-rule.md` (the secret-note predicate;
the link redaction is R-11d)
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

Write the one resolver of ADR-0004: a pure function that, for one campaign, decides which worlds,
maps, frames, regions, routes, pins, sound areas and notes ship, and returns that campaign's
must-not-ship set and any name collisions. Today the rule is spread over the build, `readNote`, a
copy in `projectEntityForPlayer`, the soundscape filter and `validateProject`; R-11b and R-11c move
callers onto this. It also absorbs arch-08's first half: one secret-note predicate.

## Acceptance criteria

- New pure module (suggested `src/atlas/content/resolveCampaign.ts`), no file IO, input: the
  in-memory model (R-10 types; the v1 adapter is R-12's, and this ticket's tests build models
  directly), notes as `readNote` returns them, and a campaign id. Output: a verdict per world,
  item and note (`ships: boolean`, `reason`); `mustNotShip`: ids, names, titles and aliases of
  everything that doesn't ship, worlds, maps, regions, routes and sound areas included; and
  `collisions` (rule 8).
- Table-driven tests, one row per ADR-0004 rule, each in two campaigns (`a`, `b`):

  | Rule | Case | Expected |
  | --- | --- | --- |
  | 1 | bare `player`; `{ a: player }`; missing, invalid (`secret`, `Player`, `true`, empty), unnamed campaign; `rumor`; `hidden` | ships in both; ships in `a` only; `dm`; ships; doesn't |
  | 2 | map `dm` in `a`, two levels of child maps with pins, regions, routes, sound | whole subtree hidden in `a`, shipped in `b` |
  | 2 | map not listed in `a`'s campaign file (`unknown`), visibility `player` | same subtree hidden |
  | 3 | on a `fogged` map: pin under fog; region, route, sound-only area with one point under fog; ride-on sound area | dropped; dropped; follows its region (reuse `isLit`, `src/atlas/fog/effectiveLit.ts`) |
  | 4 | city map whose frame has part of its area under its `fogged` parent's fog, no corner fogged (fog crosses the middle); and one with a corner under fog | city, its frame, its child maps and everything on them hidden in that campaign; ships in a campaign where the parent is `open` |
  | 5 | world whose every map is `dm` or `unknown` in `a`, with a frontmatter-`player` note in it | world and that note don't ship to `a`; world id, name and the note's id, title and aliases are in `a`'s `mustNotShip`; both ship to `b` |
  | 6 | frontmatter `dm` + entry `{ a: player }`; frontmatter `player` + `{ a: player, b: dm }`; `basedOn` differs or missing; `atlas.publish: false` | hidden (narrow only); ships in `a` only; `dm` everywhere, reported stale; secret |
  | 6 | campaign `notes: hidden`, `vault`, field missing; a bare `notes:` entry `player` | per ADR-0004 question 5 as accepted (recommended: frontmatter `player` with no entry naming the campaign doesn't ship under `hidden` or missing; a bare entry doesn't name a campaign) |
  | 7 | pin whose note or map doesn't ship, or under fog | dropped |
  | 8 | hidden region named `Black Spire` (linking no note), and a shipped note titled `Black Spire`; same with an alias | `collisions` names both items |
  | 8 | `dm` region `salt-marsh` linking the shipped `salt-marsh` note; the same region fogged | no collision; the region's id and name are not in `mustNotShip` |
  | 8 | pin of the shipped `salt-marsh` note dropped by fog | no collision; `mustNotShip` holds the pin's location (map id, coordinates, placement), not the note's name |

- arch-08: one exported secret-note predicate in `src/atlas/content/readNote.ts` (today
  `isSecret` is computed inline at `readNote.ts:91`); `entityIsSecret`
  (`src/atlas/content/projectEntityForPlayer.ts:181`) uses it, and so does the resolver.
- `mustNotShip` for a hidden region, route and sound area contains its id and name (the R-06
  follow-up: no scan derives these today).
- No caller changes in this ticket; the existing tests pass unchanged.

## Touches

- New `src/atlas/content/resolveCampaign.ts` (+ test), `src/atlas/content/readNote.ts`,
  `src/atlas/content/projectEntityForPlayer.ts` (the predicate only, + their tests).

## Out of scope

- The v1 adapter and loading files (R-12). Link redaction (R-11d).
- Calling it from the build (R-11b), the old Publish Check (R-11c), the scans (R-15, R-17, R-17b,
  R-18). Failing the build on a collision is R-11b (v1) and R-13 (v2).
- Writing visibility (editor, phase 4/6). Changing `worldItemVisibility` or ADR-0001's rules: the
  resolver applies them.
