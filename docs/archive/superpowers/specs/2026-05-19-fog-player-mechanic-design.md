# Fog as a Player Mechanic — Design

Date: 2026-05-19
Status: Design approved (Sections 1–2 confirmed by owner); awaiting written-spec review.
Owner is a DM, not a developer — evaluate at the table-outcome level.

## Problem and goal

Today fog is a **DM planning overlay**. The DM paints reveal shapes; the
player viewer dims the rest — but a player can press the eye button and see
the whole map, and the full map image is shipped regardless. Fog hides
nothing it actually matters to hide.

**Goal:** when the DM enables fog on a map, the published player site treats
it as a real, unliftable information barrier. The land outside the revealed
("lit") area is *not shipped* — players receive the app's sea backdrop, not
the real map pixels. Nothing in the player build (pins, routes, regions,
"show on map") points into the dark.

**North star:** a player, with dev tools open, cannot recover any map content
the DM fogged. Same trust class as the existing secret/derived scans.

## Scope decisions (owner-approved)

- **Per-map, binary.** `map.fog.enabled` is the master switch.
- **Enabled = final.** No player toggle on the published site. The DM editor
  keeps its own preview toggle.
- **Disabled = everything**, exactly as today. Zero redaction, zero change.
- **Authoring: draw light *and* draw fog.** Reveals (light) and conceals
  (fog) are both first-class. Effective visible = `union(reveals) −
  union(conceals)`. Conceal wins, so the DM can carve a bite out of a lit
  island. Empty reveals + enabled = whole map hidden (ocean only).
- **Soft edge.** The effective boundary is feathered (transparent → ocean)
  over a narrow band, `featherPx` (one map-level value, default 16,
  no per-shape control in v1). Aggressive/short fade, not a long 0–100
  gradient. Baked into the shipped image.
- **Nothing points into the dark.** Any pin, route, or region with a point
  in fog is excluded from the player build *entirely* (dropped whole, not
  clipped). A player-visible entity whose only pin is fogged stays readable
  as a page — no map pin, no map-jump.
- **Fill = app sea.** Outside the light: `MapDocument.oceanColor` (already in
  the schema). Beautiful/animated sea art is future, not v1.

## Non-goals (explicit)

- Per-campaign / per-party fogs (multiple view profiles). Owner wants this
  *eventually*; it is out of scope here and the data model must not be
  designed against it (a future `fogProfiles` map is the likely shape).
  Note: `docs/NON_GOALS.md` currently lists per-party fog as a hard no —
  that entry should be softened to "deferred" when this ships.
- Animated or illustrated sea background (v1 = flat `oceanColor`).
- Per-shape feather control.
- Tiled (`MapLayer.tileSrc`) layers under fog — v1 hard-fails the build with
  a clear message if a fog-enabled map has a tiled layer.
- Viewer-side clip with the full image still shipped (Approach 2) — kept
  ONLY as a documented emergency fallback if build-time redaction proves
  unworkable; it is not the design.

## Architecture

### Data model

`FogOverlay` (in `src/atlas/content/schema.ts`):

```ts
export interface FogOverlay {
  mapId: string;
  enabled: boolean;
  color?: string;         // legacy DM-overlay tint; DM editor only
  reveals: Point[][];     // "light" polygons
  conceals?: Point[][];   // NEW: "fog" polygons, subtract from reveals
  featherPx?: number;     // NEW: soft-edge band width, default 16
}
```

Backward compatible: `conceals` absent ⇒ `[]`; `featherPx` absent ⇒ default.

### Effective-lit geometry (single source of truth)

New pure module `src/atlas/fog/effectiveLit.ts`:

- `isLit(x, y, fog): boolean` — `inside(any reveal) && !inside(any conceal)`.
- `effectivePolygons(fog)` — reveal set minus conceal set, for masking.

Every consumer (editor preview, projection exclusion, build redaction, scan)
uses this one module. No duplicated point-in-polygon logic. Feather is
**visual only** — geometry/exclusion uses the strict boundary; points in the
feather band are treated as fogged (excluded).

### Authoring (DM editor)

- `useFogDraft` gains conceal authoring mirroring reveal authoring
  (`tool: "reveal-polygon" | "reveal-circle" | "fog-polygon" |
  "fog-circle"`), a `conceals` array, add/remove, snapshot/undo parity,
  YAML round-trip (`fogToYamlObject` emits `conceals`, `featherPx`).
- Fog tab: existing "Light" tools + a parallel "Fog" tool group; two lists
  (Light shapes / Fog shapes), each removable. No other UI churn.
- `FogLayer` preview renders effective area (reveal − conceal) and a feather
  preview so the DM sees what players will see.

### Build-time redaction (the load-bearing, security-sensitive piece)

Runs only in the player build (`scripts/build-atlas.ts --player`). New
module `scripts/atlas/redactFogMap.ts`, dependency: **`sharp`** added as a
`devDependency` (build-only Node; never bundled into the client — it lives
in `scripts/`, the player vite bundle is unaffected).

For each map with `fog.enabled === true`:

1. Compute `effectivePolygons(fog)` in map space.
2. Build an alpha mask the size of the map: opaque inside the effective
   area, transparent outside, with a `featherPx` linear/gaussian falloff
   band across the boundary.
3. For each `MapLayer` with a raster `src`: composite the layer image
   against the mask → a new PNG that is transparent everywhere outside the
   lit area. Write to the player asset dir under a derived name
   (e.g. `<original>.fog.png`).
4. Rewrite that map's layer `src` in the **player** `atlas.json` to the
   redacted file. The original layer images are **not copied** into the
   player asset output for fog-enabled maps.
