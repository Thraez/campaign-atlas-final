# Joyful Wayfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two player-site browsing upgrades — a hover-peek card (portrait + badge + name + summary + conditional map-jump button on links, Connections entries, and map pins) and a Wander button + whole-world discovery meter that flies the player to a random already-visible place they haven't opened — both over already-redacted player data, adding no new secrecy surface.

**Architecture:** Pure, unit-tested helpers do the thinking (wander selection, meter counts, peek positioning, link-id resolution, the visited-state store); thin integration layers in `AtlasViewer.tsx` wire them to the existing Leaflet map, the existing `openEntity` choke point, the existing deep-link/Back machinery, and a single portal-rendered `HoverPeekCard`. Discovered-state lives in localStorage mirroring `playerNotes.ts`. Wander reuses the existing `setFlyTarget` + `serializeDeepLink`/`pushState` so Back works.

**Tech Stack:** TypeScript, React, Vite, react-leaflet/Leaflet, Vitest, lucide-react icons (existing), localStorage.

**Spec:** `docs/superpowers/specs/2026-06-17-browsing-feel-design.md` — **read it in full first.**

**Test command convention:** run single files to avoid the whole-suite OOM — `npx vitest run <path>`. (Whole-suite shard fallback per env memory: `--shard=N/4 --poolOptions.forks.maxForks=3`.)

**Commit convention:** `feat(wayfinding): <what>` after each task's tests pass.

**Build-gate note:** Task 1 changes the sanitizer allow-list, which runs at BUILD time over `bodyHtml`, so the **final gate (Task 18)** must run `npm run atlas:publish` + `npm run atlas:publish:integrity-smoke`. Every other task is pure client-side (standard gate: tsc + eslint + targeted vitest).

**Build order:** Phase 0 (foundations) → Phases 1–2 (Wander — simpler, self-contained, ship first) → Phases 3–4 (hover-peek — the integration-heavy half) → Phase 5 (a11y + full gate). Wander (through Task 8) is independently shippable before any hover-peek work begins.

---

## Phase 0 — Foundations (shared, no UI)

### Task 1: Keep `data-entity-id` through the sanitizer (insurance)

**Files:**
- Modify: `src/atlas/sanitizeHtml.ts` (`ALLOWED_ATTR` L46–54)
- Test: `src/test/wayfinding/sanitize-entity-id.test.ts`

