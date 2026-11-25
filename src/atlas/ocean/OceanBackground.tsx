/**
 * Animated "living water" backdrop for maps.
 *
 * Mount this as an absolutely-positioned element behind MapContainer.
 * The parent must be position:relative so inset:0 fills it correctly.
 * pointer-events:none ensures map interaction is never intercepted.
 *
 * When water.enabled === false the component renders nothing; the consumer's
 * existing background:oceanColor fallback on MapContainer applies unchanged.
 *
 * Animation stops when motion is reduced: the OS setting (media query) or
 * calm mode (`<html data-calm>`, see use-reduce-motion.ts). A caller that
 * already reads `useReduceMotion` can pass `reduceMotion` to stop it outright
 * (the shared canvas does, R-31).
 */
import type { MapDocument } from "@/atlas/content/schema";
import { resolveWater } from "./resolveWater";

interface Props {
  map: Pick<MapDocument, "water" | "oceanColor">;
  /** True: draw the waves still (no animation), whatever the CSS says. */
  reduceMotion?: boolean;
}

/**
 * The three wave layers: stripes `period` px apart (measured across them) at
 * `angle`, drifting right at `pxPerCycle` px per `baseSeconds` at speed 1.
 *
 * Q-04: each layer used to be an 80/120/60 px wide background tile, slid by
 * `background-position`. A slanted stripe doesn't line up across a vertical
 * tile edge, so the sea showed a seam at every tile edge (all three met every
 * 240 px), and the slide repainted the whole sea each frame. Now each layer
 * is one untiled gradient, a little wider than the sea, moved by `transform`
 * one horizontal stripe repeat (`period / sin(angle)`), which lands on an
 * identical picture, so the loop has no jump. Same stripes, same speed; the
 * compositor moves it without repainting.
 */
const WAVES = [
  { angle: 18, period: 38, pxPerCycle: 80, baseSeconds: 10, opacity: 0.3 },
  { angle: 22, period: 54, pxPerCycle: 120, baseSeconds: 14, opacity: 0.2 },
  { angle: 14, period: 26, pxPerCycle: 60, baseSeconds: 8, opacity: 0.15 },
].map((w, i) => ({
  ...w,
  n: i + 1,
  /** Horizontal distance after which the stripes repeat exactly. */
  repeatPx: +(w.period / Math.sin((w.angle * Math.PI) / 180)).toFixed(3),
}));

const KEYFRAMES = `
${WAVES.map((w) => `@keyframes ocean-bg-drift-${w.n}{from{transform:translateX(0)}to{transform:translateX(${w.repeatPx}px)}}`).join("\n")}
@media(prefers-reduced-motion:reduce){
  .ocean-wave-1,.ocean-wave-2,.ocean-wave-3{animation:none!important}
}
:root[data-calm="true"] .ocean-wave-1,
:root[data-calm="true"] .ocean-wave-2,
:root[data-calm="true"] .ocean-wave-3{animation:none!important}
`;

export function OceanBackground({ map, reduceMotion = false }: Props) {
  const resolved = resolveWater(map);

  if (!resolved.enabled) return null;

  const oceanColor = map.oceanColor ?? "#18313f";
  const { intensity, speed, crestColor } = resolved;

  // Map speed 0..1 → drift speed. At speed=0 the waves move very slowly so
  // they appear nearly still. A cycle is one stripe repeat (WAVES), so the
  // duration scales with it to keep the old px-per-second.
  const durationOf = (w: (typeof WAVES)[number]) =>
    `${((w.baseSeconds * (w.repeatPx / w.pxPerCycle)) / Math.max(speed, 0.05)).toFixed(1)}s`;

  return (
    <div
      aria-hidden="true"
      data-testid="ocean-background"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: oceanColor,
        overflow: "hidden",
        zIndex: 0,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Three wave stripe layers at slightly different angles, speeds, and opacities.
          Each starts one stripe repeat left of the sea, so the drift never uncovers an edge. */}
      {WAVES.map((w) => {
        const p = w.period;
        return (
          <div
            key={w.n}
            className={`ocean-wave-${w.n}`}
            data-testid="ocean-wave"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `-${w.repeatPx}px`,
              width: `calc(100% + ${w.repeatPx}px)`,
              backgroundImage: `repeating-linear-gradient(-${w.angle}deg,transparent 0,transparent ${p - 4}px,${crestColor} ${p - 3}px,${crestColor} ${p - 1}px,transparent ${p}px)`,
              opacity: intensity * w.opacity,
              animation: reduceMotion
                ? "none"
                : `ocean-bg-drift-${w.n} ${durationOf(w)} linear infinite`,
            }}
          />
        );
      })}
    </div>
  );
}
