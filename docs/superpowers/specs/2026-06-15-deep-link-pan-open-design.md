# Spec — Shareable deep links (map + pan/zoom + open entity)

**Created:** 2026-06-15 · **Status:** blessed WANT (queue I3) · **Gate:** standard (pure
client-side change; no build-pipeline touch). **No secrecy risk** — the URL carries only entity
IDs, map IDs, and numeric view coordinates; DM content is never serialized.

> The existing `?entity=` share link works on GitHub Pages static hosting. This spec extends
> the same query-param approach. Path-style routes 404 on refresh on static hosts — that
> constraint is a hard invariant: **this spec stays query-param based throughout.**

## Problem

Sharing the atlas today copies a link like `?entity=corven`. That link opens the right entity
panel, but it has two gaps:

1. **View state is lost.** The map always boots to the default center and zoom — the recipient
   sees a different viewport to the one the sharer was looking at, and has to hunt for the pin.
2. **Back does not work.** Every entity open is a no-op to the browser history, so clicking
   Back navigates away from the atlas entirely instead of returning to the previous entity.

## Key finding (verified 2026-06-15)

All the view state the URL needs to capture lives in `AtlasViewer` already as React state:
`activeMapId` (string), `openId` (string | null), and the Leaflet map's center and zoom — which
can be read inside a `MapContainer` child via `useMap().getCenter()` / `useMap().getZoom()`.

The existing `MapController` component (`AtlasViewer.tsx` L49–58) is the established pattern
for a no-render child that talks to Leaflet inside the container. The same pattern used in
`AtlasMinimap.tsx` (L44 — `parent.on("move zoom moveend zoomend", update)`) gives the `moveend`
/ `zoomend` hook needed to read the settled viewport.

The existing `CopyLinkButton` in `EntityPanel.tsx` (L36–53) today writes only
`?entity=<id>`. It should instead read the current deep-link state and copy that richer URL.

## Goal

- **Browser Back works** through entity navigation (each `openEntity` call pushes a history
  entry; Back pops to the previous entity).
- **A shared link reopens the exact view** — correct map, same pan/zoom viewport, same open
  entity. The recipient sees the map land where the sharer was, not the default center.
- **URL auto-updates** as the player pans, zooms, switches maps, or opens entities —
  `replaceState` (no extra Back entries) for viewport drift; `pushState` (Back entry) for
  entity opens.
- **Zero breaking change** to today's `?entity=` links — the new parser must accept the old
  two-param form and treat missing center/zoom as "use defaults."

## Approach

### URL schema

Extend the existing query string with four new optional params — all query-param, no path
changes:

```
?map=<mapId>&entity=<entityId>&cx=<x>&cy=<y>&cz=<zoom>
```

- `map` — active map id (string)
- `entity` — open entity id (existing param; unchanged)
- `cx`, `cy` — map-space center coordinates (integers, stored in map pixels not lat/lng so they
  are map-height-independent and don't need conversion on parse)
- `cz` — zoom level (float, one decimal place is sufficient)

Omitting any param falls back gracefully: no `map` → default map; no `cx`/`cy`/`cz` → default
center/zoom; no `entity` → no open panel.

### Pure helpers (new file — pure, no DOM/React imports)

New file `src/atlas/deepLink.ts` exports two pure functions:

```ts
interface DeepLinkState {
  mapId: string | null;
  entityId: string | null;
  center: { x: number; y: number } | null;   // map-space pixels
  zoom: number | null;
}

function serializeDeepLink(state: DeepLinkState): string
// Returns a query string (without leading "?") with only the non-null fields.
// Rounds cx/cy to integers, cz to one decimal place.
// Preserves the entity= key name for backward compat.

function parseDeepLink(search: string): DeepLinkState
// Parses window.location.search (or any query string).
// Unknown / unparseable numeric params → null (safe fallback).
// Accepts the old ?entity=<id> form (returns center: null, zoom: null).
```

These are pure string→string / string→object functions with no side effects — fully unit-testable
without DOM or React.

### `ViewSyncController` (new child of `MapContainer`)

New component in `AtlasViewer.tsx`, added alongside `MapController` inside `<MapContainer>`:

```tsx
function ViewSyncController({
  mapId, openId,
  onViewChange,
}: {
  mapId: string;
  openId: string | null;
  onViewChange: (cx: number, cy: number, cz: number) => void;
}) { ... }
```

Uses `useMap()` to attach to `moveend` and `zoomend` events (same pattern as `AtlasMinimap`).
On each event it converts Leaflet's lat/lng center back to map-space pixels (`x = lng`,
`y = height - lat`) and calls `onViewChange`. Returning the map to JS state (not replacing
state directly) keeps the component pure and testable.

`ViewSyncController` does **not** know about the URL; it only lifts viewport readings up to
`AtlasViewer`.

### URL write side (in `AtlasViewer`)

