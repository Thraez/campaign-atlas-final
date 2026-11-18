/**
 * Which breadcrumb levels a narrow bar shows (R-38). Up to `maxShown` levels
 * show in full; deeper trails keep the last `maxShown - 1` and fold every
 * earlier level into one "…" menu, so no level is ever dropped.
 */
export function collapseCrumbs<T>(
  items: readonly T[],
  maxShown: number,
): { hidden: T[]; shown: T[] } {
  const keep = Math.max(1, Math.floor(maxShown));
  if (items.length <= keep) return { hidden: [], shown: [...items] };
  const split = items.length - Math.max(1, keep - 1);
  return { hidden: items.slice(0, split), shown: items.slice(split) };
}
