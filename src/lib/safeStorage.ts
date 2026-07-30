/**
 * Returns `window.localStorage` if it's actually usable, or `null` otherwise.
 *
 * Touches the storage with a probe write/remove to confirm it's writable —
 * private browsing sometimes exposes the API but throws on the first
 * `setItem`. Shared by the player-local stores (notes, visited places, sound
 * prefs, unlocked secrets) so each degrades to empty in-memory state the
 * same way instead of crashing.
 */
export function getStorage(): Storage | null {
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
