# Design — "A world you step into": atmosphere & zoom/location-aware sound

**Created:** 2026-06-18 · **Status:** draft for DM review (post-adversarial-review) · **Owner:** the DM
**Source brief:** `docs/superpowers/specs/2026-06-17-atmosphere-sound-brief.md`
**Process:** brainstormed with the DM (sleek/plain-language) → code-grounded via Explore agents → 4-way
adversarial review (autoplay/perf · activation-vs-Leaflet · secrecy · scope) → this revision. Changelog in §17.
**No feature code until the DM approves this spec.**

---

## 1. What we're building (in plain language)

Open the world map and you hear **silence**. Zoom **into a place** and that place quietly comes to life: zoom
into Brackenfjall and the fjord wind and distant surf fade in; zoom deeper into the harbour city inside it and it
crossfades to market bustle and gulls; zoom back out and it returns to the fjord, then to silence. You always
hear **the innermost place you've zoomed into**. Nothing blares on load; nothing plays at the world overview; the
whole layer is optional and one tap from off.

That zoom- and location-aware soundscape is the **priority and hard requirement**. This document specs it to
build-ready depth, and sketches the wider **"sense of place"** system (weather, time-of-day colour, living-map
flourishes, a cover page) as phased follow-ons on the same machinery.

## 2. North star & guardrails (recap)

- **North star:** effortless for the DM to build, rich and rock-solid for players. Tie-breaker: build smoother →
  share safer → explore richer.
- **The DM is not a developer.** Plain language, sleek one-button UX, internals hidden. Claude owns code
  correctness; the DM judges the experience.
- **Player builds must never contain DM content** (load-bearing). No DM-only area name, id, geometry, or audio
  filename may leak.
- **No accounts, no server, no per-party variants.** One shared view, static files + client JS on GitHub Pages.
  Mobile *player* viewer matters; mobile DM editor is a non-goal.
- **Autoplay policy and performance are first-class risks**, designed for head-on (§7, §8).

## 3. The hard requirement (restated, honoured)

> Sound is **zoom- and location-aware**: a bed activates only when zoomed **deep into a specific area**, and
> differs across zoom levels. Overview = silent. Not one flat loop per map.

The activation model (§6) *is* this requirement, made precise and corrected against the real Leaflet usage.

## 4. Decisions locked with the DM

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where config lives | Per **map** (sibling of the ocean `water` field). |
| D2 | What carries sound | A unified **"sound area"**: easy path = one tick on a region you already drew; power path = a drawn **sound-only zone**. Same data underneath. |
| D3 | Which sound you hear | The **innermost area you've zoomed into**, chosen by what's under the **centre of the screen**. |
| D4 | Zoom layering | By **nesting** areas (region ⊃ city ⊃ tavern); innermost eligible wins; crossfade on handoff. No per-area zoom numbers. |
| D5 | Silence | Overview + unmarked space = silent (the screen-coverage gate, §6). |
| D6 | Player control | Silence on arrival → one dismissible "bring the world to life" invite → persistent speaker/mute, remembered. |
| D7 | Calm mode | One master switch that kills sound **and** motion. Ships in Phase 1a. |
| D8 | Scope | Design the **whole** sense-of-place system; **build the player soundscape first** (Phase 1a), then the DM sound-editor (Phase 1b), then the rest. |

## 5. Grounded facts the design relies on (verified in-repo)

- **One continuous map today:** `astrath-deeprealm-overview`, `width 200000 × height 150000`, flat CRS,
  `scale.unitsPerPixel 0.05`; `regions: []` (none drawn yet); **no `minZoom`/`maxZoom`** on `MapDocument`. ⇒
  activation must be resolution-independent (§6).
- **Coordinate convention (load-bearing):** flat CRS with `lat = mapHeight − y` (`AtlasViewer.tsx` ~L32, and
  `MapController`, `WrappedWorld`, `AtlasMinimap`). `map.getCenter()` returns `LatLng` where `lng = x` and
  `lat = mapHeight − y`. Region `points` are `[x, y]` in top-left-origin map coords. **These two spaces differ —
  the y must be un-flipped before any hit-test** (§6.2).
- **`getBounds()` exposes corners, not width/height:** use `getSouthWest()/getNorthEast()` and subtract, exactly
  as `AtlasMinimap.tsx` does (`y = mapHeight − ne.lat`, etc.).
