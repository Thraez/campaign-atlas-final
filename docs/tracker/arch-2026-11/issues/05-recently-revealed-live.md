# "Recently revealed" works on the live site

Status: ready-for-agent
Blocked by: the Morning queue (`SearchPalette.tsx` is in #104)
Area: player search, publish
Payoff: med-low · Size: M

`.last-published.json` is gitignored and `publish-atlas.yml` (~104-115) never snapshots, so the
player hook gets a 404 and does nothing. Built locally, the whole previous atlas ships (it is on
the allowlist, `playerFiles.ts` ~30) when the hook needs only ids, including entities since hidden.

## Acceptance criteria

- Publish writes a small ids-only `revealed.json`; the hook reads it.
- `.last-published.json` leaves the player allowlist; a player build never contains it.
