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

const KEYFRAMES = `
@keyframes ocean-bg-drift-1{from{background-position:0 0}to{background-position:80px 0}}
@keyframes ocean-bg-drift-2{from{background-position:0 0}to{background-position:120px 0}}
@keyframes ocean-bg-drift-3{from{background-position:0 0}to{background-position:60px 0}}
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

  // Map speed 0..1 → animation durations. At speed=0 use a very long duration
  // so the waves appear nearly still; at speed=1 use the minimum (5s).
  const dur1 = `${(10 / Math.max(speed, 0.05)).toFixed(1)}s`;
  const dur2 = `${(14 / Math.max(speed, 0.05)).toFixed(1)}s`;
  const dur3 = `${(8 / Math.max(speed, 0.05)).toFixed(1)}s`;

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

      {/* Three wave stripe layers at slightly different angles, speeds, and opacities */}
      <div
        className="ocean-wave-1"
        data-testid="ocean-wave"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(-18deg,transparent 0,transparent 34px,${crestColor} 35px,${crestColor} 37px,transparent 38px)`,
          backgroundSize: "80px 100%",
          opacity: intensity * 0.3,
          animation: reduceMotion ? "none" : `ocean-bg-drift-1 ${dur1} linear infinite`,
        }}
      />
      <div
        className="ocean-wave-2"
        data-testid="ocean-wave"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(-22deg,transparent 0,transparent 50px,${crestColor} 51px,${crestColor} 53px,transparent 54px)`,
          backgroundSize: "120px 100%",
          opacity: intensity * 0.2,
          animation: reduceMotion ? "none" : `ocean-bg-drift-2 ${dur2} linear infinite`,
        }}
      />
      <div
        className="ocean-wave-3"
        data-testid="ocean-wave"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(-14deg,transparent 0,transparent 22px,${crestColor} 23px,${crestColor} 25px,transparent 26px)`,
          backgroundSize: "60px 100%",
          opacity: intensity * 0.15,
          animation: reduceMotion ? "none" : `ocean-bg-drift-3 ${dur3} linear infinite`,
        }}
      />
    </div>
  );
}