- **`pointInPolygon(x, y, poly)`** is exported from `src/atlas/fog/effectiveLit.ts` (3 args). Reusable in the
  player build; should be lifted to a shared `src/atlas/geometry/` util so sound doesn't import from fog.
- **Audio is greenfield** (no `Audio`/`AudioContext`/`howler`/`<audio>`/`.ogg` in `src/`).
- **Region geometry ships to players** via `loadAtlasContent` (`src/atlas/content/loader.ts`) → `atlas.json`; the
  sound engine can read `region.points` client-side with no editor.
- **The ocean is the template for *plumbing*, not for *shape*.** `water` is 3–4 scalars; `soundscape` is an
  **array of areas with geometry**. The per-map config→resolver→layer, `onPatch`, YAML-serialise-non-defaults,
  and reduced-motion patterns transfer; the array (add/edit/delete, stable ids, per-area omit-defaults) is a
  genuinely bigger serialization + editor problem and is *not* a trivial mirror of `waterToYamlObject`.
- **Editor stays out of player builds** via `__INCLUDE_EDITOR__` (`vite.config.ts`); `MapSettingsPanel` is
  already editor-only. Playback ships; authoring does not.
- **Static assets ship + cache:** everything under `public/` copies to the build; a `CacheFirst` workbox rule
  **already matches `/atlas/assets/`** (`vite.config.ts` ~L99). Audio lives in a new
  `public/atlas/assets/audio/`. *(That existing rule must be **modified**, not duplicated — §8.)*
- **Secrecy is NOT automatic for new fields.** Region names are stripped (`stripDmFromShippingString`) and
  filtered by `visibility` (`PLAYER_VISIBLE`) in `scripts/build-atlas.ts` (~L621–641). `scripts/check-no-secrets.ts`
  only catches hardcoded sentinels; `check-derived-secrets.ts` text-scans for vault-derived names;
  `check-image-privacy.ts` already catches secret names in *image filenames*. Structural invariants live in
  `check-artifact-shape.ts`. A new sound field gets **none** of this for free (§9).
- **No asset-credits surface exists** (only `attributionControl={false}` on Leaflet maps). Crediting audio is a
  Phase-1a *requirement*; the credits *page* is backlog item **N3** (§9.2, §11).
- **No global player settings UI / no JS reduced-motion store.** Reduced-motion is CSS-only in the ocean. Mute +
  calm mode need a **new viewer-level provider** persisting to localStorage (no auth → device-local), mirroring
  the `playerNotes.ts` storage pattern.

---

## 6. The activation model (the heart of it) — corrected against real Leaflet

