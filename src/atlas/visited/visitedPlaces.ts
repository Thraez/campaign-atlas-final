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
