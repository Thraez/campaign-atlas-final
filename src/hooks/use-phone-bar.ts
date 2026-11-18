import { useSyncExternalStore } from "react";

/** Below Tailwind's `md`: the top bar is one row of breadcrumb and search (R-38). */
export const PHONE_BAR_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(PHONE_BAR_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function snapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(PHONE_BAR_QUERY).matches
    : false;
}

/** True on a phone-width viewport. Desktop and tests (matchMedia false) get the full bar. */
export function usePhoneBar(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
