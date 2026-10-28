import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloudOff, Cloud, RefreshCw, Trash2, CheckCircle2, Download } from "lucide-react";
import {
  activateUpdate,
  clearOfflineCache,
  getOfflineCoverage,
  onCacheStateChange,
  onUpdateAvailable,
  reloadLatestAtlas,
  saveForOffline,
  shouldEnableServiceWorker,
  type OfflineCoverage,
} from "@/pwa";

/**
 * What of the atlas works offline for this map, read from the caches. `null`
 * while the first read is in flight. Re-reads on mount, when the map changes,
 * when `pwa.ts` reports a change (SW activated, save, clear) and on `recheck()`.
 */
function useOfflineCoverage(layerSrcs: readonly string[]) {
  const [coverage, setCoverage] = useState<OfflineCoverage | null>(null);
  // A string key, so a fresh array with the same layers doesn't re-read.
  const layersKey = layerSrcs.join("\n");
  const readId = useRef(0);

  const recheck = useCallback(() => {
    const id = ++readId.current;
    void getOfflineCoverage(layersKey.split("\n").filter(Boolean)).then((c) => {
      // Only the newest read wins; an older one may describe another map.
      if (id === readId.current) setCoverage(c);
    });
  }, [layersKey]);

  useEffect(() => {
    recheck();
  }, [recheck]);
  useEffect(() => onCacheStateChange(recheck), [recheck]);

  return { coverage, recheck };
}

/** Menu heading for each state, in plain words. */
function coverageLabel(coverage: OfflineCoverage | null): string {
  switch (coverage) {
    case null:
      return "Checking what is saved…";
    case "none":
      return "Not saved for offline yet";
    case "notes":
      return "Works offline: the notes; pictures you have opened";
    case "notes-and-map":
      return "Works offline: this map and the notes; pictures you have opened";
  }
}

interface OfflineProps {
  /** `src` of every layer of the map on screen, as in `atlas.json`. */
  layerSrcs: readonly string[];
}

/**
 * Floating offline status + update banner for /atlas.
 * Hidden in dev, where the SW is intentionally not registered.
 */
export function OfflineStatus({ layerSrcs }: OfflineProps) {
  const enabled = shouldEnableServiceWorker();
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [updateReady, setUpdateReady] = useState(false);
  const { coverage } = useOfflineCoverage(layerSrcs);

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
    return onUpdateAvailable(() => setUpdateReady(true));
  }, [enabled]);

  if (!enabled) return null;

  const offlineText =
    coverage === "notes-and-map"
      ? "Offline — showing the saved map and notes"
      : coverage === "notes"
        ? "Offline — notes saved; this map may be missing"
        : "Offline — atlas not saved for offline";

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
          {offlineText}
        </div>
      )}
    </>
  );
}

interface OfflineMenuProps extends OfflineProps {
  className?: string;
}

/** Compact dropdown trigger to be placed in the toolbar. */
export function OfflineMenu({ className, layerSrcs }: OfflineMenuProps) {
  const enabled = shouldEnableServiceWorker();
  const [busy, setBusy] = useState<null | "save" | "reload" | "clear">(null);
  const [done, setDone] = useState<null | string>(null);
  const { coverage, recheck } = useOfflineCoverage(layerSrcs);

  if (!enabled) return null;

  const flash = (message: string) => {
    setDone(message);
    setTimeout(() => setDone(null), 1800);
  };

  const handleSave = async () => {
    setBusy("save");
    const result = await saveForOffline(layerSrcs);
    setBusy(null);
    if (result.ok) flash("This map is saved for offline");
    else if (result.reason === "offline") flash("You're offline — connect to save");
    else flash("Couldn't save everything — try again");
  };
  const handleReload = async () => {
    setBusy("reload");
    const result = await reloadLatestAtlas();
    setBusy(null);
    // The page is reloading on success; this state rarely paints. Set it
    // anyway so the menu is never left looking stuck if the reload is slow.
    flash(result.ok ? "Loading latest atlas…" : "You're offline — reconnect to get the latest");
  };
  const handleClear = async () => {
    setBusy("clear");
    await clearOfflineCache();
    setBusy(null);
    flash("Offline copy cleared");
  };

  const saved = coverage === "notes" || coverage === "notes-and-map";

  return (
    <DropdownMenu onOpenChange={(open) => open && recheck()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Offline options"
          className={className}
          title={coverageLabel(coverage)}
        >
          {saved ? (
            <Cloud className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CloudOff className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-start gap-2 text-xs font-normal">
          {saved ? (
            <CheckCircle2
              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500"
              aria-hidden="true"
            />
          ) : (
            <CloudOff className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span>{coverageLabel(coverage)}</span>
        </DropdownMenuLabel>
        {coverage === "notes" && (
          <div className="px-2 pb-1.5 pl-[1.875rem] text-[11px] text-muted-foreground">
            This map is not saved yet
          </div>
        )}
        <DropdownMenuSeparator />
        {coverage !== "notes-and-map" && (
          <DropdownMenuItem onClick={handleSave} disabled={busy !== null || coverage === null}>
            <Download className="h-3.5 w-3.5 mr-2" aria-hidden="true" /> Save this map for offline
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleReload} disabled={busy !== null}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" aria-hidden="true" /> Reload latest atlas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleClear} disabled={busy !== null}>
          <Trash2 className="h-3.5 w-3.5 mr-2" aria-hidden="true" /> Clear offline copy
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
