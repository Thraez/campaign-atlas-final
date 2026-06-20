# Brief — "A world you step into": atmosphere & zoom/location-aware sound

**Created:** 2026-06-17 · **Status:** ready-to-run design brief (own session) · **Owner:** the DM
**Run this in its own fresh session** (recommended on Opus — it's open-ended UI/UX design). Paste the kickoff
prompt at the bottom. This brief is self-contained; you do not need the chat it came from.

---

## What this session is for

Design the **atmosphere / "sense of place"** layer of the player site — and above all, get the **ambient
soundscape** right. This is one of three features the DM selected from the 2026-06-17 idea panel
(the others — player secrets, and browsing feel — are separate sessions). Produce a written, code-grounded,
adversarially-reviewed spec, then an implementation plan. **Do not write feature code in this session** until a
spec is approved (use the brainstorming skill first).

## The DM's hard requirement (do not design around this — design *for* it)

> **Sound must be zoom- and location-aware.** A sound bed activates only when the player is zoomed **deep into
> a specific area**, and behaves differently across zoom levels. Overview of the world map = quiet or silent;
> zoomed into the harbour district = gulls and surf; into the caverns = dripping water and echo. It is **NOT**
> one flat loop per map. Different areas at different zoom levels sound different.

Treat **browser autoplay policy** and **performance** (not eagerly loading audio) as first-class design risks,
not afterthoughts.

## Project context (everything you need)

- **What it is:** a D&D world atlas. Obsidian markdown notes → build (`scripts/build-atlas.ts`) →
  `atlas.json` → **dual publish**: (1) a player-safe **static site on GitHub Pages** (no server, no backend,
  no accounts — pure static files + client-side JS), and (2) a **local-only DM editor** (React + Leaflet).
  Audience: one **non-technical DM** and their players.
- **North star:** "effortless for me (the DM) to build, rock-solid and rich for my players to explore."
  Tie-breaker when unclear: build smoother → share safer → explore richer.
- **The DM is not a developer.** Use plain language, sleek one-button UX, hide the internals. Claude owns code
  correctness; the DM evaluates at the experience level.
- **Secrecy model (load-bearing):** the player build must never contain DM content. `%%…%%` / `:::dm` blocks
  are stripped; DM-only entities (`atlas.visibility: dm|hidden`) are excluded; build-time scans in
  `scripts/atlas/publish-orchestrator.ts` enforce it. Audio/atmosphere config must respect this (e.g. don't
  leak a DM-only area name through a sound-zone label).
- **Relevant non-goals** (`docs/NON_GOALS.md`): no VTT/rules/combat; no multi-user; no hosted DM auth; no
  server-backed player state; no AI-generated content; **no per-party variants** (atmosphere is one shared
  view, never per-player); no full GIS coordinate alignment. A mobile **player** viewer is wanted; a mobile DM
  editor is a non-goal. Keep audio assets credited (an asset-credits page already exists).
- **Already shipped — build on, don't repeat:** interactive Leaflet maps with pins/regions/routes/fog; the
  animated **"living water" ocean** with per-map DM controls; rich entity reading pane; deep-link share URLs;
  search; one-click Publish; Obsidian read-only merge import.

## Grounded starting points (verified file pointers)

- **The ocean engine to learn from / extend:** `src/atlas/ocean/OceanBackground.tsx` and
  `src/atlas/ocean/resolveWater.ts`. It already proves "an animated, configurable, per-map atmospheric layer
  that ships static and respects reduced-motion." The sound system should mirror its shape (config → resolver →
  layer component) and its **per-map DM control** pattern in `src/atlas/MapSettingsPanel.tsx`. Ocean/water
  config flows through `src/atlas/content/schema.ts` and world YAML
  (`src/atlas/yaml/buildFullWorldYaml.ts`, `validateProject.ts`).
- **Spatial geometry you can attach sound to already exists:** regions (`src/atlas/regions/RegionLayer.tsx`,
  `useRegionDraft.ts`), routes (`src/atlas/routes/RouteLayer.tsx`), fog (`src/atlas/fog/FogLayer.tsx`,
  `effectiveLit.ts`). A **sound zone** could be a region polygon, or a (map + bounds + min-zoom) trigger.
