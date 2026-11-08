# R-11a Pure per-campaign visibility resolver

Status: ready-for-agent
Blocked by: R-10
Size: S-M
Branch: `rebuild-r11a-campaign-resolver`
Folds in: `docs/tracker/arch-2026-11/issues/08-one-secret-note-rule.md`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

Write the one resolver of ADR-0004: a pure function that, for one campaign, decides which maps,
frames, regions, routes, pins, sound areas and notes ship, and returns that campaign's
must-not-ship set. Today the rule is spread over the build, `readNote`, a copy in
`projectEntityForPlayer`, the soundscape filter and `validateProject`; R-11b and R-11c move callers
onto this. It also absorbs arch-08: one secret-note predicate, and link redaction from wikilink
tokens.

## Acceptance criteria

- New pure module (suggested `src/atlas/content/resolveCampaign.ts`), no file IO, input: the
  in-memory model (R-10 types; a v1 adapter is R-11b's), notes as `readNote` returns them, and a
  campaign id. Output: a verdict per item and note (`ships: boolean`, `reason`), and
  `mustNotShip`: ids, names, titles and aliases of everything that doesn't ship, maps, regions,
  routes and sound areas included.
- Table-driven tests, one row per ADR-0004 rule, each in two campaigns (`a`, `b`):
  - bare `player` ships in both; `{ a: player }` ships in `a`, not in `b`; missing, invalid
    (`secret`, `Player`, `true`, empty) and an unnamed campaign are `dm`; `rumor` ships, `hidden`
    doesn't;
  - a map with visibility `dm` in `a` hides its child maps, their frames, and every pin, region,
    route and sound area on them, two levels down;
  - a map not listed in `a`'s campaign file (`unknown`) hides the same subtree, even with
    visibility `player`;
  - on a `fogged` map: a pin under fog is dropped, a region, route, frame or sound-only area with
    one point under fog is dropped, a ride-on sound area follows its region (reuse `isLit` from
    `src/atlas/fog/effectiveLit.ts`);
  - notes: frontmatter `dm` + a `notes:` entry `{ a: player }` stays hidden (narrow only); frontmatter
    `player` + `{ a: player, b: dm }` ships only in `a`; `basedOn` different from the frontmatter
    value, or missing, resolves to `dm` everywhere and is reported as stale; `atlas.publish: false`
    is secret;
  - a pin ships only if its note and its map ship and it isn't under fog;
  - the campaign-level note default from ADR-0004 Q1 as accepted (recommended `notes: hidden`: a
    frontmatter `player` note without a `notes:` entry naming the campaign doesn't ship).
- arch-08: one exported secret-note predicate in `src/atlas/content/readNote.ts` (today
  `isSecret` is computed inline at `readNote.ts:91`); `entityIsSecret`
  (`src/atlas/content/projectEntityForPlayer.ts:181`) uses it, and so does the resolver.
- arch-08: link redaction in `projectEntityForPlayer.ts` (step 3, ~lines 254-268) works from the
  wikilink token positions, not a regex over the trimmed target; a test with `[[ Name ]]` (spaces
  inside the brackets) and `[[Name|alias]]` finds no secret name left in the shipped `body`.
- `mustNotShip` for a hidden region, route and sound area contains its id and name (the R-06
  follow-up: no scan derives these today).
- No caller changes in this ticket; the existing tests pass unchanged.

## Touches

- New `src/atlas/content/resolveCampaign.ts` (+ test), `src/atlas/content/readNote.ts`,
  `src/atlas/content/projectEntityForPlayer.ts` (+ their tests).

## Out of scope

- Calling it from the build (R-11b), the old Publish Check (R-11c), the scans (R-15, R-17, R-18).
- Loading files (R-12). Writing visibility (editor, phase 4/6).
- Changing `worldItemVisibility` or ADR-0001's rules: the resolver applies them.
