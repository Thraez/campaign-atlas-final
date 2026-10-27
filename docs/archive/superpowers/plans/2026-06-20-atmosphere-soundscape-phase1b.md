# Atmosphere Soundscape — Phase 1b Implementation Plan (DM sound-authoring UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the DM author soundscapes **inside the editor** — give a region a sound, draw a sound-only zone, pick an audio file per area, set volume/loudness, and Save — instead of hand-editing `world.yaml`. Persistence reuses the Phase 1a YAML round-trip (`soundscapeToYamlObject`) through the existing unified Save. No new persistence path; no player-runtime changes; the editor stays out of player builds.

**What's already built (Phase 1a, Tasks 1–16, the prerequisite):** the player-side soundscape engine + calm mode, shipped static and leak-safe:
- **Schema** (`src/atlas/content/schema.ts`): `SoundscapeConfig` / `SoundArea` / `SoundBed` on `MapDocument` (sibling of `water`).
- **Resolver** (`src/atlas/sound/resolveSoundscape.ts`): `prepareAreas(map)`, `selectActiveBed(...)`, `FILL_MIN`, `HYSTERESIS`.
- **Runtime**: `AudioEngine.ts`, `SoundscapeLayer.tsx`, `SoundSettingsProvider.tsx`, `SoundControl.tsx`, `readViewport.ts`, `soundPrefs.ts`, `realAudioDeps.ts` — all wired into `AtlasViewer` (Phase 1a Task 11).
- **YAML round-trip** (`src/atlas/yaml/buildFullWorldYaml.ts`): `soundscapeToYamlObject(sc)` (array-aware, omit-defaults, stable ids) + the `if (m.soundscape) out.soundscape = …` line in `mapToYamlObject`; `loadWorldConfig.ts` passthrough on the read side (Phase 1a Tasks 12–13).
- **Player-build secrecy** (`scripts/atlas/filterSoundscape.ts` → `build-atlas.ts`): drop DM/excluded-region areas in place, strip `%%…%%` names, neutralise ids (`s0`,`s1`,…), content-hash audio filenames (Phase 1a Tasks 13–14).
- **Build-time secrecy assertion** (`scripts/atlas/checkSoundscapeSecrecy.ts` → `check-artifact-shape.ts`, chained into `atlas:publish`): no `dm`/`hidden` area survives, no dangling `regionId`, no derived-secret substring in `name`/`src` (Phase 1a Task 15).

**What this phase adds (editor only):** a new **"Sound"** rail item whose panel lets the DM:
1. **Give an existing region a sound** (ride-on `SoundArea { regionId }`) from the region list — least DM effort, per spec §10.4.
2. **Draw a sound-only zone** (own polygon) via a new `useSoundAreaDraft` hook that *copies* the region draw interaction (the spec is explicit: `useRegionDraft` emits `Region` objects and **cannot** be reused).
3. **Pick an audio file per area** and set **Volume** (master, 0–100%) and **Loudness** (per-bed, 0–100%); set per-zone **visibility**.
4. **Save** — the soundscape flows through `patchMap({ soundscape })` → `activeMap` → the existing unified Save → `buildFullWorldYaml` → `soundscapeToYamlObject` → `world.yaml` → build.

