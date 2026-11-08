# R-11e A hidden region hides what is inside or reaching into it

Status: ready-for-agent
Blocked by: R-11a (done). Blocks: R-17. R-11b is done: the build already drops on any non-`ships` verdict (pins `scripts/atlas/playerResolution.ts:94`, regions `build-atlas.ts:851-855`, routes `build-atlas.ts:982`, sound `soundShips`), so the new reasons take effect through the resolver
Size: S-M
Branch: `rebuild-r11e-region-containment`
Needs: the adversarial player-safety review (`docs/agents/workflow.md`, "Done")

`docs/GOALS.md` ("Hidden zones and fog") promises that a hidden zone and everything inside it or
reaching into it (pins, routes, child maps) never ship to a campaign it is hidden in, and its "Working means" asks
for a test that puts a pin inside a hidden zone and finds it absent. ADR-0004 has no such rule, so
the resolver (`src/atlas/content/resolveCampaign.ts`) decides each pin, route and sound-only area
on its own visibility, fog and links only. R-16's test world shows it: region `the-murkwater` on
`oskmark` is `dm`, and the pin of `mossbeck-well`, route `eel-path` and sound-only area
`frog-chorus` inside it ship to both campaigns (`scripts/atlas/atlas-tree.test.ts`, the `it.fails`
"known gap" test). Today's v1 build has no such rule either (`scripts/build-atlas.ts` filters
regions, placements and routes by their own visibility and fog; `filterSoundscapeForPlayer` only
ties ride-on areas to their region). No live leak: `content/` (checked 2026-11-08) has one map
(`astrath-deeprealm-overview`), no regions, routes, fogs or child maps, three `player` sound-only
areas and pins from 6 notes, so nothing sits inside a hidden region. It must land before v2
content ships, not as a hotfix.

Add ADR-0004 rule 9 (addendum below) to the resolver.

## The rule (rule 9, "containment")

**Hiding regions.** On a map that ships to the campaign, a *hiding region* is a region that
doesn't ship there for its own sake: reason `visibility` (its own value) or `link-hidden` (it links
a note that doesn't ship). Not a hiding region:

- a region dropped only by fog (`fogged`): rule 3 already tests every item's own points against
  the fog, and items in the lit part of a partly fogged region are things the party has seen;
