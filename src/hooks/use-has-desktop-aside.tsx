import * as React from "react";

const DESKTOP_ASIDE_BREAKPOINT = 1024;

/**
 * Returns true when the viewport is wide enough to host the desktop side
 * panel (≥ 1024px). Below this threshold the entity panel renders as a
 * bottom sheet instead. Defined this way so callers gate the *sheet's*
 * existence on the *aside's absence* — there's no dead zone where neither
 * surface is mounted.
 */
export function useHasDesktopAside() {
  const [hasAside, setHasAside] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_ASIDE_BREAKPOINT}px)`);
    const onChange = () => {
      setHasAside(window.innerWidth >= DESKTOP_ASIDE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setHasAside(window.innerWidth >= DESKTOP_ASIDE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!hasAside;
}
