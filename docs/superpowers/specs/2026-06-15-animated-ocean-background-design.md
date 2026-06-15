# Animated ocean background ("living water") — design

**Date:** 2026-06-15
**Status:** Approved (human brainstorm session) — ready to queue for the continuous-dev routine.
**Origin:** Human-directed look-&-feel refuel. The DM asked to replace the map's flat ocean colour
with a "living sea" — subtle, contrasting waves with gentle animation — and required it be fully
adjustable and switch-off-able in case it looks wrong over a real map. Default chosen: **on, but gentle.**

## Summary

Today each map's water is a single flat colour (`MapDocument.oceanColor`, painted as the Leaflet
container background in both the player viewer and the editor — `AtlasViewer.tsx` ~L369 and
`AtlasPlacementEditor.tsx` ~L369). This feature upgrades that flat fill into a configurable, gently
animated "living water" layer rendered behind the map art. Because the published player site renders
fog by making hidden land transparent (build-time redaction), the animated water shows through fogged
areas automatically.

The effect is driven entirely by per-map config, ships **on by default at a subtle/slow setting**, and
has a hard **off switch that returns the map to exactly today's flat colour** (no broken state). The
renderer is an isolated component so its internals can be replaced later without touching consumers.

## Goals
- Replace the flat ocean with a subtle animated water layer, per map.
- Fully tunable in the editor (on/off, strength, speed, crest colour), saved through the existing Save.
- Default on + gentle; trivially disable per map → identical to today.
- Show consistently on the player site (including through fog) and in the editor.
- Isolated/replaceable renderer; performant; respects reduced-motion.

## Non-goals (v1)
- The app's outer chrome background (behind side panels / toolbar). Optional later "quieter cousin."
- Per-shape / per-region water variation. One water config per map.
- Canvas / WebGL shaders. v1 is lightweight CSS/SVG.
- Water locked to map coordinates (panning/zooming with the map). v1 water is a fixed viewport backdrop,
  exactly like today's flat fill.
- Fixing the editor's "preview as players" fog dim to reveal water (see Follow-ups).

## Behaviour contract
1. A map with no `water` config renders the **default**: animated water, gentle (low intensity, slow
   speed), crest colour derived from `oceanColor`. (Default-on.)
2. `water.enabled === false` → render **only** the flat `oceanColor` background — byte-for-byte today's
   behaviour. (Kill switch; no broken state.)
3. `intensity` 0..1 scales wave visibility (opacity/amplitude). `speed` 0..1 scales drift (0 = still).
4. `crestColor` overrides the lighter wave tone; default = `oceanColor` lightened.
5. The water layer never intercepts pointer events (map drag/zoom unaffected).
6. With OS/browser "reduce motion", the water renders **still** (no animation) at its configured look.
7. Player site and editor render the same water from the same config. On the published site the water
   shows through fog (transparent redacted land reveals the backdrop).

## Data model
Extend `MapDocument` (`src/atlas/content/schema.ts`, the interface near L54-68):
```ts
export interface WaterConfig {
  enabled?: boolean;     // default true
  intensity?: number;    // 0..1, default ~0.35 (gentle)
  speed?: number;        // 0..1, default ~0.3 (slow)
  crestColor?: string;   // hex; default derived from oceanColor
}
export interface MapDocument {
  // ...existing...
  oceanColor?: string;   // existing — the deep/base water colour
  water?: WaterConfig;   // NEW
}
```
A pure `resolveWater(map): Required<WaterConfig>` helper applies defaults + clamps (intensity/speed to
0..1, validate hex, derive crestColor from oceanColor). Mirror the sanitize style already used in
`loadWorldConfig.ts`.

## Rendering
- New isolated module `src/atlas/ocean/` (mirrors `src/atlas/fog/`): `OceanBackground.tsx` (the layer)
  + `resolveWater.ts` (pure) + a `DEFAULT_WATER` constant.
- `OceanBackground` renders a full-bleed layer filling the map viewport, `pointer-events: none`,
  positioned **behind the Leaflet panes** (panes are `z-index: 1` per `src/index.css` L257; the backdrop
  sits at z-index 0, above the container base colour). Use a CSS/SVG wave treatment equivalent to the
  approved mockup: base = `oceanColor`, 2-3 drifting crest layers in `crestColor` at low opacity, optional
  faint glints. Animate via CSS `transform: translateX` loops with durations derived from `speed`. Gate
  the animation behind `@media (prefers-reduced-motion: no-preference)`.
- When `enabled === false`: render nothing (the consumer keeps its existing `background: oceanColor`).
- Integration: both `AtlasViewer.tsx` (~L359-369) and `AtlasPlacementEditor.tsx` (~L318-369) set
  `background: oceanColor` on `MapContainer`. Keep that base colour as the fallback and mount
  `OceanBackground` inside the map container behind the panes. **One shared component** for both surfaces.