`AtlasViewer` gains a `viewCenter` state piece (`{ x, y, zoom } | null`) fed by
`ViewSyncController`. A `useEffect` watches `[activeMapId, openId, viewCenter]` and calls
`window.history.replaceState` with the serialized query string — so panning and zooming update
the URL silently (no extra Back entries).

Entity opens — the existing `openEntity` callback — additionally call
`window.history.pushState` with the new entity + current viewport **before** `setOpenId`, so
Back navigates to the previous entity (or to the pre-entity URL if none was open). The
`popstate` listener on `window` reads the restored URL via `parseDeepLink` and calls
`setOpenId` / `setActiveMapId` accordingly — this is what makes Back work.

### URL read side (boot)

The existing boot `useEffect` (L147–170 in `AtlasViewer.tsx`) today does:

```ts
const params = new URLSearchParams(window.location.search);
const want = params.get("entity");
```

Replace with a call to `parseDeepLink(window.location.search)` and use its result to set
`openId`, `activeMapId`, and — new — pass an initial fly target derived from `center`/`zoom`
via `MapController` (which already accepts a `flyTo` prop).

### `CopyLinkButton` enriched

`EntityPanel.tsx`'s `CopyLinkButton` today writes a fixed `?entity=<id>` string. Pass it a
`currentUrl: () => string` callback prop from `AtlasViewer` (which knows the current
serialized state) so it copies the full deep link. Alternatively, reading
`window.location.href` directly is simpler and equally correct — the URL is already kept
current by the `replaceState` loop.

## Design decision — LOCKED

- **Query params only.** No `HashRouter`, no path segments. The existing `?entity=` link works
  on GitHub Pages with a `BrowserRouter`; this spec does not change the router mode.
- **`replaceState` for viewport drift; `pushState` for entity opens.** This keeps Back
  meaningful (one Back per entity opened) without polluting history with every pan pixel.
- **`popstate` listener, not a router hook.** React Router's `useNavigate` / `useSearchParams`
  would require promoting `AtlasViewer` into the router-aware tree more deeply; `window.history`
  + `window.addEventListener("popstate", ...)` is a self-contained pattern the existing codebase
  already uses for other low-level browser integration. Do not introduce `useSearchParams`.
- **Map-space pixels for center** (not Leaflet lat/lng). This avoids coupling the URL format to
  the `height - y` coordinate flip that Leaflet's flat CRS applies; stored values are
  map-document coordinates that `MapController` already knows how to handle.
- **No zoom-level clamp in the URL** — `MapContainer` already clamps zoom to `[minZoom, maxZoom]`
  on apply; just pass the parsed float through.

## Autonomy guard

Ship the core: pure helpers + `ViewSyncController` + `replaceState` URL sync + `pushState` /
`popstate` Back support + enriched `CopyLinkButton`. If the `popstate` listener proves
interaction-tricky (e.g. it fires during the initial `pushState` call), simplify: ship
`replaceState`-only (URL follows the player, shared link works) and hand back the Back support
as a follow-up. Do **not** experiment with alternative router architectures.

## Secrecy notes

None. Entity IDs, map IDs, and numeric coordinates carry zero DM content. The URL is written
by `replaceState` from data already visible on-screen to the player. No redaction change; no
build-pipeline change; the existing scan scripts are not affected.

## Files (verified against real codebase)

- `src/atlas/deepLink.ts` — **new** pure `serializeDeepLink` / `parseDeepLink` helpers.
- `src/pages/AtlasViewer.tsx` — add `ViewSyncController` child inside `<MapContainer>`;
  wire `viewCenter` state; boot reads via `parseDeepLink`; `openEntity` pushes history;
  `popstate` listener drives Back; pass current-URL getter to `CopyLinkButton`.
- `src/atlas/entity/EntityPanel.tsx` — `CopyLinkButton` reads full `window.location.href`
  (already up-to-date via `replaceState`) instead of constructing a fixed `?entity=` string.
- `src/test/deep-link.test.ts` — **new** pure unit tests: `serializeDeepLink` round-trips
  all four fields; `parseDeepLink` accepts old `?entity=` form; unparseable numerics fall back
  to null; serialized output omits null fields; `cx`/`cy` rounded to integers; `cz` to one
  decimal place. (~10–12 assertions, no DOM needed.)

## Done when

- Opening an entity pushes a history entry; Back returns to the previous entity (or to no-open
  state if it was the first).
- Panning or zooming updates `?cx=`, `?cy=`, `?cz=` in the URL bar without adding Back
  entries.
- Switching maps updates `?map=` in the URL bar.
- Copying the share link (via `CopyLinkButton`) includes all four params.
- Loading that link in a fresh tab opens the right map, flies to the right viewport, and opens
  the entity panel.
- Old `?entity=<id>`-only links still work (no map switch; default center/zoom).
- Pure helpers are unit-tested; all existing tests still green.
- Gate green (sharded vitest; tsc clean; eslint clean). No build-pipeline change. ~1–2 runs.