- a region hidden only by this rule (no cascade: containment is decided against hiding regions
  only, in one pass, so the result doesn't depend on order).

Geometry is tested in the map's pixels with the fog code's `pointInPolygon`
(`src/atlas/geometry/polygon.ts`, even-odd), on the region's `points` as written. A point on a
hiding region's edge counts as inside (fail closed). "Touches" an area below means the two shapes
share interior (a vertex of either strictly inside the other, or two edges properly crossing); two
neighbouring zones that only share an edge don't touch.

Per item type, an item that ships by every other rule doesn't ship when:

| Item | Geometry | Doesn't ship when | New reason |
|---|---|---|---|
| Pin | its point | the point is inside or on the edge of any hiding region on its map | `in-hidden-region` |
| Route | the resolved polyline (written points and pin waypoints, as rule 3 resolves them) | any vertex is inside a hiding region, **or any segment crosses into, touches or runs along the edge of one** (a road through a dm zone with no waypoint inside still hides; an edge counts as inside, as for pins) | `in-hidden-region` |
| Sound-only area | its polygon | it touches a hiding region and doesn't wholly contain it | `in-hidden-region` |
| Ride-on sound area | its region | unchanged: it takes its region's verdict, so it hides when its region hides (including by this rule) | `region-hidden` |
| Region (shipped on its own) | its polygon | it touches a hiding region and doesn't wholly contain it | `in-hidden-region` |
| Frame / child map | the frame rectangle on the parent (both quads of `frameQuads` when rotated, as rule 4) | the frame touches a hiding region on the parent and doesn't wholly contain it; the child map doesn't ship, **with its whole subtree** (as rules 2 and 4) | `frame-in-hidden-region` |

**Area items that wholly contain a hiding region still ship.** "Wholly contains" means the hiding
region lies strictly inside the item, sharing no boundary: an area whose outline is identical to
the hiding region, or shares any part of its boundary (even one vertex), does
not count as containing it and hides. Without this, every hidden lair
would hide the kingdom region drawn around it, its ambient sound, and the city map framed around
it. A container doesn't reveal the hidden zone: the hidden region's shape, name and contents are
still dropped. The child map of such a frame is decided by its own visibility and state; hidden
regions on the parent don't project into it (out of scope below).

**Overlapping regions: hidden wins (decided, question 2).** A point inside a hiding region
doesn't ship even if a shipped region also covers it.

**Partly inside: the whole item hides (decided, question 1).** A route that clips a hiding
region, or an area or frame that overlaps one without containing it, doesn't ship at all. Same as
rule 3 for fog ("any point under fog") and rule 4 ("any part of a frame").

**Malformed hiding regions.** A hiding region with fewer than 3 finite points can't be tested; the
resolver reports it (new `badHidingRegions: { map, region }[]`) and the strict player build fails
naming it, rather than shipping what may sit inside it.

**Must-not-ship and collisions (rule 8).** An item hidden by this rule joins must-not-ship and the
collision check like any hidden item; a pin adds its location, not its note's name. The note of a
hidden pin still ships if rule 6 says so (a note is not geometry), but the build warns when every
pin of a shipped note is hidden by this rule, naming the note and region, so the DM sees it.

## Acceptance criteria

- `resolveCampaign` applies rule 9 as above. Region own-verdicts (visibility, link, fog) are
  decided before pins, routes and sound (today pins come first, `resolveCampaign.ts` ~613), so
  pin waypoints of routes see pins hidden by containment (`waypoint-hidden` follows).
- Frames: rule 9 for frames needs the parent's hiding regions, and `link-hidden` needs note
  verdicts, which need world verdicts (rule 5), which need map verdicts. The resolver iterates:
  maps, worlds, notes, region own-verdicts, then frame containment; if that hides a map, recompute
  worlds, notes and regions and repeat until no verdict changes (each pass only hides more, so it
  ends). A test covers a region linking a note of a world that loses its last map in pass 2.
- Geometry helpers (point on/in polygon with edge as inside, segment-polygon crossing,
  polygon-polygon touches and contains, with the shared-edge case) live in
  `src/atlas/geometry/polygon.ts`, with unit tests: shared edge, vertex on edge, collinear
  overlapping edges, a segment crossing a concave polygon with no vertex inside, a self-intersecting
  hiding polygon (even-odd), a rotated frame, a segment that only touches or runs along a hiding
  region's edge (hides), and an area identical to the hiding region (hides, not a container).
- New reasons `in-hidden-region` and `frame-in-hidden-region` in `ShipReason`, documented in the
  header comment (rule 9) and shown by `npm run atlas:tree`.
- `content-next/` (R-16): flip the `it.fails` "known gap" test to `it`; the pin of
  `mossbeck-well`, route `eel-path` and sound `frog-chorus` don't ship in either campaign; update
  the cases table in `content-next/README.md` and the `oskmark` line in the tree test. Add to the
  test world (invented names only): a region `player` wholly inside `the-murkwater`, a route that
  crosses it with no waypoint inside, a shipped region that wholly contains a hiding region (still
  ships), a city frame partly over the hiding region (child hidden with its subtree), and a region
  hidden in one campaign only, so the two campaigns differ.
- Resolver fixture tests for every row of the table, the container exception, a fogged-only region
  (not hiding), no cascade, the malformed hiding region, and rule 8 (a non-linking item hidden by rule 9 (a region that links the shipped note is exempt under rule 8) whose
  name equals a shipped note's title is a collision).
- v1: `content/` has no regions, so the player and DM `atlas.json` and `search-index.json` of
  `content/` are unchanged (R-11b's snapshot check).
- The strict player build (`scripts/build-atlas.ts`, `scripts/atlas/playerResolution.ts`) fails
  naming the map and region when the resolver reports `badHidingRegions`; it warns naming the note
  and region when every pin of a shipped note is hidden by rule 9. Both are tested.
- ADR-0004 gets the addendum below; `docs/VISIBILITY_AND_PLAYER_SAFETY.md` names rule 9.
- `npm run gate` passes.

## Order

Order 3 in the phase 2 table, beside R-11c, R-11d, R-15, R-16. It touches the resolver, its tests,
`content-next/` and the build's wiring for the two new outcomes (the malformed-region failure and
the warning), not the build's drop logic: the build already drops on any non-`ships` verdict, so
R-13 needs nothing more. R-17 adds `Blocked by: R-11e`: no per-campaign output ships before
containment. R-17's sentinel list adds "a pin, route and sound file inside a hidden region" (the
GOALS working-means test, across every file of every campaign's output). R-11c gets it through the
resolver.

## Touches

- `src/atlas/content/resolveCampaign.ts` and its test, `src/atlas/geometry/polygon.ts` and a test,
  `scripts/build-atlas.ts`, `scripts/atlas/playerResolution.ts`,
  `content-next/` and `scripts/atlas/atlas-tree.test.ts` (and the tree printer if it lists
  reasons), `docs/adr/0004-per-campaign-visibility-and-outputs.md`,
  `docs/VISIBILITY_AND_PLAYER_SAFETY.md`.

## Out of scope

- Projecting a parent's hidden region into a child map it overlaps (would need the frame
  transform; the rotation pivot isn't fixed by ADR-0003). A child map decides its own items.
- Clipping a route or area at the region's edge (it hides whole, or ships whole).
- Hiding a note because its pins are hidden (a warning only; the note's visibility is the DM's).
- The editor showing what a hidden region hides (E11 preview is a caller of the resolver).
- The fog scan and isolation scan (R-17b, R-18 read the resolver's must-not-ship set).

## Answered

Isak, 2026-11-08:

1. An item partly inside a hidden zone (a road through it, a sound or city frame overlapping it)
   hides whole. A long road that clips a dm zone disappears until split or rerouted (the build
   warns).
2. A point inside a hidden zone that is also inside a shipped zone: hidden wins. One simple rule,
   no ordering to get wrong.
