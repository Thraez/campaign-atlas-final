/**
 * Write the viewer's query string to the address bar without going through
 * react-router (a router navigation on every pan would re-render the route
 * tree), while keeping the router's own history bookkeeping intact.
 *
 * react-router's BrowserRouter stores `{ usr, key, idx }` in `history.state`
 * and reads `idx` back on every push and Back/Forward. A raw
 * `pushState(null, …)` or `replaceState(null, …)` wipes it: later router
 * pushes count from a lost index, and those entries get the "default" key.
 */

type RouterState = { usr?: unknown; key?: string; idx?: number } | null;

function currentState(): RouterState {
  const s = window.history.state as unknown;
  return s && typeof s === "object" ? (s as RouterState) : null;
}

function urlFor(search: string): string {
  return search ? `?${search}` : window.location.pathname;
}

/** Same entry, new query (pan, zoom, map switch). Keeps the router's state. */
export function replaceViewerSearch(search: string): void {
  window.history.replaceState(currentState(), "", urlFor(search));
}

/** New Back entry with the next router index and a fresh key. */
export function pushViewerSearch(search: string): void {
  const prev = currentState();
  const idx = typeof prev?.idx === "number" ? prev.idx + 1 : undefined;
  const next = {
    usr: null,
    key: Math.random().toString(36).substring(2, 10),
    ...(idx !== undefined ? { idx } : {}),
  };
  window.history.pushState(next, "", urlFor(search));
}
