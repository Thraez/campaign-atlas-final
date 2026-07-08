/**
 * Minimal leveled logger — the single seam for app diagnostics.
 *
 * Fail loud in dev, stay quiet in prod: `debug`/`info` only emit during
 * development; `warn`/`error` always emit. Routing every diagnostic through
 * here (instead of scattered console.* calls) means a future error reporter
 * (Sentry, a toast, a metrics beacon) can be attached in ONE place without
 * touching call sites.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Pure gate: which levels emit for a given environment. */
export function shouldEmit(level: LogLevel, isDev: boolean): boolean {
  if (level === "warn" || level === "error") return true;
  return isDev;
}

function emit(level: LogLevel, args: unknown[]): void {
  if (!shouldEmit(level, import.meta.env.DEV)) return;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(`[${level}]`, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
