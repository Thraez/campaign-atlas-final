/** Default nudge step, in raw map units, for a plain click. */
export const NUDGE_FINE = 100;

/** Nudge step, in raw map units, when the click is Shift-modified. */
export const NUDGE_COARSE = 500;

/** Resolves the step size for a nudge click given whether Shift was held. */
export function nudgeStep(shiftKey: boolean): number {
  return shiftKey ? NUDGE_COARSE : NUDGE_FINE;
}
