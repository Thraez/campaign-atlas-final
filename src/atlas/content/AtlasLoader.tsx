import { useEffect, useState } from "react";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { loaderShownThisLoad, markLoaderShown } from "./atlasLoaderShown";

/** One sway of the needle (ms); keep in step with `.atlas-loader-needle` in src/index.css. */
const SWAY_MS = 3600;

/**
 * The site's name, as the page head already ships it (`<title>`, set per
 * campaign by the build), so the loader shows nothing the player site doesn't.
 */
function siteTitle(): string {
  if (typeof document === "undefined") return "Atlas";
  return document.title.trim() || "Atlas";
}

/**
 * The drawn first-load screen (P-08): a compass and the atlas title on the
 * app's dark ground. Shared by the route fallback and every reader page's
 * loading state, so the switch between them shows no flash.
 *
 * Motion: a 600 ms fade-in on the first loader this page load (the route
 * fallback handing over to a page's loader doesn't fade again) and a slow
 * needle sway phased on the page clock (negative delay), so a remount carries
 * on where the last one was. Both are left out under `useReduceMotion` (calm
 * mode or the OS setting).
 */
export function AtlasLoader({ label = "Loading atlas…" }: { label?: string }) {
  const reduce = useReduceMotion();
  const [fade] = useState(() => !loaderShownThisLoad());
  useEffect(() => {
    markLoaderShown();
  }, []);
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  return (
    <div
      className={`atlas-loader h-screen w-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center ${fade && !reduce ? "atlas-loader-motion" : ""}`}
      data-reduce-motion={reduce ? "true" : undefined}
    >
      <svg
        viewBox="0 0 64 64"
        className="h-16 w-16 text-primary"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="32"
          cy="32"
          r="29"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <circle
          cx="32"
          cy="32"
          r="24"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        {/* Cardinal ticks */}
        <g stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round">
          <line x1="32" y1="3" x2="32" y2="9" />
          <line x1="32" y1="55" x2="32" y2="61" />
          <line x1="3" y1="32" x2="9" y2="32" />
          <line x1="55" y1="32" x2="61" y2="32" />
        </g>
        {/* Rose, under the needle */}
        <path
          d="M32 14 L35 29 L50 32 L35 35 L32 50 L29 35 L14 32 L29 29 Z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        <g
          className={reduce ? undefined : "atlas-loader-needle"}
          style={reduce ? undefined : { animationDelay: `-${Math.round(now % SWAY_MS)}ms` }}
        >
          <path d="M32 10 L36 32 L28 32 Z" fill="currentColor" />
          <path d="M32 54 L36 32 L28 32 Z" fill="hsl(var(--muted-foreground))" fillOpacity="0.7" />
          <circle
            cx="32"
            cy="32"
            r="2.5"
            fill="hsl(var(--background))"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </g>
      </svg>
      <p className="font-display text-2xl text-primary max-w-md text-balance">{siteTitle()}</p>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
