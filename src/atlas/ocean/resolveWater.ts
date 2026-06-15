import type { MapDocument, WaterConfig } from "@/atlas/content/schema";

export const DEFAULT_WATER = {
  enabled: true,
  intensity: 0.35,
  speed: 0.3,
} as const;

export interface ResolvedWater {
  enabled: boolean;
  intensity: number;
  speed: number;
  crestColor: string;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

/** Blend oceanColor toward white at ~40% to derive a subtle crest tone. */
export function deriveCrestColor(oceanColor: string): string {
  const h = oceanColor.replace("#", "");
  if (h.length !== 6) return "#4a7a8a";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * 0.4);
  const lg = Math.round(g + (255 - g) * 0.4);
  const lb = Math.round(b + (255 - b) * 0.4);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/**
 * Resolve WaterConfig to concrete values, applying defaults and clamping.
 * Pure — same input, same output. Used by OceanBackground and by tests.
 */
export function resolveWater(
  map: Pick<MapDocument, "water" | "oceanColor">
): ResolvedWater {
  const w: WaterConfig | undefined = map.water;
  const oceanColor = map.oceanColor ?? "#18313f";
  const derivedCrest = deriveCrestColor(oceanColor);

  const enabled = w?.enabled !== false;
  const intensity = clamp01(
    typeof w?.intensity === "number" ? w.intensity : DEFAULT_WATER.intensity
  );
  const speed = clamp01(
    typeof w?.speed === "number" ? w.speed : DEFAULT_WATER.speed
  );
  const crestColor =
    w?.crestColor && isValidHex(w.crestColor) ? w.crestColor : derivedCrest;

  return { enabled, intensity, speed, crestColor };
}
