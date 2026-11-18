/**
 * Whether an AtlasLoader has been on screen this page load, so the route
 * fallback handing over to a page's loader doesn't fade in twice (P-08).
 */
let shown = false;

export function loaderShownThisLoad(): boolean {
  return shown;
}

export function markLoaderShown(): void {
  shown = true;
}

/** @internal Tests only. */
export function _resetLoaderForTests(): void {
  shown = false;
}
