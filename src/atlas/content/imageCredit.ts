import type { AssetCredit } from "./schema";

/**
 * Resolve which credit text (if any) to show for one image src. A registry
 * entry (world.assetCredits[src]) takes precedence when present — shown only
 * when `enabled` and non-empty. With no registry entry, fall back to the
 * entity's coarse `credit` field. Returns null when nothing should show.
 *
 * Shared by the live reading panel (`EntityPanel.tsx`) and the printable
 * handout (`printHandout.ts`) so both surfaces resolve credit identically.
 */
export function resolveImageCredit(
  src: string,
  assetCredits: Record<string, AssetCredit> | undefined,
  entityCredit: string | undefined,
): string | null {
  const entry = assetCredits?.[src];
  if (entry) {
    return entry.enabled && entry.credit ? entry.credit : null;
  }
  return entityCredit ? entityCredit : null;
}