- **Autonomy guard:** if a backdrop cannot sit behind the Leaflet panes without intercepting map
  interaction, ship the simplest equivalent (e.g. animate the container background itself) and hand back
  the pane-layer upgrade — do NOT risk breaking map drag/zoom, and do NOT expand scope.

## Config plumbing
- `scripts/atlas/loadWorldConfig.ts` (~L147-174): parse + sanitize `water` from each map's YAML (clamp,
  validate hex, apply defaults). Follow the existing `sanitizeScale`/`sanitizeGrid` helper pattern.
- `src/atlas/yaml/buildFullWorldYaml.ts` `mapToYamlObject` (~L48-69): serialize `water` back to YAML,
  omitting fields equal to the defaults to keep the file clean (like the existing conditional fields).
- `scripts/build-atlas.ts`: `water` rides into the player `atlas.json` like `oceanColor` (no special
  handling needed; confirm it is preserved).
- Player viewer reads `water` from the loaded atlas.

## Editor controls
`src/atlas/MapSettingsPanel.tsx` (~L49-68): add a "Living water" section under the ocean-colour picker:
- toggle **Animated water** (enabled)
- slider **Strength** (intensity)
- slider **Speed** (speed)
- colour **Wave colour** (crestColor; pre-filled with the derived default)

Each control calls the existing `onPatch({ water: { ... } })` → `patchMap` → mapOverride draft → existing
Save (`buildFullWorldYaml` → `/__atlas/save`). Undo is automatic. When the toggle is off, hide/grey the
three tuning controls.

## Security / privacy
`water` is benign world-level theme data; it carries no DM content. The publish scans key on DM sentinels
and editor fingerprints (`scripts/check-no-secrets.ts` L25-37), not on world-config fields, so a new
`water` object will not trip them — the same as the existing `oceanColor` and `fog.color`, which already
ship to players. No new secret surface.

## Testing / done-when
- `resolveWater` unit tests: undefined → enabled+gentle defaults; out-of-range intensity/speed clamped;
  invalid hex crestColor falls back to the derived default; `enabled:false` passthrough.
- Config round-trip: a map with `water` in `world.yaml` → `loadWorldConfig` parses it → `build-atlas`
  includes it in the player `atlas.json` (build test, mirroring the existing oceanColor/importFolders tests).
- `OceanBackground` component tests: renders nothing when disabled; renders the animated layer when
  enabled; the layer carries `pointer-events: none`; the reduced-motion path produces the still variant
  (assert via class/markup, not by reading the live media query).
- `MapSettingsPanel` test: the four controls render; toggling/sliding emits the expected
  `onPatch({ water })`.
- Parity: viewer and editor use the same component (shared-import assertion or both-render test).
- **Gate:** sharded vitest (`--shard=N/4 --poolOptions.forks.maxForks=3`) green; `tsc --noEmit` clean;
  eslint 0 errors. **The build pipeline is touched** (schema / loadWorldConfig / buildFullWorldYaml /
  build-atlas) → also run `npm run atlas:publish` and `npm run atlas:publish:integrity-smoke` green.

## Suggested phasing (for the routine; TDD)
1. Schema + `resolveWater` + `DEFAULT_WATER` + tests (pure; no behaviour change).
2. `OceanBackground` component + tests; mount behind panes in viewer + editor; default-on-gentle visible.
3. Config plumbing (loadWorldConfig parse + buildFullWorldYaml serialize + build-atlas pass-through) +
   round-trip/build tests; player parity; run publish + integrity-smoke.
4. `MapSettingsPanel` controls + save + UI tests.

Each phase passes the gate before the next. Phases 1-3 are a natural first unit; phase 4 a second.

## Files to touch
- `src/atlas/content/schema.ts` — `WaterConfig` + `MapDocument.water`
- `src/atlas/ocean/OceanBackground.tsx` (new), `src/atlas/ocean/resolveWater.ts` (new)
- `src/pages/AtlasViewer.tsx`, `src/pages/AtlasPlacementEditor.tsx` — mount the layer
- `scripts/atlas/loadWorldConfig.ts` (parse/sanitize), `src/atlas/yaml/buildFullWorldYaml.ts` (serialize),
  `scripts/build-atlas.ts` (pass-through if needed)
- `src/atlas/MapSettingsPanel.tsx` — controls
- Tests under `src/test/ocean/**` (+ extend the world-loader/build tests);
  `content/astrath-deeprealm/_atlas/world.yaml` (optional seed example)
- `src/index.css` only if shared keyframes/classes are genuinely cleaner there (prefer component-scoped)

## Follow-ups (not in v1)
- **Honest fog preview:** the editor's "preview as players" fog fill paints a flat dim
  (`FogLayer.tsx` playerMode `#1a1a2e`) that hides the water, mismatching the real player site where the
  water shows through. Make the player-preview fog reveal the backdrop. Candidate to fold into G1 (honest
  player preview) or a small follow-up WANT.
- **Outer app background:** a quieter, non-moving complementary treatment behind the side panels/toolbar.
