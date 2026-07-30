/** Returns true when the system reports prefers-reduced-motion: reduce. SSR-safe. */
export function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