5. Drop `reveals`, `conceals`, `color`, `featherPx` from the fog object in
   the player `atlas.json` (pixels are already baked; geometry would only
   be a hint). Keep `enabled: true` so the viewer knows to paint ocean and
   suppress the toggle.
6. Tiled layer (`tileSrc`) on a fog-enabled map ⇒ build fails with a clear
   message (non-goal v1).
7. `sharp` failure ⇒ build fails (never silently ship an unredacted map).

Accepted, documented tradeoff: the soft edge leaves up to ~`featherPx` of
pixels just outside the strict boundary faintly visible at falling opacity.
This is the look the owner asked for — intentional, tiny, not a leak.

### Player projection extension

`projectMapForPlayer` already drops fogged pins and reports
`foggedEntityIds`. Extend, using `effectiveLit.isLit`:

- **Routes:** exclude any route whose resolved path has *any* point in fog.
- **Regions:** exclude any region with *any* vertex in fog.
- **"Show on map" / nav targets:** an entity whose only on-map position is
  fogged contributes no map-jump target (page still renders).

The build already filters by visibility; this adds the fog test on the
geometric survivors.

### Player viewer render

- Fog-enabled map: paint `oceanColor` as the base, then the redacted layer
  PNGs on top. No reveal/conceal polygons needed client-side. The published
  "toggle fog" control is removed for fog-enabled maps.
- Fog-disabled map: unchanged from today.

### Scan assertion

New tsx scanner `scripts/check-fog-safety.ts` (mirrors
`check-derived-secrets.ts` shape: walk artifact dir + read `atlas.json`,
exit codes, wired into the `atlas:publish` chain). For the player artifact:

1. Every `fog.enabled` map: its layer `src` entries reference redacted
   variants, and **no original layer filename for that map exists** in the
   asset output.
2. Player `atlas.json` carries no `reveals`/`conceals`/`featherPx`/`color`
   for fog-enabled maps.
3. Independently re-derive effective-lit from the **DM source** fog and
   assert no player placement/route/region lies in fog (defense in depth —
   does not trust the build, like `check-derived-secrets` re-derives).
4. Sample the redacted PNG alpha: fully transparent at a set of
   known-fogged sample points (incl. corners when fogged).

Any violation fails `atlas:publish`.

## Error handling / edge cases

- Enabled, zero reveals → fully transparent layers; viewer shows pure ocean.
  Valid. Scan still passes (nothing shipped, nothing points in).
- Reveal fully covered by a conceal → that area is fog. Geometry via
  effective-lit handles it; no special case.
- Degenerate polygon (<3 pts) → ignored by `effectiveLit` (consistent with
  existing `useFogDraft` issue reporting), surfaced as a DM warning, never
  shipped.
- Reveal partly out of map bounds → mask clipped to map rect; existing
  out-of-bounds DM warning retained.
- Multi-layer map → same mask applied to every raster layer.
- `sharp` not installed / fails → build fails loudly.

## Testing strategy (TDD)

1. `effectiveLit` unit tests: inside reveal lit; inside conceal not lit;
   conceal-over-reveal not lit; feather-band point treated as fogged;
   degenerate ignored.
2. `useFogDraft` tests: conceal authoring, undo/snapshot parity, YAML
   round-trip incl. `conceals`/`featherPx`.
3. `projectMapForPlayer` tests: route/region/nav excluded when any point in
   fog; unaffected when fog disabled.
4. `redactFogMap` integration: tiny fixture map + reveal ⇒ output PNG opaque
   inside, transparent outside, partial alpha in feather band; tiled-layer
   map ⇒ throws; multi-layer ⇒ all masked.
5. `check-fog-safety` test: fixture player dir — clean passes; planted
   original-image / leaked geometry / in-fog pin each fail with the right
   exit code.
6. Secrecy regression: fog-enabled build ⇒ original layer file absent from
   `dist/`/asset output; `atlas.json` carries no reveal geometry.
7. Browser smoke (B4.5): published player site, fog-enabled map shows ocean
   + soft-edged revealed island, no eye toggle, fogged pin/route absent;
   fog-disabled map unchanged.

## Phased plan (independently shippable)

- **Phase A — Geometry + data model.** Schema `conceals`/`featherPx`;
  `effectiveLit` module + tests. No behavior change yet.
- **Phase B — Authoring.** `useFogDraft` conceal tools + Fog tab UI +
  `FogLayer` effective/feather preview + YAML round-trip.
- **Phase C — Projection.** Extend `projectMapForPlayer` (routes/regions/
  nav) behind effective-lit, with tests. Pure data filtering — no viewer or
  published-site change yet. Safe to ship alone (only removes content).
- **Phase D — Build redaction + viewer.** `sharp` dep + `redactFogMap` +
  build wiring + asset rewrite + drop geometry from player atlas; viewer
  paints ocean and the published "toggle fog" control is removed for
  fog-enabled maps. The published site's fog behavior changes **only here**
  — before D, the site keeps today's behavior, so there is no insecure
  intermediate release.
- **Phase E — Scan.** `check-fog-safety` + wire into `atlas:publish` +
  tests.

Security-sensitive ordering rule: **D and E ship in the same release.**
Redaction without the scan is an unverified secret boundary. C may ship
earlier (it only removes data); A and B are inert without D.

Gate per phase: `tsc` clean, Vitest green, ESLint clean, `atlas:publish`
scans clean, manual browser smoke.

## Open questions

None blocking. `featherPx` default (16) is a starting value; tune during
Phase D browser smoke.
