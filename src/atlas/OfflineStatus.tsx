import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloudOff, Cloud, RefreshCw, Trash2, MoreVertical, CheckCircle2 } from "lucide-react";
import {
  activateUpdate,
  checkForUpdate,
  clearOfflineCache,
  isOfflineReady,
  onUpdateAvailable,
  shouldEnableServiceWorker,
} from "@/pwa";

/**
 * Floating offline status + manual cache controls for /atlas.
 * Hidden in dev / Lovable preview where the SW is intentionally not registered.
 */
export function OfflineStatus() {
  const enabled = shouldEnableServiceWorker();
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [updateReady, setUpdateReady] = useState(false);
  const [cached, setCached] = useState<boolean>(isOfflineReady());

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const unsub = onUpdateAvailable(() => setUpdateReady(true));
    const t = setInterval(() => setCached(isOfflineReady()), 2000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Update banner */}
      {updateReady && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card shadow-lg text-sm"
        >
          <span>Atlas update available. Refresh to load the newest version.</span>
          <Button size="sm" onClick={activateUpdate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      )}

      {/* Offline indicator */}
      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground shadow"
        >
          <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
          {cached ? "Offline — showing cached atlas" : "Offline — atlas not yet cached"}
        </div>
      )}
    </>
  );
}

interface OfflineMenuProps {
  className?: string;
}

/** Compact dropdown trigger to be placed in the toolbar. */
export function OfflineMenu({ className }: OfflineMenuProps) {
  const enabled = shouldEnableServiceWorker();
  const [busy, setBusy] = useState<null | "reload" | "clear">(null);
  const [done, setDone] = useState<null | string>(null);
  const [cached, setCached] = useState<boolean>(isOfflineReady());

  useEffect(() => {
    const t = setInterval(() => setCached(isOfflineReady()), 2000);
    return () => clearInterval(t);
  }, []);

  if (!enabled) return null;

  const handleReload = async () => {
    setBusy("reload");
    await checkForUpdate();
    setBusy(null);
    setDone("Checked for updates");
    setTimeout(() => setDone(null), 1800);
  };
  const handleClear = async () => {
    setBusy("clear");
    await clearOfflineCache();
    setBusy(null);
    setDone("Offline cache cleared");
    setTimeout(() => setDone(null), 1800);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Offline cache options" className={className} title="Offline cache">
          {cached ? <Cloud className="h-4 w-4" aria-hidden="true" /> : <CloudOff className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs">
          {cached ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Available offline</>
          ) : (
            <><CloudOff className="h-3.5 w-3.5" /> Not yet cached</>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleReload} disabled={busy !== null}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Reload latest atlas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleClear} disabled={busy !== null}>
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear offline cache
        </DropdownMenuItem>
        {done && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{done}</div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
