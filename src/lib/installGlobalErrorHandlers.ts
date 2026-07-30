import { logger } from "@/lib/logger";

let installed = false;

/**
 * Forwards unhandled promise rejections and non-React runtime errors into
 * the logger seam. React render errors already reach it via
 * ErrorBoundary.componentDidCatch — this covers everything else so nothing
 * silently falls through to the bare console.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    logger.error("[unhandledrejection]", event.reason);
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    logger.error("[window error]", event.error ?? event.message);
  });
}