- **The map runtime is Leaflet** (`src/pages/AtlasViewer.tsx`, `AtlasMinimap.tsx`). Leaflet emits `zoomend` /
  `moveend` and exposes the current zoom + viewport bounds + center — this is the "where am I and how zoomed"
  signal that drives which bed plays.
- **Client-side persistence pattern** (for the mute toggle / "sound enabled" state): mirror
  `src/atlas/notes/playerNotes.ts` (localStorage with a `getStorage()` probe + try/catch).
- **Tests:** Vitest. The suite OOMs whole — shard it: `--shard=N/4 --poolOptions.forks.maxForks=3`. There's an
  existing `src/test/ocean/` to model new tests on.

## Design questions to resolve in the session (with the DM)

1. **Authoring a sound zone.** Attach a bed to an existing **region** the DM already drew? Draw a dedicated
   sound zone? A per-area entry in world YAML edited via a `MapSettingsPanel`-style control? Pick the path that
   needs the least new DM effort. Ground it: anchor on one concrete real example (ask the DM "which area's
   sound do you want first?").
2. **The activation model.** Define precisely: bed plays when `zoom ≥ threshold` **and** the viewport
   center (or majority) sits within zone bounds/polygon; crossfade when moving between zones; silence at
   overview. Pin the zoom threshold semantics and the crossfade timing.
3. **Autoplay & the one mute button.** Browsers block audio until a user gesture. Design a single, unobtrusive
   "tap to bring the world to life" enable, plus one **persistent mute** that remembers "off." Never auto-blast
   sound on load.
4. **Performance.** Lazy-load a bed only when the player is near its zone; never eagerly load every bed; small
   looping files; be kind to mobile data and battery. Decide the loading/eviction policy.
5. **The "calm / plain mode" master switch (panel-flagged gap).** Consider designing, alongside sound, a single
   master toggle that strips weather + sound + motion + colour-washes at once (beyond per-feature
   reduced-motion) — for players who need it or are on weak hardware. Decide whether it's in-scope now.
6. **Scope discipline.** The DM's priority is **sound**. Decide whether to ship sound first and treat weather /
   time-of-day wash / living-map flourishes / in-world cover page as follow-ons, or design the whole "sense of
   place" system and phase the build. Let the DM choose; keep the first slice small.
7. **Static + credited.** Audio ships as static assets in the player build; confirm they're included and run
   through (or added to) the asset-credits page.

## Process to follow (this worked well for the secrets feature)

1. Use the **brainstorming skill**; ask one question at a time; offer mockups where visual.
2. **Ground every claim in the real code** before committing the spec — dispatch an Explore agent over the
   ocean engine, the Leaflet zoom/bounds API usage, regions geometry, and `MapSettingsPanel`. (In the secrets
   session, an adversarial review caught several wrong assumptions — do the same here.)
3. Write the spec to `docs/superpowers/specs/2026-06-17-atmosphere-sound-design.md`; commit.
4. Run an **adversarial review** (a Workflow / parallel subagents reading the real code) focused on:
   autoplay/perf feasibility, the zoom/zone activation logic actually wiring to Leaflet, secrecy (no DM area
   name leak), and scope. Fix blockers.
5. Hand the spec to the DM to review, then invoke **writing-plans** for the implementation plan.

## Pointers

- Full idea menu (this theme + the others): `docs/DEVELOPMENT_WANTS.md` (2026-06-17 section).
- North star + what's shipped: `docs/superpowers/specs/2026-06-15-atlas-roadmap-design.md`.
- The sibling feature already specced this session: `docs/superpowers/specs/2026-06-17-player-secrets-design.md`
  (separate — don't rebuild it; use it only as a quality bar for the spec + review rigor).

## Kickoff prompt to paste into the fresh session

> Read `docs/superpowers/specs/2026-06-17-atmosphere-sound-brief.md` and run it. Design the atmosphere / "sense
> of place" layer for the player site, with the **zoom-and-location-aware ambient soundscape** as the priority
> and hard requirement. Brainstorm with me first (I'm the DM — plain language, sleek UX), ground the design in
> the real code before committing, write the spec, run an adversarial review, then a plan. Don't write feature
> code until I approve the spec.
