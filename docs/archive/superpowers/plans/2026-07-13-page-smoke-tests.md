# Page-Level Smoke Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first end-to-end smoke tests for the two largest, currently-untested user-facing pages — `src/pages/AtlasViewer.tsx` (1085 LOC) and `src/pages/AtlasPlacementEditor.tsx` (2794 LOC) — so a refactor that breaks page wiring fails a test instead of shipping.

**Architecture:** Both pages mount a real `react-leaflet` `MapContainer`, which does not render in jsdom. We introduce ONE reusable `react-leaflet` mock and ONE reusable `makeProject()` atlas-data factory (today ~10 test files each roll their own copy — this plan extracts the canonical one). Each smoke test stubs `fetch` for `atlas.json`/`search-index.json`, renders the real page, and asserts the page mounts and shows known content — black-box, resilient to leaflet internals.

**Tech Stack:** Vitest (jsdom), `@testing-library/react` (`render`/`screen`/`fireEvent`/`waitFor` — note `@testing-library/user-event` is NOT a dependency; use `fireEvent`), `fake-indexeddb` (already a dep, used by the editor's session store).

**Why this is first:** it is both the top-ranked correctness gap from the review AND the mandatory regression net for `2026-07-13-editor-monolith-teardown.md`. Do not start the teardown until Task 3 here is green.

---

## Grounded context (verified file:line)

- jsdom shims live in `src/test/setup.ts:1-28` (ResizeObserver, scrollIntoView, matchMedia). No fetch/IndexedDB/leaflet shims — those are per-test.
- Existing partial leaflet mock: `src/test/accessibility-labels.test.tsx:31-41` mocks only `useMap` and warns (lines 26-30) that a non-stable fake-map reference causes an infinite render loop in `AtlasMinimap`. Our mock MUST return a stable object.
- Both pages import react-leaflet directly: `AtlasViewer.tsx:2-11` (`MapContainer, Marker, Popup, Polygon, Polyline, ImageOverlay, Tooltip, useMap`); `AtlasPlacementEditor.tsx:2` (`MapContainer, Marker, useMap, useMapEvents`). Child layers (`RegionLayer`, `RouteLayer`, `FogLayer`, `SoundAreaLayer`, `MapLayerEditableOverlay`, `AtlasMinimap`, `RulerLayer`) also import react-leaflet / `useMapEvents`, and mount unconditionally inside each page's `<MapContainer>`.
- `AtlasViewer` (`AtlasViewer.tsx:147`): no props. Mount effect `AtlasViewer.tsx:230-231` does `Promise.all([loadAtlasContent(true), loadSearchIndex()])`. `loadAtlasContent` → `fetch(BASE + "atlas/atlas.json")` (`src/atlas/content/loader.ts:9-11`), validated by `parseAtlasProject` (throws on bad shape). Uses `<Link>` → needs `MemoryRouter`. Main landmark: `AtlasViewer.tsx:625-628` (`main#atlas-main`, map name in `aria-label`).
- `AtlasPlacementEditor` (`AtlasPlacementEditor.tsx:208` inner, `:2321-2327` outer wraps `<ViewModeProvider>`): no props. Has NO internal `isDmToolsEnabled` gate (that lives only in the route at `src/App.tsx:26-27`), so importing the component directly bypasses it. `__INCLUDE_EDITOR__` is already `"true"` under vitest (`vitest.config.ts:11`). Mount effect `:224-238` calls `loadAtlasContent(true)`; `overrides` seeded from localStorage `atlas-placement-overrides-v3` (`src/atlas/editor/placementOverrides.ts:34-36`). `useEditorSession` (`:126`) persists to IndexedDB (see `placement-save-integration.test.tsx:25,234` which imports `"fake-indexeddb/auto"` and `idbDelete(SESSION_IDB_KEY)` in `beforeEach`). A 30s poll re-fetches atlas.json (`:246-280`) — harmless but avoid fake timers.
- No shared AtlasProject factory exists. Most complete inline example to copy: `src/test/accessibility-labels.test.tsx:69-100`.
- Precedent for testing a leaflet-coupled component with a real-ish mount: `src/test/atlas/MapLayerEditableOverlay.test.tsx`.

## File structure

- Create `src/test/helpers/reactLeafletMock.tsx` — the shared react-leaflet `vi.mock` factory.
- Create `src/test/helpers/makeProject.ts` — canonical `makeProject`/`makeEntity`/`makeMap` factories typed against `src/atlas/content/schema.ts`.
- Create `src/test/pages/AtlasViewer.smoke.test.tsx`.
- Create `src/test/pages/AtlasPlacementEditor.smoke.test.tsx`.

---

## Task 1: Shared atlas-data factory + leaflet mock

**Files:**
- Create: `src/test/helpers/makeProject.ts`
- Create: `src/test/helpers/reactLeafletMock.tsx`

- [ ] **Step 1: Write `makeProject.ts`.** Model the return types on `src/atlas/content/schema.ts` (`AtlasProject`, `Entity`, `MapDocument`, `MapLayer`, `MapPlacement`). Provide overridable factories. Minimum viable shape below; expand fields only as the page mount demands them (iterate against real errors from `parseAtlasProject`).

```ts
import type { AtlasProject, Entity, MapDocument } from "@/atlas/content/schema";

export function makeEntity(over: Partial<Entity> = {}): Entity {
  return {
    id: "iron-tower",
    title: "Iron Tower",
    type: "location",
    visibility: "player",
    summary: "A tower of black iron.",
    body: "",
    tags: [],
    images: [],
    aliases: [],
    ...over,
  } as Entity;
}

export function makeMap(over: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "overview",
    name: "Overview",
    width: 1000,
    height: 1000,
    layers: [],
    placements: [{ entityId: "iron-tower", x: 500, y: 500 }],
    ...over,
  } as MapDocument;
}

export function makeProject(over: Partial<AtlasProject> = {}): AtlasProject {
  return {
    world: { id: "astrath-deeprealm", name: "Astrath Deeprealm" },
    entities: [makeEntity()],
    maps: [makeMap()],
    assets: [],
    ...over,
  } as AtlasProject;
}

export function makeSearchIndex() {
  return [{ id: "iron-tower", title: "Iron Tower", type: "location", body: "A tower of black iron." }];
}
```

- [ ] **Step 2: Write `reactLeafletMock.tsx`.** A factory returning a mock module object. `MapContainer` and layer wrappers render children; hooks return stable fakes. Export a helper to install it.

```tsx
import { vi } from "vitest";
import React from "react";

const STABLE_MAP = {
  getBounds: () => ({ getNorth: () => 1000, getSouth: () => 0, getEast: () => 1000, getWest: () => 0 }),
  getZoom: () => 0,
  setView: vi.fn(), flyTo: vi.fn(), on: vi.fn(), off: vi.fn(),
  fitBounds: vi.fn(), getContainer: () => document.createElement("div"),
};

export function installReactLeafletMock() {
  vi.mock("react-leaflet", () => {
    const pass = (name: string) =>
      ({ children }: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-leaflet": name }, children);
    return {
      MapContainer: pass("MapContainer"),
      ImageOverlay: pass("ImageOverlay"),
      Marker: pass("Marker"),
      Popup: pass("Popup"),
      Tooltip: pass("Tooltip"),
      Polygon: pass("Polygon"),
      Polyline: pass("Polyline"),
      Pane: pass("Pane"),
      useMap: () => STABLE_MAP,
      useMapEvents: () => STABLE_MAP,
    };
  });
}
```

- [ ] **Step 3: Commit.**
```bash
git add src/test/helpers/makeProject.ts src/test/helpers/reactLeafletMock.tsx
git commit -m "test(helpers): shared makeProject factory + react-leaflet mock for page smoke tests"
```

---

## Task 2: AtlasViewer smoke test

**Files:**
- Create: `src/test/pages/AtlasViewer.smoke.test.tsx`

- [ ] **Step 1: Write the failing test.** `vi.mock("react-leaflet", ...)` calls are hoisted, so call `installReactLeafletMock()` at top-of-module (before imports of the page). Stub `fetch` by URL substring.

```tsx
import { installReactLeafletMock } from "../helpers/reactLeafletMock";
installReactLeafletMock();

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasViewer from "@/pages/AtlasViewer";
import { makeProject, makeSearchIndex } from "../helpers/makeProject";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const body = String(url).includes("search-index") ? makeSearchIndex() : makeProject();
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AtlasViewer smoke", () => {
  it("mounts, loads the atlas, and surfaces a known entity", async () => {
    render(<MemoryRouter><AtlasViewer /></MemoryRouter>);
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    // Open search (Ctrl/Cmd-K path is proven elsewhere) OR assert the map landmark carries the map name.
    expect(document.querySelector("main#atlas-main")).toHaveAttribute("aria-label", expect.stringContaining("Overview"));
  });
});
```

- [ ] **Step 2: Run and iterate.** `npx vitest run src/test/pages/AtlasViewer.smoke.test.tsx`. Expect failures FIRST from unmocked mount-time deps flagged as open questions: `SoundSettingsProvider`/`SoundscapeLayer` (audio) and `OceanBackground` (canvas). For each real failure, add the minimal shim to `src/test/setup.ts` (e.g. an `AudioContext` stub, a `HTMLCanvasElement.prototype.getContext` stub) — NOT a per-test hack. Re-run until green. Do not weaken the assertion to pass; fix the mount.

- [ ] **Step 3: Commit.**
```bash
git add src/test/pages/AtlasViewer.smoke.test.tsx src/test/setup.ts
git commit -m "test(viewer): first page-level smoke test for AtlasViewer"
```

---

## Task 3: AtlasPlacementEditor smoke test (REQUIRED before teardown)

**Files:**
- Create: `src/test/pages/AtlasPlacementEditor.smoke.test.tsx`

- [ ] **Step 1: Write the failing test.** Import `"fake-indexeddb/auto"` first, clear IDB + localStorage in `beforeEach`.

```tsx
import "fake-indexeddb/auto";
import { installReactLeafletMock } from "../helpers/reactLeafletMock";
installReactLeafletMock();

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";
import { makeProject } from "../helpers/makeProject";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(makeProject()) } as Response)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AtlasPlacementEditor smoke", () => {
  it("mounts the real editor page with a fixture atlas", async () => {
    render(<AtlasPlacementEditor />);
    // Editor chrome renders once canon loads: a Save control exists.
    await waitFor(() => expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument());
    // The placed fixture entity is reachable (entities tab list item or marker).
    expect(screen.getByText("Iron Tower")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and iterate.** `npx vitest run src/test/pages/AtlasPlacementEditor.smoke.test.tsx`. Editor mounts more children than the viewer; expect to extend the leaflet mock (any missing export throws a clear "X is not a function"). If `useEditorSession` IDB access errors, confirm `fake-indexeddb/auto` is the FIRST import. Keep assertions shallow — Save-flow correctness is already covered by `placement-save-integration.test.tsx`; this test's job is "the real page mounts without throwing."

- [ ] **Step 3: Commit.**
```bash
git add src/test/pages/AtlasPlacementEditor.smoke.test.tsx src/test/helpers/reactLeafletMock.tsx
git commit -m "test(editor): first page-level smoke test for AtlasPlacementEditor (teardown regression net)"
```

---

## Task 4: (Optional, high-value) migrate duplicated factories

- [ ] **Step 1:** In at least `src/test/accessibility-labels.test.tsx`, `src/test/atlas-credits-page.test.tsx`, and `src/test/atlas-browse-links.test.tsx`, replace the local `makeProject`/`makeEntity` copies with imports from `@/test/helpers/makeProject` (adjust field overrides to match each test's needs). Run each file after each edit.
- [ ] **Step 2: Commit** `test(helpers): dedupe makeProject across viewer/browse/credits tests`.

> Keep this optional and incremental — do not block Tasks 1-3 on it.

---

## Verification (whole plan)

Run the sharded suite (whole-suite `vitest run` OOMs — see `docs/CODEBASE_MAP.md` §8):
```bash
for n in 1 2 3 4; do npx vitest run --shard=$n/4 --poolOptions.forks.maxForks=3; done
npm run typecheck && npm run lint
```
All four shards green (re-run a lone shard if it exits on a `Timeout calling "onTaskUpdate"` RPC flake), typecheck + lint clean.

## Self-review checklist
- Both pages have a `*.smoke.test.tsx` that renders the REAL page component (not a hand-built harness). ✔ acceptance criterion.
- Any new jsdom shim lives in `setup.ts`, not per-test. 
- No assertion was weakened to force a pass; every failure was fixed at the mount.