### 6.1 Concepts
- A **sound area** = a polygon (its own, or a region's) + **one looping bed** (one audio file + gain). Zoom
  layering comes from **nesting**, not multiple beds: to make a place sound closer, draw a smaller area inside it.
- **Nesting is implicit** = polygon containment evaluated at resolve time. No `parentId` field; the smaller area
  simply wins when eligible.
- The viewer tracks one **active bed** per map and crossfades on change.

### 6.2 The signal — extracted from Leaflet (impure glue, in `SoundscapeLayer.tsx`)
On `zoomend`/`moveend` (the events `ViewSyncController`/`AtlasMinimap` already use), with `mapHeight` = map.height:

```ts
// centre of screen, converted into map coords (note the un-flip)
const c  = map.getCenter();
const cx = c.lng;                         // x already
const cy = mapHeight - c.lat;             // un-flip lat → y

// viewport rectangle in map coords
const b  = map.getBounds();
const sw = b.getSouthWest(), ne = b.getNorthEast();
const view = { minX: sw.lng, maxX: ne.lng, minY: mapHeight - ne.lat, maxY: mapHeight - sw.lat };
```

### 6.3 The selection — pure resolver (`selectActiveBed`, plain numbers, unit-tested)
For each area (bbox + bbox-area precomputed once):

```ts
inside   = pointInPolygon(cx, cy, area.points)                 // 3 args; the "centre of screen" rule
overlap  = rectIntersectArea(area.bbox, view)                  // axis-aligned bbox ∩ viewport
coverage = overlap / rectArea(view)                            // = how much of the SCREEN the area fills (0..1)
eligible = inside && coverage >= FILL_MIN                      // FILL_MIN ≈ 0.5 (tunable)
```

**Winner = the smallest-bbox-area eligible area** (innermost). Ties broken by `id` string sort (stable). No
eligible area → **silence**.

**Why this is correct (it replaces the earlier broken `areaSpan/viewSpan` rule):**
- **Silence at overview:** a region that occupies a third of the world view has `coverage ≈ 0.33 < FILL_MIN` →
  silent. (Guidance: mark *sub-areas*, never the entire map as one area, or it could exceed the gate at overview.)
- **Zoom-aware:** zooming shrinks the viewport rect, so `coverage` rises; an area switches on only once it fills
  ~half the screen — i.e. only when you're deep in it.
- **Nesting / innermost wins:** inside the city, both city and region cover the screen → both eligible → smaller
  (city) wins. Zoom out and the city's coverage drops below FILL_MIN → region wins → then silence.
- **Aspect-ratio safe:** measuring the actual rectangle overlap fixes the old `min(width,height)` bug that
  silenced wide coastal areas.
- **Cheap:** one point-in-polygon plus one rectangle-overlap per area whose bbox meets the viewport; runs only on
  settle.

### 6.4 Stability
- **Hysteresis:** the current winner holds until its `coverage` drops clearly below FILL_MIN (×0.85) or a
  challenger beats it by a margin — a dead-band, with a deterministic `id` tiebreak so equal-size siblings don't
  flicker.
- **Debounce ~150 ms** before a new winner takes over. (Rationale: `moveend`/`zoomend` fire once per gesture —
  including once at the end of a `flyTo` — not per frame; the debounce only guards rapid *successive*
  programmatic navigation, e.g. fast pin-clicking.)
- Compute on settle only, never on `move`/`zoom` frames.

### 6.5 Crossfade
Equal-power gain crossfade over ~1.0 s; silence = "crossfade to no bed." On a new crossfade that interrupts a
prior one, `cancelScheduledValues` and stop+disconnect the outgoing source so sources can't pile up (§8).

---

## 7. Autoplay & the player-facing shell (sleek, one switch) — browser-reality-corrected

### 7.1 Autoplay
- **No `AudioContext` exists on load.** Page is silent and idle.
- A small dismissible **invite** ("Tap to bring the world to life", bottom-corner, non-modal) appears once.
- The **AudioEngine exposes `unlock(gesture)`**, called from the React tap handler; that gesture creates +
  `resume()`s the context. Tapping the **muted speaker icon is itself the gesture** — no second invite.
- Dismissing the invite without enabling leaves a muted speaker icon; the world stays silent. **Never autoplay.**
- If Web Audio is unavailable, degrade to permanently silent (no errors, no control shown).

### 7.2 iOS / Safari realities (must be handled)
- **iOS re-suspends the context on background/lock/call.** On `visibilitychange → visible`, if
  `ctx.state === 'suspended'` call `ctx.resume()` (do **not** assume a symmetric suspend/resume; the earlier
  draft had this backwards). Suspending on hide is a *battery* choice, not required for correctness.
- **iOS hardware silent switch does NOT mute Web Audio** and there is no JS API to detect it. Documented caveat:
  device volume governs game audio; our in-app mute is the reliable control. Surface this expectation subtly.
- **Safari can't decode Ogg Vorbis.** Author **two files per bed** (`*.ogg` + `*.mp3`/`*.aac`); probe with
  `new Audio().canPlayType('audio/ogg; codecs="vorbis"')`; `try/catch` `decodeAudioData` and fall back. The
  schema carries `bed.src` + `bed.srcFallback`.

### 7.3 The control + calm mode
- After enabling, the invite shrinks to a **speaker icon** (tap = mute/unmute), choice remembered.
- A **calm mode** switch beside it = master off-ramp (weak hardware / accessibility / quiet): mutes sound **and**
  stops motion (today the ocean; later weather/washes/flourishes) in one tap.
- State lives in a new **`SoundSettingsProvider`** (`{ soundEnabled, muted, calmMode }`) that **wraps the entire
  `AtlasViewer` return** (so `SoundControl`, rendered in the corner outside the map, is inside the provider).
  Persistence mirrors `playerNotes.ts` exactly (write-probe + try/catch, key `atlas-player-sound-v1`, graceful
  no-op).
- **Calm mode ↔ ocean:** the provider sets `data-calm="true"` on `AtlasViewer`'s outermost `<div>`. The ocean
  stylesheet gains explicit sibling rules — `[data-calm] .ocean-wave-1, [data-calm] .ocean-wave-2,
  [data-calm] .ocean-wave-3 { animation: none !important }` (the classes are literal `ocean-wave-1/2/3`; CSS has
  no `*` class wildcard). *This is an acknowledged DOM coupling (the provider reaching the viewer root), accepted
  as v1 pragmatism — flagged as tech debt, not "the identical pattern."*
- System `prefers-reduced-motion` defaults calm mode's **motion** half on; it does **not** silence sound.

## 8. Performance & loading

- **Lazy load + decode** a bed only when its area is near (centre within bbox+margin, or coverage approaching
  FILL_MIN); never eagerly, never all-beds. Overview holds **zero** decoded audio.
- **Queue decodes** (≤1–2 concurrent) so `decodeAudioData` can't thrash the audio thread on fast panning.
- **LRU cache** of ≤ **4** decoded buffers; the count must allow for up-to-2 live crossfade sources + in-flight
  decodes. On crossfade interrupt, stop+disconnect the outgoing source immediately.
- **Seamless loops:** set `loopStart = 0`, `loopEnd = buffer.duration` (avoids the Safari 1-sample loop click);
  author seamless-mastered files (~20–60 s, mono/light-stereo, Ogg ~64–96 kbps + MP3/AAC twin, a few hundred KB).
- **Battery/data:** `ctx.suspend()` on mute/calm and on hide; `resume()` on show per §7.2.
- **Offline:** **modify the existing `atlas-assets` workbox rule** (`vite.config.ts` ~L99) to add
  `RangeRequestsPlugin` and `cacheableResponse: { statuses: [0, 200, 206] }`. (A new, more-specific rule placed
  *after* it would be shadowed by Workbox first-match order — do not add a second rule.)

## 9. Secrecy, assets & credits — automatic at build time (the DM never sanitises by hand)

### 9.1 Assets
Audio lives under `public/atlas/assets/audio/`. **The player build rewrites each shipped audio file to a
neutral content-hashed name** (e.g. `a1b2c3.ogg`) and rewrites `bed.src`/`bed.srcFallback` to match — so a
DM's descriptive filename (`war-room-strings.ogg`) **never reaches the player**, and caching gets a free win.

### 9.2 Credits
- **Requirement (Phase 1a):** every shipped audio file must carry credit metadata (`title`, `source`, `licence`,
  `url`) in a dedicated **`content/<world>/_atlas/credits.yaml`** (cleaner than overloading `AssetRef`, which
  would force credit fields onto existing map images).
- **The credits *page/UI* is backlog item N3**, not built here. Until N3 ships, the build emits a **warning** for
  uncredited audio; once N3 is blessed it becomes a **hard failure**. Flagged as a Phase-1a → N3 dependency.

### 9.3 No DM leak — the build does all of it, **in place, before serialization**
The soundscape must **not** be copied wholesale into `atlas.json` (the safe-because-secretless `water`
passthrough is an anti-pattern here). In `build-atlas.ts`, mutate each map's `soundscape` **in place before the
map is written**:
1. **Sound-only areas:** keep only `PLAYER_VISIBLE` ones (same set as regions); `stripDmFromShippingString` the
   `name` (`"%%War room%% Cellar"` → `"Cellar"`).
2. **Ride-on areas:** if the referenced region is **not** player-visible, **drop the whole area** (so its
   `regionId` can't dangle and reveal an excluded region). A `regionId` pointing at a *player-visible* region is
   safe — that id already ships with the region.
3. **Neutralise ids:** replace each shipped `SoundArea.id` with a neutral index (`s0`, `s1`, …); the player
   resolver doesn't need meaningful ids.
4. **Filenames:** handled by the content-hash rewrite (§9.1).
5. **Drop the whole `soundscape` key** if no areas survive (no empty shell).

**Runtime resolver is belt-and-suspenders only:** `prepareAreas` resolves `regionId` against shipped regions and
skips unresolved ids — but the **build exclusion above is the primary defense**.

### 9.4 The automated assertion (the safety net `check-no-secrets` can't provide)
Add a structural check in **`check-artifact-shape.ts`** (or new `check-soundscape-secrecy.ts`), chained into
`atlas:publish`. Parse the player `atlas.json` and **fail the build** unless, for every `map.soundscape.areas[]`:
(a) no area has `visibility` ∈ {`dm`, `hidden`, `unknown`}; (b) every ride-on `regionId` resolves in that map's
`regions[]`; (c) no shipped `name`/`src` contains a vault-derived secret substring (reuse the
`check-derived-secrets` name set / `check-image-privacy` filename logic, extended to audio). The generic sentinel
scanner cannot do this — this check is the net.

## 10. Architecture (config → resolver → layer)

### 10.1 Data model — `src/atlas/content/schema.ts`
```ts
// on MapDocument (sibling of `water`):
soundscape?: SoundscapeConfig;

interface SoundscapeConfig {
  enabled?: boolean;          // default true; false ⇒ §10.6
  masterGain?: number;        // 0..1, default 0.6 (editor label: "Volume" 0–100%)
  areas?: SoundArea[];        // optional + may be empty
}
interface SoundArea {
  id: string;                 // internal; neutralised on ship (§9.3)
  regionId?: string;          // ride-on (borrow a region's points + visibility)
  points?: Point[];           // sound-only zone (when no regionId)
  visibility?: EntityVisibility; // sound-only zones ONLY; ride-on inherits the region's (own value ignored)
  name?: string;              // optional label; DM-strippable; never required to ship
  bed: SoundBed;              // exactly ONE looping bed (nesting handles zoom layering)
}
interface SoundBed {
  src: string;                // primary (e.g. .ogg)
  srcFallback?: string;       // Safari twin (.mp3/.aac)
  gain?: number;              // 0..1, default 0.7 (editor label: "Loudness")
}
```
*(Single term throughout: "bed". No "track"/"loop"/"layer" as synonyms.)*

### 10.2 Resolver — `src/atlas/sound/resolveSoundscape.ts` (pure)
- `prepareAreas(map)` → precompute bbox + bbox-area; resolve `regionId` → points against the map's shipped
  regions; drop unresolved/empty.
- `selectActiveBed(areas, cx, cy, view, prev)` → §6.3 algorithm. Pure; receives plain numbers, no Leaflet
  objects. The Leaflet→numbers extraction (§6.2) lives in the layer and is **tested separately** (§12).

### 10.3 Runtime layer — `src/atlas/sound/` (ships to players, no `__INCLUDE_EDITOR__`)
- **`SoundscapeLayer.tsx`** — Leaflet child via `useMap()`; subscribes to `zoomend`/`moveend`; reads provider;
  extracts §6.2; calls resolver; drives the engine.
- **`AudioEngine.ts`** — owns the `AudioContext` (created via `unlock(gesture)`), master `GainNode`
  (mute/calm/masterGain), per-bed gain + looping source, LRU buffer cache, lazy/queued decode, crossfade ramps,
  suspend/resume, Safari fallback. Pure of React; `unlock(gesture)` is its entry API.
- **`SoundSettingsProvider.tsx`** + **`soundPrefs.ts`** — context + localStorage (mirrors `playerNotes.ts`).
- **`SoundControl.tsx`** — invite → speaker/mute → calm toggle. The **gesture surface is an injectable callback**
  so the Phase-5 cover page can host it later without rework (§11).

### 10.4 Editor authoring — **Phase 1b** (gated; not in the first build)
- A **"Sound"** section in `MapSettingsPanel.tsx` (already editor-only; also `__INCLUDE_EDITOR__`-guarded).
- "Give this region a sound" reads the **existing regions list** and writes a ride-on `SoundArea { regionId }`.
- "Draw a sound-only zone" needs a **new `useSoundAreaDraft` hook** — `useRegionDraft.ts` is hardwired to emit
  `Region` objects and **cannot be reused**; we *copy its interaction pattern* (a `useMapEvents` point-capture +
  start/draw/finish state machine) into a sound-area equivalent.
- The panel needs **array add/edit/delete** UX (water's shallow-merge sliders don't cover a list); DM-friendly
  labels ("Volume" / "Loudness" as 0–100%, "Sound: choose a file").
- Persistence is the water path: `onPatch({ soundscape })` → editor draft → `POST /__atlas/save` →
  `soundscapeToYamlObject` (serialise non-defaults **per array item**, stable ids) → world.yaml → build.

### 10.5 Build-pipeline files that change
1. `schema.ts` — types above. 2. `buildFullWorldYaml.ts` (+ `loadWorldConfig.ts`) — `soundscapeToYamlObject`
(array-aware, not a `water` clone). 3. `build-atlas.ts` — §9.3 in-place filter/strip/neutralise + §9.1 audio
content-hash rewrite. 4. `vite.config.ts` — modify the `atlas-assets` workbox rule (§8). 5.
`check-artifact-shape.ts` (or new check) — §9.4 assertion + uncredited-audio warning→error. 6.
`public/atlas/assets/audio/` (+ `.gitkeep`). 7. `content/<world>/_atlas/credits.yaml`.

### 10.6 `enabled: false` behaviour
Like the ocean returning `null`: `SoundscapeLayer` creates **no** `AudioContext`, shows **no** invite/control for
that map. Calm mode is independent (a global player setting). A map with `enabled:false` is fully silent and inert.

## 11. The whole "sense of place" system (phased)

All phases share the spine: per-map config → pure resolver → a layer that ships static, respects **calm mode +
reduced-motion**, and is leak-safe. Calm mode governs every motion/sound source.

- **Phase 1a — Player soundscape engine + calm mode (build first).** §6–§10 minus the editor. Tested with a
  **hand-authored `soundscape` in `world.yaml`** (Claude places the first Brackenfjall area). The hard
  requirement, shipped and playable.
- **Phase 1b — DM sound-authoring UI** (§10.4): ride-on + draw, panel section, array UX. Lets the DM author
  without Claude.
- **Phase 2 — Weather** (precip/fog particle overlay, per-area intensity).
- **Phase 3 — Time-of-day colour wash** (tint layer, manual DM setting or in-world clock).
- **Phase 4 — Living-map flourishes** (clouds, birds, settlement smoke).
- **Phase 5 — In-world cover page** ("enter the world"). It **hosts the audio-enable gesture** via the injectable
  callback from §10.3; the Phase-1a invite is scaffolding it can replace, migrating existing
  `atlas-player-sound-v1` opt-ins. *(Acknowledged design debt, not a silent "additive" assumption.)*
- **Dependency:** credits page = backlog **N3**; audio crediting metadata required from Phase 1a (§9.2).

## 12. Testing (Vitest, sharded: `--shard=N/4 --poolOptions.forks.maxForks=3`; model on `src/test/ocean/`)
- **Resolver (priority):** `selectActiveBed` — overview = silence; on/off at the FILL_MIN boundary; nested
  region/city handoff both directions; hysteresis (no flap in the dead-band); smallest-wins + `id` tiebreak on
  equal-size siblings; unresolved `regionId` skipped.
- **Extraction glue (catches the §6.2 class of bug):** mock `map.getCenter()`/`getBounds()` with known values;
  assert extracted `cx, cy, view, coverage` — including the y un-flip — before they reach the resolver.
- **Prefs store:** mirror `playerNotes` tests (probe failure → no-op; round-trip; corrupt JSON).
- **Engine (mocked `AudioContext`):** no context before `unlock`; crossfade ramps + outgoing-source cleanup; LRU
  eviction; suspend on mute/hidden, resume on visible; Safari fallback path.
- **Build/secrecy fixtures:** a `dm` sound-only area + a `%%…%%` label + a ride-on area on a `dm` region + a
  descriptive audio filename → assert in player `atlas.json`: none of the DM areas survive, the label is stripped,
  ids are neutralised, the filename is content-hashed, and the §9.4 assertion passes; an uncredited audio asset →
  warning (pre-N3) / failure (post-N3).

## 13. Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| Autoplay blocked / blares | No `AudioContext` until `unlock(gesture)`; one invite; never autoplay (§7.1). |
| iOS re-suspend on tab-switch | Resume-on-visible when `state==='suspended'` (§7.2). |
| iOS silent switch ignores Web Audio | Documented; device volume + in-app mute are the controls (§7.2). |
| Safari no Ogg | Dual files + `canPlayType` probe + `try/catch` decode fallback (§7.2). |
| Loop click on Safari | Explicit `loopStart/loopEnd` + seamless mastering (§8). |
| Crossfade source pile-up | Cancel ramps + stop/disconnect outgoing on interrupt; LRU accounts for it (§8). |
| Offline audio / range requests | Modify existing workbox rule: `RangeRequestsPlugin` + statuses `[0,200,206]` (§8). |
| Mobile battery/data | Lazy+queued decode, LRU evict, suspend on mute/hidden/calm, small files (§8). |
| Coordinate-space bug | Un-flip + corner-derived viewport, tested in isolation (§6.2, §12). |
| Overview not silent for huge areas | Screen-coverage gate + "mark sub-areas, not the whole map" guidance (§6.3). |
| DM content leak (name/id/regionId/filename/geometry) | Build-time in-place drop/strip/neutralise/hash + structural assertion (§9). |
| Scope creep | Phase 1a = engine + calm mode only; editor 1b; credits = N3; rest deferred (§11). |

## 14. Open questions (for review / before build)
1. **Credits page (N3) timing** — confirm it's deferred; audio still needs `credits.yaml` metadata from 1a.
2. **Tunable defaults** — `FILL_MIN≈0.5`, crossfade≈1.0 s, debounce≈150 ms, buffer-cap 4, masterGain 0.6,
   bed gain 0.7. Fine-tune on real audio.
3. **Brackenfjall + city sound textures** — the DM's actual intended sounds, to source/credit the first loops.

## 15. Acceptance criteria (Phase 1a)
- Overview silent; no `AudioContext` and no audio fetched until the player's first tap.
- Zoom into a marked area fades its bed in; zoom into a nested area crossfades to it; zoom out reverses; leaving
  all areas fades to silence — driven by centre-of-screen + coverage, no flip-flop at edges, correct under the
  y-flip (verified by the extraction test).
- Mute + calm mode work, persist across reloads, and calm mode stops the ocean motion too.
- Player `atlas.json` contains **no** DM-only sound area, label, meaningful id, descriptive filename, or excluded
  `regionId`; §9.4 assertion passes; editor authoring UI absent from the player bundle.
- iOS: audio survives a tab-switch; Safari: a bed with only Ogg degrades gracefully via fallback.
- `npm run atlas:publish` (build + all scans) passes; sharded Vitest green.

## 16. Non-goals (this build)
Per-party/per-player audio · server/account-backed audio state · AI-generated audio · narration/voice/music tied
to events · a mobile **DM** editor · weather/time-of-day/flourishes/cover page (designed in §11, built later) ·
the credits **page** (N3).

## 17. Adversarial review changelog (what the 4-way review changed)
- **Activation (Leaflet):** fixed non-existent `bounds.width/height` → corner math; fixed the centre/polygon
  **coordinate-space mismatch** (y un-flip); fixed `pointInPolygon` arg count; **replaced** the `areaSpan/viewSpan`
  gate (which made big areas audible at overview and silenced wide areas) with **screen-coverage** = bbox∩view /
  view; added `id` tiebreak; clarified nesting = containment at resolve time; corrected the debounce rationale;
  added an extraction-glue test.
- **Autoplay/perf:** added `unlock(gesture)` API; fixed iOS resume-on-visible (was backwards); documented the iOS
  silent-switch caveat; required Safari Ogg fallback (dual file + probe + try/catch); explicit loop points;
  crossfade source cleanup; **modify** (not add) the workbox rule with `RangeRequestsPlugin`; queued decodes;
  named the provider mount point and the exact `ocean-wave-1/2/3` selectors.
- **Secrecy:** build-time, **in-place** drop/strip before serialization (not a `water` passthrough); drop ride-on
  areas whose region is excluded; **neutralise ids**; **content-hash audio filenames**; drop empty `soundscape`;
  structural assertion in `check-artifact-shape.ts`; runtime resolver demoted to belt-and-suspenders.
- **Scope/architecture:** split Phase 1 into **1a (engine+calm)** / **1b (editor)**; **cut** the editor from the
  first build (test with hand-authored YAML); credits **page** → backlog N3 (metadata still required);
  corrected the false "reuse `useRegionDraft`" (copy the pattern instead) and the over-stated "mirrors the ocean"
  (array serialization/editor is bigger); flagged the calm-mode DOM coupling as tech debt; made the cover-page
  gesture surface injectable; defined `enabled:false`; unified "bed" terminology.