**Architecture (mirrors the existing region authoring spine):** a draft hook (`useSoundscapeDraft`, modelled on `useRegionDraft`) is the single source of truth for in-progress sound-area work; a panel (`SoundscapeTab`, modelled on `RegionsTab` + `MapSettingsPanel`) owns the list/form/add-delete UX; a thin Leaflet capture layer (`SoundAreaLayer`, modelled on `RegionLayer`'s `useMapEvents` draw-capture) collects polygon clicks while drawing. The panel writes the merged `soundscape` back onto the active map via the editor's existing `patchMap` seam, exactly as `MapSettingsPanel` writes `water`/`grid`.

**Tech Stack:** TypeScript, React, react-leaflet (Leaflet flat CRS), Vitest (sharded), the existing editor shell (`AtlasPlacementEditor`, `railRegistry`, `EditorRail`), the unified Save (`/__atlas/save`).

**Spec:** `docs/superpowers/specs/2026-06-17-atmosphere-sound-design.md` — read **§10.4 (editor authoring — Phase 1b)** first, then §4 (D1–D8 decisions), §6 (activation — so authored areas behave), §9 (secrecy — the gates this phase must not break), §10.1 (schema). The Phase 1a plan (`docs/superpowers/plans/2026-06-18-atmosphere-soundscape-phase1a.md`) is the continuity reference for module shapes.

---

## Prerequisites & non-prerequisites (read before starting)

- **Hard prerequisite: Phase 1a (Tasks 1–16) is merged.** This phase imports `SoundscapeConfig`/`SoundArea`/`SoundBed` from `schema.ts`, calls `soundscapeToYamlObject` (so authored data serialises), and relies on the player-build filter + secrecy assertion to keep authored DM areas out of player builds. At session start, confirm `src/atlas/sound/` and `soundscapeToYamlObject` exist in the working tree (`git log` / `Grep`). If Phase 1a is **not** yet merged here (e.g. it currently lives only under `.claude/run-soundscape-p1a-20260618/`), stop and merge/land Phase 1a first — do not re-implement it.
- **NOT a prerequisite: real audio files.** O1 Task 17 (the first live Brackenfjall area) is blocked on the DM supplying sourced/credited loops. **Phase 1b authoring UI does not require real audio to build or test** — every test uses placeholder/mocked filenames (e.g. `"placeholder.ogg"`), and the panel's file picker lists whatever is in `public/atlas/assets/audio/` (empty is fine; it shows an empty state + a free-text fallback). The end-to-end payoff ("DM authors a real area and hears it") is realised once audio exists, but this phase proceeds independently of that.

## Project gates every task must honour (state these in every PR/commit)

- **(a) Editor stays out of player builds.** All new code is **editor-only**: it lives under `src/atlas/tabs/`, `src/atlas/sound-editor/`, and is reached only from `AtlasPlacementEditor` (already `__INCLUDE_EDITOR__`-gated via `src/App.tsx`). **Never import any new authoring module from a player-mode entry point** (`AtlasViewer`, `Landing`, `App`'s player path, the `src/atlas/sound/` runtime modules). The runtime `SoundscapeLayer`/`AudioEngine` must not gain an import of anything under `sound-editor/`. Add an explicit guard test (Task 8) that asserts the player runtime does not import the authoring modules.
- **(b) Phase 1a secrecy stays green.** Any task that can change build output keeps the player-build filter (`filterSoundscape.ts`) and the build-time assertion (`checkSoundscapeSecrecy.ts`) passing. DM-only sound areas (`visibility: dm|hidden`, or ride-on a non-player region) must never reach a player build. New authoring defaults must not create player-visible areas by accident — **a newly drawn sound-only zone defaults to `visibility: "dm"`** (mirrors `useRegionDraft`, which defaults new regions to `dm`), so nothing leaks until the DM deliberately marks it player-visible.
- **(c) Standard gate = sharded Vitest + tsc + eslint.** Run a single new test file with `npx vitest run <path>`. For suite-wide runs use `--shard=N/4 --poolOptions.forks.maxForks=3` and **never run all 4 shards in parallel** (paging-file exhaustion). Then `npx tsc --noEmit` and `npm run lint`.
- **(d) If a task touches the build pipeline, also `npm run atlas:publish` green** (build + `atlas:check-secrets` + `atlas:check-derived` + the soundscape secrecy assertion). Only Task 9 (the end-to-end verify) touches the pipeline indirectly; Tasks 1–8 are editor-only and gate on (c) alone.

## Conventions

- New editor draft/layer code under `src/atlas/sound-editor/`; new panel under `src/atlas/tabs/`. New tests under `src/test/sound-editor/` (mirrors `src/test/sound/` and the existing `src/test/shell/` panel tests).
- Reuse `@testing-library/react` (already a dev dep — the editor tabs are tested with it, e.g. `src/test/settings/MapSettingsPanel.labels.test.tsx`).
- Coordinate convention (load-bearing): map coords are `[x, y]`, top-left origin; on the map, points are captured exactly as `RegionLayer`'s draw-capture does (`y = mapHeight - e.latlng.lat`). The runtime resolver handles the un-flip — authoring stores plain `[x, y]`.
- DM-facing labels only (no dev jargon): **"Volume"** = `masterGain`, **"Loudness"** = per-bed `gain`, **"Sound: choose a file"** = `bed.src`. Single term "bed" never surfaces to the DM.
- Commit after every task. Use `feat:`/`test:`/`chore:` prefixes.

---

## Phase A — Authoring draft state (the pure-ish core)

### Task 1: `useSoundscapeDraft` — list add/edit/delete + ride-on + draw state

**Scope:** The single source of truth for in-progress soundscape work on the active map, modelled on `useRegionDraft`. Owns: the working `SoundscapeConfig` (areas array + `enabled`/`masterGain`), selection, draw state machine (`startDraw`/`addDraftPoint`/`removeLastDraftPoint`/`finishDraw`/`cancelDraw`), `addRideOn(regionId)`, `patchArea`, `patchBed`, `remove`, `reset`, and an `effective` `SoundscapeConfig` to feed both the panel and the save merge. Pure of Leaflet (receives `[x,y]` points). Stable ids minted locally (`s0`,`s1`,… or slug-based); the player build re-neutralises them anyway.

**Files:**
- Create: `src/atlas/sound-editor/useSoundscapeDraft.ts`
- Test: `src/test/sound-editor/useSoundscapeDraft.test.ts`

- [ ] **Step 1: Write the failing test FIRST**

```ts
// src/test/sound-editor/useSoundscapeDraft.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSoundscapeDraft } from "@/atlas/sound-editor/useSoundscapeDraft";
import type { MapDocument } from "@/atlas/content/schema";

const map = (over: Partial<MapDocument> = {}): MapDocument =>
  ({ id: "m", name: "M", width: 1000, height: 1000, layers: [], regions: [], ...over } as MapDocument);

describe("useSoundscapeDraft", () => {
  it("starts empty when the map has no soundscape", () => {
    const { result } = renderHook(() => useSoundscapeDraft(map()));
    expect(result.current.effective.areas ?? []).toEqual([]);
    expect(result.current.dirty).toBe(false);
  });

  it("adds a ride-on area for an existing region (defaults to one bed, no leak surface)", () => {
    const { result } = renderHook(() =>
      useSoundscapeDraft(map({ regions: [{ id: "r1", mapId: "m", name: "R", points: [[0,0],[10,0],[10,10]], visibility: "player" } as any] })),
    );
    act(() => result.current.addRideOn("r1"));
    expect(result.current.effective.areas).toHaveLength(1);
    expect(result.current.effective.areas![0].regionId).toBe("r1");
    expect(result.current.effective.areas![0].bed.src).toBe(""); // empty until DM picks a file
    expect(result.current.dirty).toBe(true);
  });

  it("draws a sound-only zone and the new area defaults to visibility dm (secrecy-safe)", () => {
    const { result } = renderHook(() => useSoundscapeDraft(map()));
    act(() => result.current.startDraw());
    act(() => { result.current.addDraftPoint([0,0]); result.current.addDraftPoint([100,0]); result.current.addDraftPoint([100,100]); });
    let id: string | null = null;
    act(() => { id = result.current.finishDraw(); });
    expect(id).toBeTruthy();
    const area = result.current.effective.areas!.find((a) => a.id === id)!;
    expect(area.points).toHaveLength(3);
    expect(area.regionId).toBeUndefined();
    expect(area.visibility).toBe("dm"); // never ships until DM opts it in
  });

  it("rejects a draw with fewer than 3 points", () => {
    const { result } = renderHook(() => useSoundscapeDraft(map()));
    act(() => result.current.startDraw());
    act(() => result.current.addDraftPoint([0,0]));
    let id: string | null = "x";
    act(() => { id = result.current.finishDraw(); });
    expect(id).toBeNull();
  });

  it("patches a bed file + per-bed gain and the master gain", () => {
    const { result } = renderHook(() =>
      useSoundscapeDraft(map({ regions: [{ id: "r1", mapId: "m", name: "R", points: [[0,0],[10,0],[10,10]], visibility: "player" } as any] })),
    );
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    act(() => result.current.patchBed(id, { src: "wind.ogg", gain: 0.4 }));
    act(() => result.current.setMasterGain(0.8));
    expect(result.current.effective.areas![0].bed).toMatchObject({ src: "wind.ogg", gain: 0.4 });
    expect(result.current.effective.masterGain).toBe(0.8);
  });

  it("removes an area and reset() clears all local changes", () => {
    const { result } = renderHook(() =>
      useSoundscapeDraft(map({ regions: [{ id: "r1", mapId: "m", name: "R", points: [[0,0],[10,0],[10,10]], visibility: "player" } as any] })),
    );
    act(() => result.current.addRideOn("r1"));
    const id = result.current.effective.areas![0].id;
    act(() => result.current.remove(id));
    expect(result.current.effective.areas ?? []).toEqual([]);
    act(() => result.current.addRideOn("r1"));
    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    expect(result.current.effective.areas ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails** — `npx vitest run src/test/sound-editor/useSoundscapeDraft.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `useSoundscapeDraft`.** Model the state machine on `useRegionDraft` (draw flags, `draftPoints`, `mutate` + optional `undoStack` for Cmd+Z parity). The `effective` getter merges the map's existing `soundscape` with local edits/adds/deletes into one `SoundscapeConfig`. Key shapes:
  - `addRideOn(regionId)`: push `{ id, regionId, bed: { src: "" } }`. Ride-on areas inherit the region's visibility (per §10.1) — do **not** set `visibility` on them.
  - `finishDraw()`: mint id, push `{ id, points: draftPoints, visibility: "dm", bed: { src: "" } }`; return the id (or null if `< 3` points).
  - `patchArea(id, partial)`, `patchBed(id, partial)`, `setEnabled(b)`, `setMasterGain(g)`, `setVisibility(id, v)`, `remove(id)`, `reset()`, `selectedId`/`setSelectedId`.
  - Expose `dirty`/`dirtyCount`, `issues` (e.g. "area has no sound file yet" warning; "ride-on region missing"; sub-3-point polygon blocking).
  - Accept an optional `undoStack?: UndoStackAPI` param (same signature shape as `useRegionDraft`) and route mutations through it; tests above don't exercise undo, so it can be a no-op when absent.

- [ ] **Step 4: Run the test, verify it passes** — `npx vitest run src/test/sound-editor/useSoundscapeDraft.test.ts` → PASS.

- [ ] **Done when:** all six cases pass; `npx tsc --noEmit` clean; the hook is pure of Leaflet (no `react-leaflet` import); a newly drawn area is `visibility: "dm"` and a ride-on area has no `visibility` field.

- [ ] **Step 5: Commit** — `git commit -m "feat: useSoundscapeDraft — editor draft state for sound areas (ride-on + draw)"`

---

### Task 2: `soundAreaDraftToConfig` — fold the draft into a save-ready `SoundscapeConfig`

**Scope:** A pure helper that takes the draft's `effective` and produces the exact `SoundscapeConfig` to set on the active map (drop empty-areas → `undefined`; trim blank `name`; keep `enabled:false`/non-default `masterGain`). This is the single function the panel calls to feed `patchMap({ soundscape })`, and it guarantees the object handed to `soundscapeToYamlObject` (Phase 1a) is well-formed. Keeping it separate from the hook makes the save seam trivially testable.

**Files:**
- Create: `src/atlas/sound-editor/soundAreaDraftToConfig.ts`
- Test: `src/test/sound-editor/soundAreaDraftToConfig.test.ts`

- [ ] **Step 1: Write the failing test FIRST**

```ts
// src/test/sound-editor/soundAreaDraftToConfig.test.ts
import { describe, it, expect } from "vitest";
import { soundAreaDraftToConfig } from "@/atlas/sound-editor/soundAreaDraftToConfig";

describe("soundAreaDraftToConfig", () => {
  it("returns undefined when there are no areas (drops the key)", () => {
    expect(soundAreaDraftToConfig({ areas: [] })).toBeUndefined();
    expect(soundAreaDraftToConfig({ enabled: true, masterGain: 0.6, areas: [] })).toBeUndefined();
  });

  it("keeps a populated soundscape and preserves ride-on + sound-only shapes", () => {
    const out = soundAreaDraftToConfig({
      enabled: false,
      masterGain: 0.8,
      areas: [
        { id: "s0", regionId: "r1", name: "  ", bed: { src: "wind.ogg" } },
        { id: "s1", points: [[0,0],[10,0],[10,10]], visibility: "dm", bed: { src: "cave.ogg", gain: 0.4 } },
      ],
    })!;
    expect(out.enabled).toBe(false);
    expect(out.masterGain).toBe(0.8);
    expect(out.areas).toHaveLength(2);
    expect(out.areas![0].name).toBeUndefined(); // blank name trimmed away
    expect(out.areas![1].visibility).toBe("dm");
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run src/test/sound-editor/soundAreaDraftToConfig.test.ts` → FAIL.

- [ ] **Step 3: Implement** `soundAreaDraftToConfig(sc: SoundscapeConfig): SoundscapeConfig | undefined` — return `undefined` when `areas` is empty; otherwise rebuild a clean config (omit blank `name`, keep `enabled:false`, keep `masterGain` only when present). Do **not** strip default `masterGain`/`gain` here — that's `soundscapeToYamlObject`'s job (Phase 1a) on the way to YAML; this just produces a valid in-memory config.

- [ ] **Step 4: Run, verify it passes** — PASS.

- [ ] **Done when:** both cases pass; the function is pure and imports only `schema.ts` types.

- [ ] **Step 5: Commit** — `git commit -m "feat: soundAreaDraftToConfig — fold draft into save-ready SoundscapeConfig"`

---

## Phase B — On-map drawing + the authoring panel

### Task 3: `SoundAreaLayer` — capture polygon clicks while drawing (copy RegionLayer's pattern)

**Scope:** A Leaflet child (editor-only) that, **only while the draft is in drawing mode**, captures map clicks into `addDraftPoint([x, y])` and renders the in-progress polyline/polygon plus existing sound-area outlines for context. Copies `RegionLayer`'s `useMapEvents` draw-capture and the `y = mapHeight - e.latlng.lat` flip; placement clicks pass through normally when not drawing. The spec (§10.4) is explicit that `useRegionDraft` can't be reused — this layer drives `useSoundscapeDraft` instead.

**Files:**
- Create: `src/atlas/sound-editor/SoundAreaLayer.tsx`
- Test: `src/test/sound-editor/SoundAreaLayer.capture.test.ts` (test the pure click→point conversion; the react-leaflet wiring is exercised manually in Task 9, exactly as Phase 1a tested `SoundscapeLayer` logic separately)

- [ ] **Step 1: Write the failing test FIRST.** Extract the click-to-map-point conversion into an exported pure function `clickToMapPoint(latlng, mapHeight)` and test it:

```ts
// src/test/sound-editor/SoundAreaLayer.capture.test.ts
import { describe, it, expect } from "vitest";
import { clickToMapPoint } from "@/atlas/sound-editor/SoundAreaLayer";

describe("clickToMapPoint", () => {
  it("flips Leaflet lat→y and keeps lng as x", () => {
    // click at lat=800 on a 1000-tall map => y = 200; lng=300 => x=300
    expect(clickToMapPoint({ lat: 800, lng: 300 }, 1000)).toEqual([300, 200]);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — FAIL (module not found).

- [ ] **Step 3: Implement `SoundAreaLayer`.** Export `clickToMapPoint(latlng, mapHeight): Point` = `[latlng.lng, mapHeight - latlng.lat]`. The component takes `{ map: MapDocument; api: SoundscapeDraftAPI }`, uses a `useMapEvents({ click })` capture that early-returns unless `api.drawing` then calls `api.addDraftPoint(clickToMapPoint(e.latlng, map.height))`, and renders existing areas + the draft polyline (mirror `RegionLayer` lines ~45–55 and the draft-render block). Editor-only — only mounted inside `AtlasPlacementEditor`'s `<MapContainer>`.

- [ ] **Step 4: Run, verify it passes** — PASS.

- [ ] **Done when:** `clickToMapPoint` test passes; `npx tsc --noEmit` clean; the layer is imported only by the editor (verified structurally in Task 8).

- [ ] **Step 5: Commit** — `git commit -m "feat: SoundAreaLayer — on-map draw capture for sound zones (editor-only)"`

---

### Task 4: `SoundscapeTab` — the authoring panel (list + ride-on + draw + file/volume/visibility)

**Scope:** The DM-facing panel, modelled on `RegionsTab` + `MapSettingsPanel`. Sections:
1. **Master:** an "Ambient sound" enable toggle (`enabled`) + a **Volume** slider (`masterGain`, shown 0–100%).
2. **Add:** "Give a region a sound" (a `Select` of the map's regions → `addRideOn`) and "Draw a sound area" (`startDraw`/finish/cancel toolbar, copied from `RegionsTab`).
3. **List:** each sound area with its source region name (ride-on) or "drawn zone" + point count; click to select.
4. **Selected-area form:** **"Sound: choose a file"** (a `Select` populated from a passed-in `availableAudioFiles: string[]`, plus a free-text `Input` fallback so it works before audio exists), **Loudness** slider (`bed.gain`, 0–100%), and for **sound-only** zones a **Visibility** `Select` (`player`/`rumor`/`dm`/`hidden`) — ride-on areas show "inherits the region's visibility" instead. Delete button.
DM-facing labels only; a one-line "Changes are saved with the editor's Save button." header like `MapSettingsPanel`.

**Files:**
- Create: `src/atlas/tabs/SoundscapeTab.tsx`
- Test: `src/test/sound-editor/SoundscapeTab.test.tsx`

- [ ] **Step 1: Write the failing test FIRST**

```tsx
// src/test/sound-editor/SoundscapeTab.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SoundscapeTab } from "@/atlas/tabs/SoundscapeTab";
import type { MapDocument } from "@/atlas/content/schema";

const map = (): MapDocument =>
  ({ id: "m", name: "M", width: 1000, height: 1000, layers: [],
     regions: [{ id: "r1", mapId: "m", name: "Brackenfjall", points: [[0,0],[10,0],[10,10]], visibility: "player" } as any] } as MapDocument);

describe("SoundscapeTab", () => {
  it("shows DM-facing labels and an empty state, and lets the DM give a region a sound", () => {
    const onPatch = vi.fn();
    render(<SoundscapeTab map={map()} onPatch={onPatch} availableAudioFiles={["wind.ogg"]} />);
    // DM-facing copy, not jargon:
    expect(screen.getByText(/Volume/i)).toBeTruthy();
    expect(screen.queryByText(/masterGain/i)).toBeNull();
    // Give a region a sound -> onPatch carries a soundscape with a ride-on area
    const giveBtn = screen.getByRole("button", { name: /give a region a sound|add sound/i });
    act(() => giveBtn.click());
    // After selecting region r1 (the only one) the panel patches the map's soundscape:
    expect(onPatch).toHaveBeenCalled();
    const lastPatch = onPatch.mock.calls.at(-1)![0];
    expect(lastPatch.soundscape.areas[0].regionId).toBe("r1");
  });

  it("does not surface the editor controls to a player path — pure render, no AudioContext", () => {
    const onPatch = vi.fn();
    render(<SoundscapeTab map={map()} onPatch={onPatch} availableAudioFiles={[]} />);
    // free-text fallback exists when no audio files are available
    expect(screen.getByPlaceholderText(/file name|choose a file|\.ogg/i)).toBeTruthy();
  });
});
```

*(If the exact button label flow differs once `useSoundscapeDraft` drives the panel, keep the assertion on `onPatch.mock.calls.at(-1)[0].soundscape.areas[0].regionId === "r1"` — that is the load-bearing contract. Adjust the trigger interaction to match the real control, e.g. choosing the region in the `Select` then clicking add.)*

- [ ] **Step 2: Run, verify it fails** — FAIL (module not found).

- [ ] **Step 3: Implement `SoundscapeTab`.** Props: `{ map: MapDocument; onPatch: (patch: Partial<MapDocument>) => void; availableAudioFiles: string[]; undoStack?: UndoStackAPI; api?: SoundscapeDraftAPI }`. Internally use `useSoundscapeDraft(map, undoStack)` (or the injected `api` for the on-map layer to share). On every mutation, call `onPatch({ soundscape: soundAreaDraftToConfig(api.effective) })` (Task 2) — this is the **only** persistence path; it reuses `patchMap` → unified Save → `soundscapeToYamlObject`. Reuse `TabFrame`, `Button`, `Input`, `Label`, `Slider`, `Select` like `RegionsTab`/`MapSettingsPanel`. Labels: "Volume"/"Loudness"/"Sound: choose a file"; empty state copy: "No sounds yet. Give a region a sound, or draw a sound area on the map."

- [ ] **Step 4: Run, verify it passes** — PASS.

- [ ] **Done when:** both cases pass; no jargon strings (`masterGain`/`bed`/`gain`) appear in rendered text; mutating any control results in an `onPatch({ soundscape })` call whose payload round-trips through `soundscapeToYamlObject` without throwing (assert in the test if convenient).

- [ ] **Step 5: Commit** — `git commit -m "feat: SoundscapeTab — DM sound-authoring panel (ride-on/draw/file/volume/visibility)"`

---

### Task 5: Audio-file listing for the picker (`listAvailableAudio`)

**Scope:** A tiny editor-only helper that produces the `availableAudioFiles: string[]` the panel's file picker shows — the basenames of files already under `public/atlas/assets/audio/`. The dev editor reads them via the existing dev endpoint / a static manifest; **in tests it's a pure function over a provided file list**, so it needs no real audio. When the folder is empty, the panel falls back to the free-text input (Task 4), so authoring still works before audio is sourced.

**Files:**
- Create: `src/atlas/sound-editor/listAvailableAudio.ts`
- Test: `src/test/sound-editor/listAvailableAudio.test.ts`

- [ ] **Step 1: Write the failing test FIRST**

```ts
// src/test/sound-editor/listAvailableAudio.test.ts
import { describe, it, expect } from "vitest";
import { audioBasenames } from "@/atlas/sound-editor/listAvailableAudio";

describe("audioBasenames", () => {
  it("keeps only audio files and returns basenames, sorted, de-duped", () => {
    expect(audioBasenames(["a/b/wind.ogg", "x/cave.mp3", "notes.txt", "x/cave.mp3"]))
      .toEqual(["cave.mp3", "wind.ogg"]);
  });
  it("returns [] for an empty or non-audio listing", () => {
    expect(audioBasenames([])).toEqual([]);
    expect(audioBasenames(["readme.md"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — FAIL.

- [ ] **Step 3: Implement** `audioBasenames(paths: string[]): string[]` (filter `.ogg|.mp3|.aac|.m4a|.wav`, take basename, dedupe, sort) and a thin `loadAvailableAudio()` that, in the dev editor, fetches the manifest/dir listing and pipes it through `audioBasenames`. Keep `loadAvailableAudio` out of the pure test; only `audioBasenames` is unit-tested. **Design decision (recorded in openQuestions):** the dev listing uses a small static manifest emitted next to the audio dir (or the existing dev file endpoint) rather than a new server API — no new persistence/endpoint surface.

- [ ] **Step 4: Run, verify it passes** — PASS.

- [ ] **Done when:** both cases pass; the picker degrades to the free-text fallback when the list is empty.

- [ ] **Step 5: Commit** — `git commit -m "feat: listAvailableAudio — audio-file picker source for the sound panel"`

---

## Phase C — Wire into the editor shell

### Task 6: Register the "Sound" rail item

**Scope:** Add a declarative **"Sound"** entry to the rail registry so the panel is reachable, alongside Pins/Regions/Routes/Fog in the `"map"` group. Registry stays declarative/testable; the actual panel node is injected by `AtlasPlacementEditor` (Task 7).

**Files:**
- Modify: `src/atlas/shell/railRegistry.tsx`
- Test: `src/test/shell/railRegistry.test.tsx` (extend)

- [ ] **Step 1: Extend the failing test FIRST.** Add a case asserting `buildRailItems({ panels: { sound: <div/> }, counts: {} })` includes an item with `id: "sound"`, `group: "map"`, `label: "Sound"`, and a `panel`.

- [ ] **Step 2: Run, verify it fails** — FAIL (no `sound` item).

- [ ] **Step 3: Implement.** Import a `Volume2` (or `Music`) icon from `lucide-react`; add `mk("sound", "map", "Sound", <Volume2 className={ICON} />, "S")` to `buildRailItems` after the `fog` line. **Check the `"S"` shortcut doesn't collide** with an existing binding in `EditorRail`/CommandPalette; if it does, drop the shortcut (leave it `undefined`).

- [ ] **Step 4: Run, verify it passes** — PASS; also run `npx vitest run src/test/shell/railRegistry.test.tsx`.

- [ ] **Done when:** the registry test passes; the new item sits in the `"map"` group; no shortcut collision.

- [ ] **Step 5: Commit** — `git commit -m "feat: register Sound rail item in the editor"`

---

### Task 7: Mount `SoundscapeTab` + `SoundAreaLayer` in `AtlasPlacementEditor`

**Scope:** Wire the new panel and on-map draw layer into the editor, sharing one `useSoundscapeDraft` instance (so the panel form and the map stay in sync, exactly as `RegionsTab` + `RegionLayer` share `regionDraft`). Persist through the **existing** `patchMap` seam and confirm the soundscape survives the save merge.

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx`

- [ ] **Step 1: Instantiate the draft.** Near `const regionDraft = useRegionDraft(...)` (~L378), add `const soundscapeDraft = useSoundscapeDraft(activeMap, undoStack);` and `const availableAudio = useAvailableAudio();` (or load once into state via `loadAvailableAudio`).

- [ ] **Step 2: Add the panel to the `panels` Record** (the inline object around L1450–1530 that already holds `settings`/`publish`/etc.):
```tsx
sound: (
  <SoundscapeTab
    map={activeMap}
    onPatch={patchMap}
    availableAudioFiles={availableAudio}
    undoStack={undoStack}
    api={soundscapeDraft}
  />
),
```

- [ ] **Step 3: Mount the draw layer inside `<MapContainer>`** alongside `RegionLayer` (so clicks are captured while drawing):
```tsx
<SoundAreaLayer map={activeMap} api={soundscapeDraft} />
```

- [ ] **Step 4: Confirm the save merge carries `soundscape`.** In `updatedMaps` (the `project.maps.map((m) => …)` block ~L730), the active map is spread as `{ ...activeMap, regions: regionDraft.effective, … }`. Because the panel writes the soundscape onto the active map via `patchMap({ soundscape })` (which lands in the map-override layer and is already folded into `activeMap`), **no change may be needed** — but verify by reading the block. If the spread does **not** include the soundscape (e.g. `activeMap` is rebuilt from a baseline that drops it), add `soundscape: soundAreaDraftToConfig(soundscapeDraft.effective)` to the returned object so the unified Save → `buildFullWorldYaml` → `soundscapeToYamlObject` chain receives it. Whichever path, the soundscape must reach `buildFullWorldYaml`.

- [ ] **Step 5: Add the imports** (`SoundscapeTab`, `SoundAreaLayer`, `useSoundscapeDraft`, the audio loader) at the top of the editor file.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; `npx vitest run src/test/sound-editor src/test/shell/railRegistry.test.tsx` PASS; `npm run lint` clean.

- [ ] **Done when:** the editor compiles, the Sound rail item opens the panel, drawing on the map adds points to the shared draft, and a save (next task verifies on disk) writes the soundscape to `world.yaml`.

- [ ] **Step 7: Commit** — `git commit -m "feat: wire SoundscapeTab + SoundAreaLayer into the editor; persist via unified Save"`

---

### Task 8: Player-build exclusion guard test (gate (a))

**Scope:** A structural test that fails if any authoring module is reachable from the player runtime — the automated belt for "editor stays out of player builds." Asserts the `src/atlas/sound/` runtime modules and the player entry points (`AtlasViewer`, `App` player path) do **not** import anything under `src/atlas/sound-editor/` or `src/atlas/tabs/SoundscapeTab`.

**Files:**
- Test: `src/test/sound-editor/player-build-exclusion.test.ts`

- [ ] **Step 1: Write the failing test FIRST.** Read the runtime + entry source files and assert none contains an import path matching `sound-editor/` or `tabs/SoundscapeTab`:

```ts
// src/test/sound-editor/player-build-exclusion.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const playerSurfaces = [
  "src/pages/AtlasViewer.tsx",
  "src/atlas/sound/SoundscapeLayer.tsx",
  "src/atlas/sound/AudioEngine.ts",
  "src/atlas/sound/SoundControl.tsx",
  "src/atlas/sound/SoundSettingsProvider.tsx",
];

describe("authoring UI is excluded from player surfaces", () => {
  for (const rel of playerSurfaces) {
    it(`${rel} does not import the sound-editor authoring code`, () => {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).not.toMatch(/sound-editor\//);
      expect(src).not.toMatch(/tabs\/SoundscapeTab/);
    });
  }
});
```

- [ ] **Step 2: Run.** If Phase 1a wired the runtime cleanly, this should already PASS once the files exist. If it FAILS, an authoring import leaked into a player surface — remove it; authoring is reachable only via `AtlasPlacementEditor` (the `__INCLUDE_EDITOR__`-gated path).

- [ ] **Done when:** the test passes for every player surface; conceptually confirms gate (a) — `__INCLUDE_EDITOR__` tree-shakes the authoring UI out of `npm run build`.

- [ ] **Step 3: Commit** — `git commit -m "test: guard that the sound-authoring UI never imports into player surfaces"`

---

## Phase D — End-to-end verify + secrecy re-confirm

### Task 9: Author → Save → build → secrecy green (manual + full gate)

**Scope:** Prove the loop end-to-end with **placeholder** audio (real audio is O1's job): author a player-visible ride-on area and a `dm` sound-only zone in the editor, Save, confirm `world.yaml` gained a correct `soundscape`, then run the full publish gate and confirm the DM zone is filtered out of the player build while the player area survives — i.e. Phase 1a's secrecy filter + assertion stay green with authored data.

**Files:**
- Create (if absent): `public/atlas/assets/audio/.gitkeep` and a tiny placeholder loop `placeholder.ogg` (CC0 silence or a short tone — for build/secrecy testing only; replaced by O1's real audio).
- Modify (verify only, no source edits expected): `content/<world>/_atlas/world.yaml` will be written by the editor Save.

- [ ] **Step 1: Dev author.** `npm run dev`, open the editor, pick the Sound rail item.
  - "Give a region a sound" on a **player-visible** region; choose `placeholder.ogg`; set Loudness.
  - "Draw a sound area" over a DM-only spot; leave it `visibility: dm`; choose `placeholder.ogg`.
  - Save (Ctrl+S).

- [ ] **Step 2: Confirm `world.yaml`.** Read `content/<world>/_atlas/world.yaml`; assert the map gained a `soundscape:` with two areas (one ride-on with `regionId`, one with `points` + `visibility: dm`), serialised by `soundscapeToYamlObject` (defaults omitted, ids stable).

- [ ] **Step 3: Full publish gate (touches the build → gate (d)).** Run `npm run atlas:publish`. Then parse the **player** `public/atlas/atlas.json` and confirm:
  - the **player** ride-on area survives, its id neutralised (`s0`), `placeholder.ogg` content-hashed;
  - the **`dm`** sound-only zone is **absent** (dropped by `filterSoundscape.ts`);
  - the soundscape secrecy assertion (`checkSoundscapeSecrecy.ts`) passes.
  Expected: build + `atlas:check-secrets` + `atlas:check-derived` + the soundscape assertion all green.

- [ ] **Step 4: Sharded test gate (gate (c)).** `npx vitest run --shard=1/4 --poolOptions.forks.maxForks=3`, then `2/4`, `3/4`, `4/4` **sequentially** (never all four at once). Then `npx tsc --noEmit` and `npm run lint`. All green.

- [ ] **Step 5: Manual sanity in the player viewer.** Build the player site (`npm run build` or the published `public/atlas/`), open it, enable sound, zoom into the authored player area, confirm the bed plays (with `placeholder.ogg` it'll be silence/tone — the point is the plumbing); confirm the DM zone produces nothing because it never shipped.

- [ ] **Done when:** `world.yaml` round-trips the authored soundscape; `npm run atlas:publish` is green; the player `atlas.json` contains the player area (neutralised id + hashed filename) and **not** the DM zone; sharded Vitest + tsc + eslint green. The "real audio" payoff is deferred to O1 Task 17 and does not block this.

- [ ] **Step 6: Commit** — `git commit -m "test: end-to-end author→save→build→secrecy for the sound panel (placeholder audio)"`

---

## Self-review (run before handing off)

**Spec coverage (§10.4 + decisions):**
- "Give this region a sound" (ride-on, reads the existing regions list) → Tasks 1 (`addRideOn`), 4 (panel control), 7 (wire).
- "Draw a sound-only zone" via a **new** `useSoundAreaDraft`-style hook (not `useRegionDraft`) → Tasks 1 (draw state machine), 3 (`SoundAreaLayer` capture).
- Array add/edit/delete UX with DM-friendly labels ("Volume"/"Loudness"/"Sound: choose a file", 0–100%) → Task 4.
- Persistence is the water path (`onPatch({ soundscape })` → editor draft → `/__atlas/save` → `soundscapeToYamlObject` → world.yaml → build) → Tasks 2, 4, 7, 9. **No new persistence path invented.**

**Gates wired:**
- (a) editor-out-of-player-builds → all code under `sound-editor/`+`tabs/`, reached only from the `__INCLUDE_EDITOR__`-gated editor; guard test in Task 8.
- (b) Phase 1a secrecy stays green → new sound-only zones default `visibility: dm`; Task 9 re-runs the filter + assertion with authored data.
- (c) sharded Vitest + tsc + eslint → every task; Task 9 runs the full sharded suite sequentially.
- (d) `atlas:publish` green → Task 9.

**Out of scope (correctly deferred):** the player runtime engine/calm mode (Phase 1a, done); sourcing/crediting **real** audio + the first live Brackenfjall area (O1 Task 17, blocked on the DM's files); weather/time-of-day/flourishes/cover page (Phases 2–5); the credits **page** (N3). A mobile **DM** editor is a non-goal — this panel targets the desktop editor only.

**Type consistency:** `useSoundscapeDraft(map, undoStack?)` → `SoundscapeDraftAPI` (`effective: SoundscapeConfig`, `addRideOn`, draw state, `patchArea`/`patchBed`/`setMasterGain`/`setEnabled`/`setVisibility`/`remove`/`reset`); `soundAreaDraftToConfig(sc) → SoundscapeConfig | undefined`; `clickToMapPoint(latlng, mapHeight) → Point`; `audioBasenames(paths) → string[]`; `SoundscapeTab({ map, onPatch, availableAudioFiles, undoStack?, api? })`; `SoundAreaLayer({ map, api })` — names used identically across tasks and consistent with the Phase 1a `SoundscapeConfig`/`SoundArea`/`SoundBed` schema.

**Open items to confirm during execution (not blockers):**
- Exact shape of the editor's audio-listing source (static manifest vs dev file endpoint) — Task 5 design decision; either way no new server API.
- Whether the save merge already carries `soundscape` via the `activeMap` spread or needs an explicit add — Task 7 Step 4 (read the block first).
- Rail shortcut letter for "Sound" (avoid collision) — Task 6 Step 3.
- Whether `useSoundscapeDraft` should share the save-boundary undo entry like `useRegionDraft.snapshot()/applySnapshot()` — add if the editor's save cleanup expects it; harmless to include.
