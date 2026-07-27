import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AtlasLoadStateProps {
  error: string | null;
  loading: boolean;
  backHref?: string;
  backLabel?: string;
  loadingLabel?: string;
  errorTitle?: string;
  offlineTitle?: string;
  extraHint?: ReactNode;
  /** When provided, an error (while online) shows a "Try again" button that
   *  calls this instead of forcing a full page reload. Omitted while offline
   *  — a retry would just fail again, and the offline copy already explains
   *  what to do. */
  onRetry?: () => void;
}

/** Shared offline-aware loading/error screen for the player-facing reader
 *  pages. Renders nothing when neither `error` nor `loading` applies — the
 *  caller decides when to mount this in place of its real content. */
export function AtlasLoadState({
  error,
  loading,
  backHref = "/atlas",
  backLabel = "Back to atlas",
  loadingLabel = "Loading…",
  errorTitle = "Atlas not built yet",
  offlineTitle = "Atlas not available offline yet",
  extraHint,
  onRetry,
}: AtlasLoadStateProps) {
  if (error) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="font-display text-2xl text-primary">
            {offline ? offlineTitle : errorTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {offline ? "Open the atlas once while online to cache it for offline use." : error}
          </p>
          {!offline && extraHint}
          <div className="flex gap-2 justify-center">
            {onRetry && !offline && (
              <Button variant="default" onClick={onRetry}>
                Try again
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link to={backHref}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                {backLabel}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">
      {loadingLabel}
    </div>
  );
}
