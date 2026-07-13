// Viewport-anchored bottom-right credit overlay for the big map.
//
// Deliberately NOT a Leaflet ImageOverlay: a badge glued to the image's
// geographic bounds would pan/scale off-screen under zoom. For a full-bleed
// map, "bottom-right of the map" reads as the viewport corner (Leaflet's
// conventional attribution spot), so this is a plain absolutely-positioned
// DOM node meant to be mounted as a sibling of the map container — NOT
// inside the Leaflet layer tree. It reuses CreditBadge's `static` variant so
// multiple active layer credits stack small instead of overlapping.

import type { AssetCredit, CreditsConfig, MapDocument } from "@/atlas/content/schema";
import { CreditBadge } from "@/atlas/entity/CreditBadge";

/**
 * Pure: which layer credits are active for the given map — enabled,
 * non-empty registry entries for the map's layers, deduped by credit text,
 * first-seen order. No Leaflet dependency, so it's unit-testable in
 * isolation from the map runtime.
 */
export function activeMapCredits(
  map: Pick<MapDocument, "layers"> | null | undefined,
  assetCredits: Record<string, AssetCredit> | undefined,
  credits: CreditsConfig | undefined,
): string[] {
  if (!map || !assetCredits || credits?.badges === false) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const layer of map.layers ?? []) {
    const entry = assetCredits[layer.src];
    if (entry?.enabled && entry.credit && !seen.has(entry.credit)) {
      seen.add(entry.credit);
      out.push(entry.credit);
    }
  }
  return out;
}

export interface MapCreditOverlayProps {
  map: Pick<MapDocument, "layers"> | null | undefined;
  assetCredits?: Record<string, AssetCredit>;
  credits?: CreditsConfig;
}

/** Renders nothing when no active layer credit is enabled, or when the
 *  world-level `credits.badges` master switch is off. */
export function MapCreditOverlay({ map, assetCredits, credits }: MapCreditOverlayProps) {
  const active = activeMapCredits(map, assetCredits, credits);
  if (active.length === 0) return null;
  return (
    <div className="atlas-map-credit-overlay pointer-events-none absolute right-2 bottom-2 z-[500] flex max-w-[240px] flex-col items-end gap-1">
      {active.map((credit) => (
        <CreditBadge key={credit} credit={credit} variant="static" />
      ))}
    </div>
  );
}