**Why:** the hover-peek and the existing click handler resolve a link's target from `data-entity-id`. DOMPurify keeps `data-*` by default, but listing it explicitly makes the contract intentional and future-proof (mirrors how the secrets work adds `data-secret-id`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/sanitize-entity-id.test.ts
import { it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

it("keeps data-entity-id on a wikilink anchor", () => {
  const out = sanitizeAtlasHtml('<a class="atlas-wikilink" data-entity-id="saltmere" href="#/entity/saltmere">Saltmere</a>');
  expect(out).toContain('data-entity-id="saltmere"');
  expect(out).toContain('href="#/entity/saltmere"');
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/test/wayfinding/sanitize-entity-id.test.ts`
Expected: it may already PASS (DOMPurify keeps `data-*` by default). If it passes, the explicit allow-list add in Step 3 is still made as documented insurance and the test stays as a regression guard. If it FAILS, Step 3 fixes it.

- [ ] **Step 3: Add the attribute to the allow-list.** In `src/atlas/sanitizeHtml.ts`, change the `data-*` line in `ALLOWED_ATTR` (L49) to include `data-entity-id`:

```typescript
  "class", "data-link", "data-id", "data-entity-id", "data-broken", "data-display", "data-callout",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/sanitize-entity-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sanitizeHtml.ts src/test/wayfinding/sanitize-entity-id.test.ts
git commit -m "feat(wayfinding): keep data-entity-id through the HTML sanitizer"
```

---

### Task 2: `aria-haspopup="dialog"` on rendered wikilink anchors

**Files:**
- Modify: `src/atlas/content/parseWikilinks.ts` (`renderLinkTokens` resolved-anchor branch, L57)
- Test: `src/test/wayfinding/wikilink-aria.test.ts`

**Why:** the peek card is a `role="dialog"` (it contains an interactive map button), so its triggers must announce `aria-haspopup="dialog"` to assistive tech (spec §6).

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/wikilink-aria.test.ts
import { it, expect } from "vitest";
import { renderLinkTokens } from "@/atlas/content/parseWikilinks";

it("resolved wikilink anchors advertise a dialog popup", () => {
  const links = [{ target: "Saltmere", display: "Saltmere", resolvedId: "saltmere", broken: false }];
  // token format mirrors tokenizeWikilinks output: TOKEN_OPEN + index + TOKEN_CLOSE
  const html = renderLinkTokens("⁣LINK[0]⁣", links);
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('class="atlas-wikilink"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/wikilink-aria.test.ts`
Expected: FAIL — no `aria-haspopup` in the anchor.

- [ ] **Step 3: Implement.** In `src/atlas/content/parseWikilinks.ts`, the resolved-link return (L57) becomes:

```typescript
    return `<a class="atlas-wikilink" data-entity-id="${escapeHtml(link.resolvedId)}" href="#/entity/${encodeURIComponent(link.resolvedId)}" aria-haspopup="dialog">${text}</a>`;
```

Then add `"aria-haspopup"` to `ALLOWED_ATTR` in `src/atlas/sanitizeHtml.ts` (so it survives the render-time pass) — append to the line edited in Task 1:

```typescript
  "class", "data-link", "data-id", "data-entity-id", "data-broken", "data-display", "data-callout", "aria-haspopup",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/wikilink-aria.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/parseWikilinks.ts src/atlas/sanitizeHtml.ts src/test/wayfinding/wikilink-aria.test.ts
git commit -m "feat(wayfinding): advertise aria-haspopup=dialog on wikilink anchors"
```

---

### Task 3: The visited-places store (localStorage)

**Files:**
- Create: `src/atlas/visited/visitedPlaces.ts`
- Test: `src/test/wayfinding/visitedPlaces.test.ts`

**Mirror:** `src/atlas/notes/playerNotes.ts` exactly — single key, `getStorage()` probe, every read/write in try/catch, JSON-shape validation, a `_resetForTests`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/visitedPlaces.test.ts
import { it, expect, beforeEach } from "vitest";
import { loadVisited, markVisited, isVisited, _resetVisitedForTests } from "@/atlas/visited/visitedPlaces";

beforeEach(() => _resetVisitedForTests());

it("starts empty, records visits, and persists them", () => {
  expect(loadVisited().size).toBe(0);
  expect(isVisited("saltmere")).toBe(false);
  markVisited("saltmere");
  expect(isVisited("saltmere")).toBe(true);
  expect(loadVisited().has("saltmere")).toBe(true);
});

it("ignores empty ids and de-duplicates", () => {
  markVisited("");
  markVisited("a");
  markVisited("a");
  expect(loadVisited().size).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/visitedPlaces.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (mirrors `playerNotes.ts` storage rules):

```typescript
// src/atlas/visited/visitedPlaces.ts
/**
 * Player-local "places I've opened" set — browser-only, never uploaded or shared.
 * Powers the Wander pool, the discovery meter, and filled-vs-hollow pins.
 * Mirrors notes/playerNotes.ts storage rules: a probe-guarded getStorage(), every
 * read/write in try/catch, so private browsing / full quota degrades to empty.
 */
const STORAGE_KEY = "atlas-visited-v1";

type VisitedMap = Record<string, { visitedAt: string }>;

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__atlas_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function loadMap(): VisitedMap {
  const s = getStorage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: VisitedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const at = (v as { visitedAt?: unknown }).visitedAt;
      out[k] = { visitedAt: typeof at === "string" ? at : "" };
    }
    return out;
  } catch {
    return {};
  }
}

/** The set of entity ids the player has opened. */
export function loadVisited(): Set<string> {
  return new Set(Object.keys(loadMap()));
}

export function isVisited(entityId: string): boolean {
  if (!entityId) return false;
  return Object.prototype.hasOwnProperty.call(loadMap(), entityId);
}

/** Record that an entity has been opened. No-ops on empty id or unavailable storage. */
export function markVisited(entityId: string): void {
  if (!entityId) return;
  const s = getStorage();
  if (!s) return;
  try {
    const map = loadMap();
    if (map[entityId]) return;
    map[entityId] = { visitedAt: new Date().toISOString() };
    s.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / serialization issue — drop silently; the viewer keeps working.
  }
}

export function _resetVisitedForTests(): void {
  const s = getStorage();
  if (!s) return;
  try { s.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/visitedPlaces.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/visited/visitedPlaces.ts src/test/wayfinding/visitedPlaces.test.ts
git commit -m "feat(wayfinding): visited-places localStorage store"
```

---

## Phase 1 — Wander core (pure logic)

### Task 4: `selectWanderTarget` — pick a random unopened place

**Files:**
- Create: `src/atlas/wander/selectWanderTarget.ts`
- Test: `src/test/wayfinding/selectWanderTarget.test.ts`

**Contract:** pool = placements de-duplicated by `entityId` (first placement wins), minus the visited set. Returns one `{ entityId, mapId, x, y }` chosen with the injected `rand`, or `null` when nothing is left. Built from `placements` so every result is flyable. Player `placements` are already fog/secret-excluded at build time (spec §5.4) — no runtime filtering.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/selectWanderTarget.test.ts
import { it, expect } from "vitest";
import { selectWanderTarget } from "@/atlas/wander/selectWanderTarget";
import type { MapPlacement } from "@/atlas/content/schema";

const P = (entityId: string, mapId = "m1", x = 0, y = 0): MapPlacement =>
  ({ id: `${entityId}@${mapId}`, entityId, mapId, x, y, visibility: "player" } as MapPlacement);

it("returns an unvisited placement, never a visited one", () => {
  const placements = [P("a"), P("b"), P("c")];
  const visited = new Set(["a", "b"]);
  const t = selectWanderTarget(placements, visited, () => 0);
  expect(t).toEqual({ entityId: "c", mapId: "m1", x: 0, y: 0 });
});

it("de-duplicates by entity (one entity pinned twice counts once)", () => {
  const placements = [P("a", "m1"), P("a", "m2")];
  const picked = selectWanderTarget(placements, new Set(), () => 0);
  expect(picked?.entityId).toBe("a");
});

it("returns null when every placed entity is visited", () => {
  expect(selectWanderTarget([P("a")], new Set(["a"]), () => 0)).toBeNull();
});

it("uses rand to index into the candidate list", () => {
  const placements = [P("a"), P("b"), P("c")];
  // rand ~1 -> last candidate (guard against rounding to length)
  expect(selectWanderTarget(placements, new Set(), () => 0.999)?.entityId).toBe("c");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/selectWanderTarget.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/atlas/wander/selectWanderTarget.ts
import type { MapPlacement } from "../content/schema";

export interface WanderTarget {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
}

/**
 * Pick a random place the player can already see (present in player data =
 * visible within fog) but has not opened yet. De-duplicates by entity so an
 * entity pinned on overlapping maps counts once. Returns null when nothing is
 * left to discover.
 */
export function selectWanderTarget(
  placements: MapPlacement[],
  visited: Set<string>,
  rand: () => number = Math.random,
): WanderTarget | null {
  const byEntity = new Map<string, MapPlacement>();
  for (const p of placements) {
    if (!byEntity.has(p.entityId)) byEntity.set(p.entityId, p);
  }
  const candidates: WanderTarget[] = [];
  for (const [entityId, p] of byEntity) {
    if (visited.has(entityId)) continue;
    candidates.push({ entityId, mapId: p.mapId, x: p.x, y: p.y });
  }
  if (candidates.length === 0) return null;
  const idx = Math.min(candidates.length - 1, Math.floor(rand() * candidates.length));
  return candidates[idx];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/selectWanderTarget.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/wander/selectWanderTarget.ts src/test/wayfinding/selectWanderTarget.test.ts
git commit -m "feat(wayfinding): selectWanderTarget pure helper"
```

---

### Task 5: `discoveryMeter` — X of Y counts

**Files:**
- Create: `src/atlas/wander/discoveryMeter.ts`
- Test: `src/test/wayfinding/discoveryMeter.test.ts`

**Contract:** `total` = distinct entity ids that have a placement (whole world; fog-excluded by build). `discovered` = those in the visited set (visited ∩ placement-entities; a visited person with no pin does not count).

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/discoveryMeter.test.ts
import { it, expect } from "vitest";
import { discoveryMeter } from "@/atlas/wander/discoveryMeter";
import type { MapPlacement } from "@/atlas/content/schema";

const P = (entityId: string, mapId = "m1"): MapPlacement =>
  ({ id: `${entityId}@${mapId}`, entityId, mapId, x: 0, y: 0, visibility: "player" } as MapPlacement);

it("counts distinct placed entities as the total, visited-among-them as discovered", () => {
  const placements = [P("a", "m1"), P("a", "m2"), P("b"), P("c")];
  // visited "a" (placed) and "z" (not placed -> ignored)
  expect(discoveryMeter(placements, new Set(["a", "z"]))).toEqual({ discovered: 1, total: 3 });
});

it("is 0 of 0 with no placements", () => {
  expect(discoveryMeter([], new Set(["a"]))).toEqual({ discovered: 0, total: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/discoveryMeter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/atlas/wander/discoveryMeter.ts
import type { MapPlacement } from "../content/schema";

export interface MeterCounts { discovered: number; total: number }

/** "X of Y places" — Y = distinct placed entities, X = those the player has opened. */
export function discoveryMeter(placements: MapPlacement[], visited: Set<string>): MeterCounts {
  const placed = new Set<string>();
  for (const p of placements) placed.add(p.entityId);
  let discovered = 0;
  for (const id of placed) if (visited.has(id)) discovered += 1;
  return { discovered, total: placed.size };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/discoveryMeter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/wander/discoveryMeter.ts src/test/wayfinding/discoveryMeter.test.ts
git commit -m "feat(wayfinding): discoveryMeter pure helper"
```

---

## Phase 2 — Wander integration (AtlasViewer)

### Task 6: `useVisitedPlaces` hook (reactive visited state)

**Files:**
- Create: `src/atlas/visited/useVisitedPlaces.ts`
- Test: `src/test/wayfinding/useVisitedPlaces.test.tsx`

**Why:** pins + meter read visited on every render, so it must be React state, not raw storage reads (spec §5.5). The hook initialises from the store once and exposes a `mark` that updates both storage and state.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/useVisitedPlaces.test.tsx
import { it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisitedPlaces } from "@/atlas/visited/useVisitedPlaces";
import { _resetVisitedForTests } from "@/atlas/visited/visitedPlaces";

beforeEach(() => _resetVisitedForTests());

it("exposes a reactive visited set and a mark() that grows it", () => {
  const { result } = renderHook(() => useVisitedPlaces());
  expect(result.current.visited.size).toBe(0);
  act(() => result.current.mark("saltmere"));
  expect(result.current.visited.has("saltmere")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/useVisitedPlaces.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/atlas/visited/useVisitedPlaces.ts
import { useCallback, useState } from "react";
import { loadVisited, markVisited } from "./visitedPlaces";

export interface VisitedApi {
  visited: Set<string>;
  mark: (entityId: string) => void;
}

/** Reactive wrapper over the visited-places store. Reads once on mount. */
export function useVisitedPlaces(): VisitedApi {
  const [visited, setVisited] = useState<Set<string>>(() => loadVisited());
  const mark = useCallback((entityId: string) => {
    if (!entityId) return;
    markVisited(entityId);
    setVisited((prev) => {
      if (prev.has(entityId)) return prev;
      const next = new Set(prev);
      next.add(entityId);
      return next;
    });
  }, []);
  return { visited, mark };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/useVisitedPlaces.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/visited/useVisitedPlaces.ts src/test/wayfinding/useVisitedPlaces.test.tsx
git commit -m "feat(wayfinding): useVisitedPlaces reactive hook"
```

---

### Task 7: Mark visited on open + fill discovered pins

**Files:**
- Modify: `src/pages/AtlasViewer.tsx` (mount the hook near the other state ~L269–273; add a `useEffect` watching `openId`; thread `visited` into the pin layer ~L761–791)
- Create: `src/atlas/wander/pinDiscoveryClass.ts`
- Test: `src/test/wayfinding/pinDiscoveryClass.test.ts`

**Why one effect:** `openId` is set by every path — `openEntity`, the deep-link boot (`AtlasViewer.tsx:235`), and `popstate` (`:204`). Marking inside the `openId` effect (not inside `openEntity`) catches all of them (spec §5.5).

- [ ] **Step 1: Write the failing test** (the pure pin-class helper)

```typescript
// src/test/wayfinding/pinDiscoveryClass.test.ts
import { it, expect } from "vitest";
import { pinDiscoveryClass } from "@/atlas/wander/pinDiscoveryClass";

it("marks discovered vs undiscovered pins", () => {
  const visited = new Set(["a"]);
  expect(pinDiscoveryClass("a", visited)).toBe("atlas-pin--discovered");
  expect(pinDiscoveryClass("b", visited)).toBe("atlas-pin--undiscovered");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/pinDiscoveryClass.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```typescript
// src/atlas/wander/pinDiscoveryClass.ts
/** Class suffix used to render a pin filled (discovered) or hollow (not yet). */
export function pinDiscoveryClass(entityId: string, visited: Set<string>): string {
  return visited.has(entityId) ? "atlas-pin--discovered" : "atlas-pin--undiscovered";
}
```

- [ ] **Step 4: Wire into `AtlasViewer.tsx`.**

(a) Mount the hook near `entityById` (~L273):

```typescript
  const { visited, mark: markVisitedEntity } = useVisitedPlaces();
```

with the import at the top:

```typescript
import { useVisitedPlaces } from "@/atlas/visited/useVisitedPlaces";
```

(b) Mark visited whenever an entity opens — add after the `openEntity` definition (~L300):

```typescript
  // "Discovered" = an entity panel opened by ANY means (click, search, wander,
  // deep-link, Back). openId is the single choke point, so mark here.
  useEffect(() => {
    if (openId) markVisitedEntity(openId);
  }, [openId, markVisitedEntity]);
```

(c) Pass `visited` to the pin layer. The placement-marker renderer is the `PlacementMarkers` component returning `<Marker>`s (~L761–791); add `visited` to its props and apply the class via the existing icon factory. Add to the marker (~L768), merging into the DivIcon className through `pinIconForStyle` — pass the discovery class as an extra option:

```typescript
            icon={pinIconForStyle(style, { dim, extraClass: pinDiscoveryClass(p.entityId, visited) })}
```

Update `pinIconForStyle` (find its definition) to append `opts.extraClass` to the DivIcon `className`. Import the helper in `AtlasViewer.tsx`:

```typescript
import { pinDiscoveryClass } from "@/atlas/wander/pinDiscoveryClass";
```

(d) Add the fill/hollow styling. In the atlas viewer stylesheet (the file that defines `.atlas-viewer-pin` — find it with a grep for that class), add:

```css
.atlas-pin--undiscovered { opacity: 0.55; }
.atlas-pin--discovered { opacity: 1; }
```

- [ ] **Step 5: Run the helper test + a build/dev smoke**

Run: `npx vitest run src/test/wayfinding/pinDiscoveryClass.test.ts`
Expected: PASS.
Run: `npm run dev`, open the player viewer, open one entity, confirm its pin becomes fully opaque while others stay dimmed. (Manual — Leaflet + jsdom can't assert this in a unit test.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/AtlasViewer.tsx src/atlas/wander/pinDiscoveryClass.ts src/test/wayfinding/pinDiscoveryClass.test.ts <pin-stylesheet>
git commit -m "feat(wayfinding): mark visited on open + fill discovered pins"
```

---

### Task 8: Wander button + discovery meter

**Files:**
- Create: `src/atlas/wander/WanderControl.tsx`
- Modify: `src/pages/AtlasViewer.tsx` (render `WanderControl` in the map overlay; add `wander()` callback with cross-map staged fly)
- Test: `src/test/wayfinding/WanderControl.test.tsx`

**Cross-map fly:** `openEntity` only flies within the active map (`AtlasViewer.tsx:294`). Wander may land on another map, so `wander()` switches the map first, then opens with `fly=false` and computes the fly target explicitly here (because `openEntity`'s internal fly looks up the placement on `activeMap`, which is stale this render).

- [ ] **Step 1: Write the failing test** (presentational: meter text + empty state)

```typescript
// src/test/wayfinding/WanderControl.test.tsx
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WanderControl } from "@/atlas/wander/WanderControl";

it("shows the meter and fires onWander when places remain", () => {
  const onWander = vi.fn();
  render(<WanderControl discovered={12} total={40} canWander onWander={onWander} />);
  expect(screen.getByText(/12 of 40 places/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /wander/i }));
  expect(onWander).toHaveBeenCalledTimes(1);
});

it("shows an all-found state when everything is discovered", () => {
  render(<WanderControl discovered={40} total={40} canWander={false} onWander={vi.fn()} />);
  expect(screen.getByText(/all 40 places found/i)).toBeTruthy();
});

it("renders nothing when there are no places", () => {
  const { container } = render(<WanderControl discovered={0} total={0} canWander={false} onWander={() => {}} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/WanderControl.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the control** (swap `lucide-react`'s `Dices` for whatever icon set the codebase already imports if different):

```tsx
// src/atlas/wander/WanderControl.tsx
import { Dices } from "lucide-react";

export interface WanderControlProps {
  discovered: number;
  total: number;
  /** false when everything placed is already discovered */
  canWander: boolean;
  onWander: () => void;
}

/** The map-corner Wander button + quiet discovery meter. Renders nothing with no places. */
export function WanderControl({ discovered, total, canWander, onWander }: WanderControlProps) {
  if (total === 0) return null;
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  return (
    <div className="atlas-wander absolute left-3 bottom-3 z-[500] flex flex-col gap-1.5">
      {canWander ? (
        <button
          type="button"
          onClick={onWander}
          aria-label="Wander to a place you haven't seen yet"
          className="flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent"
        >
          <Dices className="h-4 w-4" aria-hidden="true" /> Wander
        </button>
      ) : (
        <div className="rounded-lg border bg-background/95 px-3 py-2 text-sm text-muted-foreground">
          All {total} places found
        </div>
      )}
      <div className="flex items-center gap-2 px-0.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{discovered} of {total} places</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the control test to verify it passes**

Run: `npx vitest run src/test/wayfinding/WanderControl.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `AtlasViewer.tsx`.**

(a) Imports:

```typescript
import { WanderControl } from "@/atlas/wander/WanderControl";
import { selectWanderTarget } from "@/atlas/wander/selectWanderTarget";
import { discoveryMeter } from "@/atlas/wander/discoveryMeter";
```

(b) Derived meter + wander callback (near `openEntity`, ~L300). Use the FULL placement list (`data.project.placements`), not just the active map:

```typescript
  const meter = useMemo(
    () => (data ? discoveryMeter(data.project.placements, visited) : { discovered: 0, total: 0 }),
    [data, visited],
  );

  const [wanderEmpty, setWanderEmpty] = useState(false);
  const wander = useCallback(() => {
    if (!data) return;
    const target = selectWanderTarget(data.project.placements, visited);
    if (!target) { setWanderEmpty(true); return; }
    setWanderEmpty(false);
    if (target.mapId !== activeMapId) setActiveMapId(target.mapId);
    const targetMap = data.project.maps.find((m) => m.id === target.mapId);
    openEntity(target.entityId, false);
    if (targetMap) setFlyTarget({ x: target.x, y: target.y, height: targetMap.height });
  }, [data, visited, activeMapId, openEntity]);
```

(c) Render the control inside the map-container overlay (a sibling of the map, in the positioned wrapper the zoom controls live in). Find the `<MapContainer>` wrapper and add:

```tsx
        <WanderControl
          discovered={meter.discovered}
          total={meter.total}
          canWander={meter.discovered < meter.total}
          onWander={wander}
        />
```

(d) Empty-nearby note (auto-clears). Add near the control:

```tsx
        {wanderEmpty && (
          <div className="atlas-wander-note absolute left-3 bottom-20 z-[500] max-w-xs rounded-lg border bg-background/95 px-3 py-2 text-xs text-muted-foreground">
            You've explored everything you can reach — travel onward to uncover more.
          </div>
        )}
```

and clear it after a timeout:

```typescript
  useEffect(() => {
    if (!wanderEmpty) return;
    const t = window.setTimeout(() => setWanderEmpty(false), 4000);
    return () => window.clearTimeout(t);
  }, [wanderEmpty]);
```

- [ ] **Step 6: Dev smoke** — `npm run dev`, open the player viewer: the Wander button + meter show; clicking flies to an unopened place (switching maps when needed) and the meter ticks up; once all placed entities are opened, the button becomes "All N places found".

- [ ] **Step 7: Commit**

```bash
git add src/atlas/wander/WanderControl.tsx src/pages/AtlasViewer.tsx src/test/wayfinding/WanderControl.test.tsx
git commit -m "feat(wayfinding): Wander button + discovery meter with cross-map fly"
```

---

## Phase 3 — Hover-peek card (presentational + pure)

### Task 9: `resolvePeekEntityId` — id from a hovered link

**Files:**
- Create: `src/atlas/peek/resolvePeekEntityId.ts`
- Test: `src/test/wayfinding/resolvePeekEntityId.test.ts`

**Contract:** given a hovered element, climb to the nearest `a.atlas-wikilink` (or any `[data-entity-id]`), return `data-entity-id` if present, else parse the id from `href="#/entity/{encoded}"`, else `null`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/resolvePeekEntityId.test.ts
import { it, expect } from "vitest";
import { resolvePeekEntityId } from "@/atlas/peek/resolvePeekEntityId";

function anchor(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body.firstElementChild as HTMLElement;
}

it("reads data-entity-id when present", () => {
  expect(resolvePeekEntityId(anchor('<a class="atlas-wikilink" data-entity-id="saltmere" href="#/entity/saltmere">x</a>'))).toBe("saltmere");
});

it("falls back to decoding the href hash", () => {
  expect(resolvePeekEntityId(anchor('<a class="atlas-wikilink" href="#/entity/old%20keep">x</a>'))).toBe("old keep");
});

it("returns null for a non-link element", () => {
  expect(resolvePeekEntityId(anchor("<span>plain</span>"))).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/resolvePeekEntityId.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/atlas/peek/resolvePeekEntityId.ts
/** Resolve the target entity id from a hovered/focused link element, or null. */
export function resolvePeekEntityId(el: HTMLElement | null): string | null {
  const link = el?.closest<HTMLElement>("a.atlas-wikilink, [data-entity-id]");
  if (!link) return null;
  const direct = link.getAttribute("data-entity-id");
  if (direct) return direct;
  const href = link.getAttribute("href") ?? "";
  const m = href.match(/#\/entity\/(.+)$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/resolvePeekEntityId.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/peek/resolvePeekEntityId.ts src/test/wayfinding/resolvePeekEntityId.test.ts
git commit -m "feat(wayfinding): resolvePeekEntityId helper"
```

---

### Task 10: `computePeekPosition` — flip above/below + clamp

**Files:**
- Create: `src/atlas/peek/computePeekPosition.ts`
- Test: `src/test/wayfinding/computePeekPosition.test.ts`

**Contract:** given the trigger rect, the viewport size, the card size, and a gap, return `{ left, top, placement }` as fixed-position coordinates. Prefer below; flip above when there isn't room below. Clamp `left` into the viewport with an 8px margin.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/computePeekPosition.test.ts
import { it, expect } from "vitest";
import { computePeekPosition } from "@/atlas/peek/computePeekPosition";

const vp = { width: 1000, height: 800 };
const card = { width: 240, height: 120 };

it("places below when there's room", () => {
  const r = { top: 100, bottom: 120, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.placement).toBe("below");
  expect(pos.top).toBe(128); // bottom + gap
});

it("flips above when the trigger is near the bottom", () => {
  const r = { top: 760, bottom: 780, left: 400, right: 460, width: 60, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.placement).toBe("above");
  expect(pos.top).toBe(760 - 8 - 120); // top - gap - cardHeight
});

it("clamps left into the viewport", () => {
  const r = { top: 100, bottom: 120, left: 980, right: 995, width: 15, height: 20 };
  const pos = computePeekPosition(r, vp, card, 8);
  expect(pos.left).toBe(1000 - 240 - 8); // right edge minus card minus margin
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/computePeekPosition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/atlas/peek/computePeekPosition.ts
export interface AnchorRect { top: number; bottom: number; left: number; right: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface PeekPosition { left: number; top: number; placement: "above" | "below" }

/** Fixed-position coordinates for the peek card; flips above/below, clamps horizontally. */
export function computePeekPosition(anchor: AnchorRect, viewport: Size, card: Size, gap = 8): PeekPosition {
  const roomBelow = viewport.height - anchor.bottom;
  const below = roomBelow >= card.height + gap;
  const top = below ? anchor.bottom + gap : anchor.top - gap - card.height;
  const rawLeft = anchor.left;
  const left = Math.max(gap, Math.min(rawLeft, viewport.width - card.width - gap));
  return { left, top, placement: below ? "below" : "above" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/computePeekPosition.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/peek/computePeekPosition.ts src/test/wayfinding/computePeekPosition.test.ts
git commit -m "feat(wayfinding): computePeekPosition helper"
```

---

### Task 11: `HoverPeekCard` — the card itself (with fallbacks + a11y)

**Files:**
- Create: `src/atlas/peek/HoverPeekCard.tsx`
- Test: `src/test/wayfinding/HoverPeekCard.test.tsx`

**Contract:** presentational. Props: `entity`, `hasPlacement`, `onOpen`, `onFlyToMap`, plus mouse-enter/leave passthrough for the hover bridge. Renders portrait only when `entity.images[0]` exists; summary row only when `entity.summary` exists; the map button only when `hasPlacement`. `role="dialog"`, `aria-label="{title} preview"`. Uses `normalizeAtlasAssetUrl` for the image.

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/wayfinding/HoverPeekCard.test.tsx
import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HoverPeekCard } from "@/atlas/peek/HoverPeekCard";
import type { Entity } from "@/atlas/content/schema";

const base: Entity = {
  id: "saltmere", title: "Saltmere", type: "settlement", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {},
  sourcePath: "", links: [], backlinks: [],
} as Entity;

it("renders a dialog with title + type badge", () => {
  render(<HoverPeekCard entity={base} hasPlacement={false} onOpen={() => {}} onFlyToMap={() => {}} />);
  expect(screen.getByRole("dialog", { name: /saltmere preview/i })).toBeTruthy();
  expect(screen.getByText("settlement")).toBeTruthy();
});

it("omits the portrait when there is no image", () => {
  render(<HoverPeekCard entity={base} hasPlacement={false} onOpen={() => {}} onFlyToMap={() => {}} />);
  expect(screen.queryByRole("img")).toBeNull();
});

it("shows the map button only when a placement exists and fires onFlyToMap", () => {
  const onFly = vi.fn();
  const { rerender } = render(<HoverPeekCard entity={base} hasPlacement={false} onOpen={() => {}} onFlyToMap={onFly} />);
  expect(screen.queryByRole("button", { name: /show saltmere on the map/i })).toBeNull();
  rerender(<HoverPeekCard entity={{ ...base, images: ["portrait.png"], summary: "A salt harbor." }} hasPlacement onOpen={() => {}} onFlyToMap={onFly} />);
  expect(screen.getByRole("img")).toBeTruthy();
  expect(screen.getByText("A salt harbor.")).toBeTruthy();
  screen.getByRole("button", { name: /show saltmere on the map/i }).click();
  expect(onFly).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/HoverPeekCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/atlas/peek/HoverPeekCard.tsx
import { MapPin } from "lucide-react";
import type { Entity } from "../content/schema";
import { normalizeAtlasAssetUrl } from "../url";

export interface HoverPeekCardProps {
  entity: Entity;
  hasPlacement: boolean;
  onOpen: () => void;
  onFlyToMap: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/** The small floating preview card. Portrait/summary degrade gracefully when absent. */
export function HoverPeekCard({ entity, hasPlacement, onOpen, onFlyToMap, onMouseEnter, onMouseLeave }: HoverPeekCardProps) {
  const img = entity.images.length > 0 && entity.images[0] ? normalizeAtlasAssetUrl(entity.images[0]) : null;
  return (
    <div
      role="dialog"
      aria-label={`${entity.title} preview`}
      aria-modal="false"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="atlas-peek-card w-60 rounded-lg border bg-background p-3 shadow-md"
    >
      <div className="flex items-start gap-2.5">
        {img && <img src={img} alt="" className="flex-none rounded-md object-cover" style={{ height: 52, width: 52 }} />}
        <div className="min-w-0 flex-1">
          <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{entity.type}</span>
          <button type="button" onClick={onOpen} className="block text-left text-sm font-medium hover:underline">{entity.title}</button>
        </div>
        {hasPlacement && (
          <button
            type="button"
            onClick={onFlyToMap}
            aria-label={`Show ${entity.title} on the map`}
            className="flex-none rounded-md border p-1.5 text-primary hover:bg-accent"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {entity.summary && <p className="mt-2 text-xs leading-snug text-muted-foreground">{entity.summary}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/wayfinding/HoverPeekCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/peek/HoverPeekCard.tsx src/test/wayfinding/HoverPeekCard.test.tsx
git commit -m "feat(wayfinding): HoverPeekCard component with graceful fallbacks"
```

---

## Phase 4 — Hover-peek integration

### Task 12: `usePeekController` + portal mount + prose hover

**Files:**
- Create: `src/atlas/peek/usePeekController.ts`
- Modify: `src/pages/AtlasViewer.tsx` (peek state + portal card; prose hover delegation on `panelRef` alongside the existing click handler ~L302–316)
- Test: `src/test/wayfinding/usePeekController.test.tsx`

**Controller responsibilities (the interaction contract, spec §A3):** 200ms open delay; 80ms close grace cancellable by entering the card; immediate transfer when a card is already open and a new trigger is entered; 400ms cooling after a dismiss; `(pointer: fine)` gate. The controller is a hook returning `{ peek, onTriggerEnter(id, rect), onTriggerLeave(), onCardEnter(), onCardLeave(), dismiss(), show() }` where `peek` is `{ entityId, position } | null`.

- [ ] **Step 1: Write the failing test** (fake timers drive the delay + bridge)

```typescript
// src/test/wayfinding/usePeekController.test.tsx
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeekController } from "@/atlas/peek/usePeekController";

const rect = { top: 100, bottom: 120, left: 400, right: 460, width: 60, height: 20 } as DOMRect;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("opens after the delay and closes after the grace period", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => result.current.onTriggerEnter("saltmere", rect));
  expect(result.current.peek).toBeNull();
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.peek?.entityId).toBe("saltmere");
  act(() => result.current.onTriggerLeave());
  act(() => vi.advanceTimersByTime(80));
  expect(result.current.peek).toBeNull();
});

it("keeps the card open when the pointer moves onto it (bridge)", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => { result.current.onTriggerEnter("a", rect); vi.advanceTimersByTime(200); });
  act(() => { result.current.onTriggerLeave(); result.current.onCardEnter(); vi.advanceTimersByTime(80); });
  expect(result.current.peek?.entityId).toBe("a");
});

it("does nothing on coarse pointers", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: false }));
  act(() => { result.current.onTriggerEnter("a", rect); vi.advanceTimersByTime(500); });
  expect(result.current.peek).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/wayfinding/usePeekController.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (uses `computePeekPosition`; card size is a fixed estimate):

```typescript
// src/atlas/peek/usePeekController.ts
import { useCallback, useRef, useState } from "react";
import { computePeekPosition, type PeekPosition } from "./computePeekPosition";

const OPEN_DELAY = 200;
const CLOSE_GRACE = 80;
const COOLING = 400;
const CARD = { width: 240, height: 130 };

export interface PeekState { entityId: string; position: PeekPosition }

export function usePeekController({ pointerFine }: { pointerFine: boolean }) {
  const [peek, setPeek] = useState<PeekState | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const coolingUntil = useRef(0);

  const clearOpen = () => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } };
  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const show = useCallback((entityId: string, rect: DOMRect) => {
    const position = computePeekPosition(rect, { width: window.innerWidth, height: window.innerHeight }, CARD);
    setPeek({ entityId, position });
  }, []);

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = window.setTimeout(() => { setPeek(null); coolingUntil.current = Date.now() + COOLING; }, CLOSE_GRACE);
  }, []);

  const onTriggerEnter = useCallback((entityId: string, rect: DOMRect) => {
    if (!pointerFine) return;
    if (Date.now() < coolingUntil.current) return;
    clearClose();
    if (peek) { show(entityId, rect); return; } // transfer: no delay
    clearOpen();
    openTimer.current = window.setTimeout(() => show(entityId, rect), OPEN_DELAY);
  }, [pointerFine, peek, show]);

  const onTriggerLeave = useCallback(() => { clearOpen(); scheduleClose(); }, [scheduleClose]);
  const onCardEnter = useCallback(() => clearClose(), []);
  const onCardLeave = useCallback(() => scheduleClose(), [scheduleClose]);
  const dismiss = useCallback(() => { clearOpen(); clearClose(); setPeek(null); coolingUntil.current = Date.now() + COOLING; }, []);

  return { peek, onTriggerEnter, onTriggerLeave, onCardEnter, onCardLeave, dismiss, show };
}
```

(`Date.now()` runs at real runtime; under test `vi.useFakeTimers()` also fakes `Date.now`, so cooling is deterministic.)

- [ ] **Step 4: Wire into `AtlasViewer.tsx`.**

(a) Imports + pointer capability + controller (inside the component):

```typescript
import { createPortal } from "react-dom";
import { HoverPeekCard } from "@/atlas/peek/HoverPeekCard";
import { usePeekController } from "@/atlas/peek/usePeekController";
import { resolvePeekEntityId } from "@/atlas/peek/resolvePeekEntityId";
```

```typescript
  const pointerFine = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
  const peekCtl = usePeekController({ pointerFine });
```

(b) Prose hover delegation — extend the existing wikilink `useEffect` (`AtlasViewer.tsx:303–316`) to also attach `mouseover`/`mouseout` on the same `el`:

```typescript
    const over = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("a.atlas-wikilink");
      if (!a) return;
      const id = resolvePeekEntityId(a);
      if (id) peekCtl.onTriggerEnter(id, a.getBoundingClientRect());
    };
    const out = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a.atlas-wikilink")) peekCtl.onTriggerLeave();
    };
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseout", out);
```

(remember to `removeEventListener` both in the effect cleanup, and add `peekCtl` to the dep array).

(c) Portal card — near the end of the returned JSX:

```tsx
      {peekCtl.peek && data && entityById.get(peekCtl.peek.entityId) &&
        createPortal(
          <div style={{ position: "fixed", left: peekCtl.peek.position.left, top: peekCtl.peek.position.top, zIndex: 1000 }}>
            <HoverPeekCard
              entity={entityById.get(peekCtl.peek.entityId)!}
              hasPlacement={data.project.placements.some((p) => p.entityId === peekCtl.peek!.entityId)}
              onOpen={() => { const id = peekCtl.peek!.entityId; peekCtl.dismiss(); openEntity(id); }}
              onFlyToMap={() => {
                const id = peekCtl.peek!.entityId; peekCtl.dismiss();
                const pl = data.project.placements.find((p) => p.entityId === id);
                if (pl) {
                  if (pl.mapId !== activeMapId) setActiveMapId(pl.mapId);
                  const m = data.project.maps.find((mm) => mm.id === pl.mapId);
                  openEntity(id, false);
                  if (m) setFlyTarget({ x: pl.x, y: pl.y, height: m.height });
                }
              }}
              onMouseEnter={peekCtl.onCardEnter}
              onMouseLeave={peekCtl.onCardLeave}
            />
          </div>,
          document.body,
        )}
```

(Portaling straight to `document.body` escapes the `ScrollArea`'s `overflow:hidden` — no separate overlay root needed.)

- [ ] **Step 5: Run the controller test + dev smoke**

Run: `npx vitest run src/test/wayfinding/usePeekController.test.tsx`
Expected: PASS (3 tests).
Dev smoke: hover a wikilink in an entry → card appears after a beat, flips to stay on-screen, lets you move onto it and click the map button.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/peek/usePeekController.ts src/pages/AtlasViewer.tsx src/test/wayfinding/usePeekController.test.tsx
git commit -m "feat(wayfinding): peek controller + portal card + prose hover"
```

---

### Task 13: Movement-cancel guard on the open delay

**Files:**
- Modify: `src/atlas/peek/usePeekController.ts` (track pointer start; cancel pending open if moved >5px)
- Modify: `src/pages/AtlasViewer.tsx` (feed `mousemove` to the controller while pending)
- Test: extend `src/test/wayfinding/usePeekController.test.tsx`

- [ ] **Step 1: Add the failing test**

```typescript
it("cancels a pending open if the pointer moves more than 5px", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => result.current.onTriggerEnter("a", rect, { x: 100, y: 100 }));
  act(() => result.current.onPointerMove({ x: 120, y: 100 }));
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.peek).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/wayfinding/usePeekController.test.tsx`
Expected: FAIL — `onPointerMove` undefined / third arg unused.

- [ ] **Step 3: Implement.** Add an optional start-point third param to `onTriggerEnter`, store it in a ref right before scheduling `openTimer`, and add `onPointerMove`:

```typescript
  const startPt = useRef<{ x: number; y: number } | null>(null);
  // onTriggerEnter(entityId, rect, start?: { x: number; y: number }):
  //   set `startPt.current = start ?? null;` just before scheduling the open timer.
  const onPointerMove = useCallback((pt: { x: number; y: number }) => {
    if (!openTimer.current || !startPt.current) return;
    if (Math.hypot(pt.x - startPt.current.x, pt.y - startPt.current.y) > 5) clearOpen();
  }, []);
  // add onPointerMove to the returned object
```

Then in `AtlasViewer.tsx`, pass `{ x: e.clientX, y: e.clientY }` as the third arg from the `over` handler, and add a `mousemove` listener on `el` calling `peekCtl.onPointerMove({ x: e.clientX, y: e.clientY })` (remove it in cleanup).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/wayfinding/usePeekController.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/peek/usePeekController.ts src/pages/AtlasViewer.tsx src/test/wayfinding/usePeekController.test.tsx
git commit -m "feat(wayfinding): cancel peek open on pointer movement"
```

---

### Task 14: Peek the Connections + "Mentioned in" lists

**Files:**
- Modify: `src/atlas/entity/EntityPanel.tsx` (backlinks buttons L340–348; relationships buttons L363–368; new optional `onPeek`/`onPeekLeave` props)
- Modify: `src/pages/AtlasViewer.tsx` (pass `onPeek`/`onPeekLeave` to `EntityPanel`)
- Test: `src/test/wayfinding/connections-peek.test.tsx`

**Why props, not delegation:** these are React `<button>`s outside `panelRef`'s prose div, so the prose delegation can't see them. Attach `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` directly.

- [ ] **Step 1: Write the failing test** (mirror the entity fixture in `src/test/entity/EntityPanel.test.tsx`)

```tsx
// src/test/wayfinding/connections-peek.test.tsx
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { Entity } from "@/atlas/content/schema";

const entity: Entity = {
  id: "corven", title: "Corven", type: "settlement", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {},
  sourcePath: "", links: [], backlinks: [{ id: "edric", title: "Edric" }],
} as Entity;

it("calls onPeek when a Mentioned-in chip is hovered", () => {
  const onPeek = vi.fn();
  render(
    <EntityPanel
      entity={entity}
      placements={[]}
      entityById={new Map([["edric", { ...entity, id: "edric", title: "Edric" }]])}
      onOpenEntity={() => {}}
      onShowOnMap={() => {}}
      onClose={() => {}}
      onPeek={onPeek}
      onPeekLeave={() => {}}
    />
  );
  fireEvent.mouseEnter(screen.getByText("Edric"));
  expect(onPeek).toHaveBeenCalledWith("edric", expect.anything());
});
```

(Adjust the prop list to match the real `EntityPanelProps` — copy the exact required props from `src/test/entity/EntityPanel.test.tsx`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/wayfinding/connections-peek.test.tsx`
Expected: FAIL — `onPeek` not a prop / not called.

- [ ] **Step 3: Implement.** Add to `EntityPanelProps`:

```typescript
  onPeek?: (entityId: string, rect: DOMRect) => void;
  onPeekLeave?: () => void;
```

On the backlinks button (L341–347) add the handlers (and the same on the relationships button L363–368, using `r.entity` instead of `b.id`):

```tsx
                    onMouseEnter={(e) => onPeek?.(b.id, e.currentTarget.getBoundingClientRect())}
                    onMouseLeave={() => onPeekLeave?.()}
                    onFocus={(e) => onPeek?.(b.id, e.currentTarget.getBoundingClientRect())}
                    onBlur={() => onPeekLeave?.()}
```

In `AtlasViewer.tsx`, pass to `<EntityPanel … onPeek={(id, rect) => peekCtl.onTriggerEnter(id, rect)} onPeekLeave={peekCtl.onTriggerLeave} />`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/wayfinding/connections-peek.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/entity/EntityPanel.tsx src/pages/AtlasViewer.tsx src/test/wayfinding/connections-peek.test.tsx
git commit -m "feat(wayfinding): peek the Connections and Mentioned-in lists"
```

---

### Task 15: Peek map pins; remove the redundant Popup

**Files:**
- Modify: `src/pages/AtlasViewer.tsx` (`PlacementMarkers` ~L768–789: add `mouseover`/`mouseout`; delete the `<Popup>` L785–788; thread two handlers from `AtlasViewer`)
- Test: none new (Leaflet/jsdom integration) — dev smoke + existing marker tests stay green

**Desktop only:** pins use hover-peek on `(pointer: fine)`. On touch, the existing `click → onOpenEntity` is unchanged (spec §A3).

- [ ] **Step 1: Add hover handlers + remove Popup.** Change the `<Marker>` `eventHandlers` (L772) to:

```tsx
            eventHandlers={{
              click: () => onOpenEntity(p.entityId, false),
              mouseover: (e) => onPinPeek?.(p.entityId, e.originalEvent as MouseEvent),
              mouseout: () => onPinPeekLeave?.(),
            }}
```

Delete the `<Popup>…</Popup>` block (L785–788). Add `onPinPeek?: (id: string, ev: MouseEvent) => void` and `onPinPeekLeave?: () => void` to `PlacementMarkers`' props and thread them from `AtlasViewer`.

In `AtlasViewer`, synthesize a 1px anchor at the cursor:

```typescript
  const onPinPeek = useCallback((id: string, ev: MouseEvent) => {
    const r = { top: ev.clientY, bottom: ev.clientY + 1, left: ev.clientX, right: ev.clientX + 1, width: 1, height: 1 } as DOMRect;
    peekCtl.onTriggerEnter(id, r);
  }, [peekCtl]);
```

(`onPinPeekLeave` = `peekCtl.onTriggerLeave`.)

- [ ] **Step 2: Run existing marker/viewer tests + dev smoke**

Run: `npx vitest run src/test/` for any existing AtlasViewer/marker test files (grep first for `Popup`/`PlacementMarkers` in tests).
Expected: green (if a test asserts the Popup, update it for the removal).
Dev smoke: hover a pin → the unified card appears; tooltip label still shows; no double bubble.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AtlasViewer.tsx
git commit -m "feat(wayfinding): peek map pins on hover; drop redundant Leaflet popup"
```

---

### Task 16: Mobile tap-to-peek for links + Connections

**Files:**
- Modify: `src/atlas/peek/usePeekController.ts` (add `tapPeek(entityId, rect)` returning the id to open on the second tap)
- Modify: `src/pages/AtlasViewer.tsx` (prose click handler: tap model on coarse pointers; gate today's immediate navigation)
- Test: extend `src/test/wayfinding/usePeekController.test.tsx`

**Model (spec §A3):** on `(pointer: coarse)`, first tap peeks; a second tap on the same id opens; the card's name/map-button navigate; a tap elsewhere dismisses. The existing prose click handler (`AtlasViewer.tsx:306–313`) must NOT navigate on that first tap.

- [ ] **Step 1: Add the failing test**

```typescript
it("tapPeek shows immediately and a second tap on the same id signals open", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: false }));
  let opened = "";
  act(() => { opened = result.current.tapPeek("a", rect); });
  expect(result.current.peek?.entityId).toBe("a");
  expect(opened).toBe("");           // first tap: peek only
  act(() => { opened = result.current.tapPeek("a", rect); });
  expect(opened).toBe("a");           // second tap on same id: navigate
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/wayfinding/usePeekController.test.tsx`
Expected: FAIL — `tapPeek` undefined.

- [ ] **Step 3: Implement `tapPeek`** in the controller:

```typescript
  const tapPeek = useCallback((entityId: string, rect: DOMRect): string => {
    if (peek?.entityId === entityId) { setPeek(null); return entityId; }
    show(entityId, rect);
    return "";
  }, [peek, show]);
  // add tapPeek to the returned object
```

In `AtlasViewer.tsx`, branch the prose click handler on pointer type: when coarse, `e.preventDefault(); const id = resolvePeekEntityId(target); if (id) { const open = peekCtl.tapPeek(id, target.getBoundingClientRect()); if (open) openEntity(open); }` — when fine, keep today's immediate `openEntity`. Add a `document` `pointerdown` listener (deferred one `requestAnimationFrame`) that calls `peekCtl.dismiss()` when the tap is outside both the card and any link.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/wayfinding/usePeekController.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/peek/usePeekController.ts src/pages/AtlasViewer.tsx src/test/wayfinding/usePeekController.test.tsx
git commit -m "feat(wayfinding): mobile tap-to-peek for links and connections"
```

---

## Phase 5 — Accessibility close-out + full gate

### Task 17: Escape ordering + keyboard dismiss

**Files:**
- Modify: `src/pages/AtlasViewer.tsx` (the Escape branch in the Cmd-K effect L324–326)
- Test: `src/test/wayfinding/peek-escape.test.tsx`

**Why:** Escape must close an open peek **before** it closes the search palette (spec §6).

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/wayfinding/peek-escape.test.tsx
import { it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeekController } from "@/atlas/peek/usePeekController";

it("dismiss clears an open peek", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => result.current.show("a", { top: 10, bottom: 20, left: 10, right: 40, width: 30, height: 10 } as DOMRect));
  expect(result.current.peek).not.toBeNull();
  act(() => result.current.dismiss());
  expect(result.current.peek).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails or passes**

Run: `npx vitest run src/test/wayfinding/peek-escape.test.tsx`
Expected: PASS if `show`/`dismiss` are exported from Task 12 (this test guards the contract). If `show` isn't exported, export it.

- [ ] **Step 3: Implement Escape ordering.** In the `onKey` handler (`AtlasViewer.tsx:324`):

```typescript
      } else if (e.key === "Escape") {
        if (peekCtl.peek) { peekCtl.dismiss(); return; }
        setSearchOpen(false);
      }
```

Add `peekCtl` to that effect's dependency array.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/wayfinding/peek-escape.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AtlasViewer.tsx src/test/wayfinding/peek-escape.test.tsx
git commit -m "feat(wayfinding): Escape closes the peek before the search palette"
```

---

### Task 18: Full gate — types, lint, sharded tests, build + scans

**Files:** none (verification only)

**Why a publish gate:** Task 1/2 changed the sanitizer allow-list, which runs at build time over `bodyHtml`, so the player artifacts change shape — run the secrecy scans.

- [ ] **Step 1: Types + lint**

Run: `npx tsc --noEmit` → Expected: clean.
Run: `npm run lint` → Expected: 0 errors (16 pre-existing warnings acceptable).

- [ ] **Step 2: All new tests, then the sharded suite**

Run: `npx vitest run src/test/wayfinding/` → Expected: all green.
Run: `npx vitest run --shard=1/4 --poolOptions.forks.maxForks=3` … through `--shard=4/4` → Expected: green (re-run a shard once if it OOM-flakes, per env memory).

- [ ] **Step 3: Player build + secrecy scans**

Run: `npm run build` → Expected: succeeds; no editor modules in the player bundle.
Run: `npm run atlas:publish` → Expected: exit 0; all scans clean (the `data-entity-id`/`aria-haspopup` allow-list additions carry no DM content).
Run: `npm run atlas:publish:integrity-smoke` → Expected: all planted faults still caught.

- [ ] **Step 4: Secrecy re-confirm (record in the commit body)**

Confirm: the wander pool + meter come from `data.project.placements`; the peek card reads `entityById` (= `data.project.entities`) and `entity.images[0]`/`entity.summary` — all from the player `atlas.json`, which excludes DM-only entities/placements at build (`build-atlas.ts:347,409,654,664`). No new fetch, no new field. The visited set is localStorage-only, never serialized into any artifact or URL.

- [ ] **Step 5: Commit (gate record)**

```bash
git commit --allow-empty -m "chore(wayfinding): full gate green — tsc/eslint/sharded vitest/atlas:publish/integrity-smoke"
```

---

## Self-review (run before handing off)

**Spec coverage** — every spec section maps to a task: A1 card/fallbacks → T11; A2 surfaces → T12 (prose), T14 (connections), T15 (pins); A3 interaction desktop/mobile/keyboard → T12, T13, T16, T17; A4 portal/position → T10, T12; A5 sanitizer/mount/connections/pins/placements/image-guard → T1, T9, T12, T14, T15, T11; B1–B7 wander/meter/cross-map/discovered/filled-pins/edges → T4, T5, T7, T8; B8 → T7, T8; §5.1 store → T3; §5.5 reactive visited + openId hook → T6, T7; §6 a11y → T2, T11, T16, T17; testing → every task + T18.

**Placeholder scan** — the only "fill in the local detail" spots are Task 14's prop list (mirror `src/test/entity/EntityPanel.test.tsx`), the pin stylesheet path (grep `.atlas-viewer-pin`), and `pinIconForStyle`'s `extraClass` option (find its definition). No `TBD`/`TODO`.

**Type consistency** — `WanderTarget`, `MeterCounts`, `PeekState`, `PeekPosition`, `VisitedApi`, `MeterCounts` are defined once and reused; `selectWanderTarget`/`discoveryMeter`/`computePeekPosition`/`usePeekController` signatures match their call sites in Tasks 7, 8, 12, 14, 15.
