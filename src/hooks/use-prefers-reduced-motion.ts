import * as React from "react";

/**
 * Returns true when the user has requested reduced motion via the OS
 * accessibility setting. Updates reactively if the preference changes.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReduced(mql.matches);
    mql.addEventListener("change", onChange);
    setPrefersReduced(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
