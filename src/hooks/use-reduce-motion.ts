import * as React from "react";
import { getStorage } from "@/lib/safeStorage";

/**
 * The player site's one "reduce motion" switch: the OS setting OR calm mode.
 * Map flights, the ocean and CSS transitions all follow it.
 *
 * Calm mode is a player preference kept in localStorage and mirrored onto
 * `<html data-calm="true">` so CSS (ocean waves, transitions) can follow it;
 * the OS setting reaches CSS through its own media query.
 */

const STORAGE_KEY = "atlas-calm-mode-v1";
/** Calm mode used to live in the sound prefs; read once to keep a saved "on". */
const LEGACY_SOUND_KEY = "atlas-player-sound-v1";
const OS_QUERY = "(prefers-reduced-motion: reduce)";

let calm: boolean | null = null;
const listeners = new Set<() => void>();

function readSaved(): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    const saved = s.getItem(STORAGE_KEY);
    if (saved !== null) return saved === "true";
    const legacy: unknown = JSON.parse(s.getItem(LEGACY_SOUND_KEY) ?? "null");
    const on =
      typeof legacy === "object" &&
      legacy !== null &&
      (legacy as { calmMode?: unknown }).calmMode === true;
    // Copy it over: the sound prefs no longer write calmMode.
    if (on) s.setItem(STORAGE_KEY, "true");
    return on;
  } catch {
    return false;
  }
}

export function getCalmMode(): boolean {
  if (calm === null) calm = readSaved();
  return calm;
}

function applyToDocument(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.setAttribute("data-calm", "true");
  else document.documentElement.removeAttribute("data-calm");
}

export function setCalmMode(on: boolean): void {
  calm = on;
  try {
    getStorage()?.setItem(STORAGE_KEY, String(on));
  } catch {
    // Quota/sandbox: the switch still works for this visit.
  }
  applyToDocument(on);
  listeners.forEach((l) => l());
}

/** Call once at boot so the saved calm mode reaches CSS on every page. */
export function syncCalmModeToDocument(): void {
  applyToDocument(getCalmMode());
}

/** Another tab changed calm mode: follow it here too. */
function onStorage(e: StorageEvent): void {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  calm = null;
  const on = getCalmMode();
  applyToDocument(on);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Calm mode alone, updated live. */
export function useCalmMode(): boolean {
  return React.useSyncExternalStore(subscribe, getCalmMode, () => false);
}

function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = React.useState<boolean>(
    () => typeof window !== "undefined" && (window.matchMedia?.(OS_QUERY).matches ?? false),
  );

  React.useEffect(() => {
    const mql = window.matchMedia?.(OS_QUERY);
    if (!mql) return;
    const onChange = () => setPrefersReduced(mql.matches);
    mql.addEventListener("change", onChange);
    setPrefersReduced(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}

/** True when motion should be reduced: the OS setting or calm mode, updated live. */
export function useReduceMotion(): boolean {
  const os = usePrefersReducedMotion();
  const calmMode = useCalmMode();
  return os || calmMode;
}

/** @internal Tests only. */
export function _resetCalmModeForTests({ keepStorage = false } = {}): void {
  calm = null;
  if (!keepStorage) {
    try {
      getStorage()?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  applyToDocument(false);
}
