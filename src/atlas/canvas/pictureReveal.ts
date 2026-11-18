/**
 * How a map picture comes in on the shared canvas (P-07).
 *
 * A picture starts hidden (`is-pending`) over its chart paper, a sheet drawn
 * in SVG and CSS (`ChartPaper` in CanvasLayers). When it has loaded (and, for
 * an `<img>`, decoded) it shows: a fade of `PICTURE_FADE_MS` (`is-revealing`
 * while it runs), or at once when motion is reduced. Nothing stands in for the
 * picture but the drawn paper: maps stay lossless.
 *
 * The rule with the soft handoff (P-05): one fade at a time. A picture that
 * arrives while a handoff ghost is on the map shows at once, because the
 * ghost's own fade is the transition the eye sees; fading both would dip
 * through the paper. A picture that arrives after the ghost has gone (a slow
 * load past the ghost's wait) fades in as usual.
 *
 * The classes are set on the element directly, not through React: Leaflet
 * creates an image overlay's `<img>` and sets its class once.
 *
 * PLAYER-SAFE: no imports from the editor or viewer.
 */

export const PICTURE_FADE_MS = 250;
/** Every canvas map picture. */
export const PICTURE_CLASS = "atlas-canvas-picture";
/** Not loaded yet: hidden, the paper shows. */
export const PICTURE_PENDING = "is-pending";
/** Fading in; removed when the fade is over, so a copy of it (P-05) never replays it. */
export const PICTURE_REVEALING = "is-revealing";
/** The class a canvas picture is created with. */
export const PICTURE_START_CLASS = `${PICTURE_CLASS} ${PICTURE_PENDING}`;

/** True while a handoff ghost (P-05, `data-handoff-ghost`) is on this picture's map. */
export function underHandoffGhost(el: Element): boolean {
  return el.closest(".leaflet-container")?.querySelector("[data-handoff-ghost]") != null;
}

/** Take a pending picture out of hiding: a fade, or at once (reduced motion, under a ghost). */
export function revealPicture(el: Element, motion: boolean): void {
  if (!el.classList.contains(PICTURE_PENDING)) return;
  if (motion && !underHandoffGhost(el)) {
    // Added with the change it animates, so the transition applies to it.
    el.classList.add(PICTURE_REVEALING);
    setTimeout(() => el.classList.remove(PICTURE_REVEALING), PICTURE_FADE_MS + 50);
  }
  el.classList.remove(PICTURE_PENDING);
}

/**
 * A picture has loaded: show it once it has decoded (an `<img>` that can say
 * so; an SVG `<image>` shows on load), then call `then`. Under a handoff ghost
 * it shows at once, so it is in place when the ghost fades.
 */
export function showLoadedPicture(el: Element, motion: () => boolean, then?: () => void): void {
  const show = () => {
    revealPicture(el, motion());
    then?.();
  };
  const decode = (el as Partial<HTMLImageElement>).decode;
  if (typeof decode !== "function" || underHandoffGhost(el)) return show();
  decode.call(el).then(show, show);
}
