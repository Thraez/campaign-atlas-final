import { useEffect } from "react";

/**
 * Wires the browser's native "leave site?" prompt to an unsaved-changes flag.
 * Most browsers ignore the returned/assigned string and show their own fixed
 * copy, but both the return value and `event.returnValue` must be set for
 * cross-browser support.
 */
export function useBeforeUnloadWarning(shouldWarn: boolean): void {
  useEffect(() => {
    if (!shouldWarn) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldWarn]);
}
