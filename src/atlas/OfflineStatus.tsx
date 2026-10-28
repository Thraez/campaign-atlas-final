import { useEffect, useState, useSyncExternalStore } from "react";
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
  getOfflineCoverageSnapshot,
  onUpdateAvailable,
  refreshOfflineCoverage,
  reloadLatestAtlas,
  saveCurrentMapForOffline,
  shouldEnableServiceWorker,
  subscribeOfflineCoverage,
  type OfflineCoverage,
} from "@/pwa";

interface CoverageText {
  /** Menu heading. */
  label: string;
  /** Second line under the heading, when the map isn't covered. */
  note?: string;
  /** Banner shown while the device is offline. */
  banner: string;
  /** Something works offline (cloud icon, check mark). */
  saved: boolean;
  /** "Save this map for offline" would add something. */
  canSave: boolean;
}

/** Everything the offline views say, per state, in plain words. */
const COVERAGE_TEXT: Record<OfflineCoverage | "checking", CoverageText> = {
  checking: {
    label: "Checking what is saved…",
    banner: "Offline — checking what is saved",
    saved: false,
    canSave: false,
  },
  none: {
    label: "Not saved for offline yet",
    banner: "Offline — the atlas isn't saved on this device",
    saved: false,
    canSave: true,
  },
  notes: {
    label: "Works offline: the notes; pictures you have opened",
    note: "This map is not saved yet",
    banner: "Offline — showing the saved notes; this map isn't saved",
    saved: true,
    canSave: true,
  },
  "notes-map-online": {
    label: "Works offline: the notes; pictures you have opened",
    note: "This map's pictures come from another site and aren't saved",
    banner: "Offline — showing the saved notes; this map needs the internet",
    saved: true,
    canSave: false,
  },
  "notes-and-map": {
    label: "Works offline: this map and the notes; pictures you have opened",
    banner: "Offline — showing the saved map and notes",
    saved: true,
    canSave: false,
  },
};

/** What is stored for the map on screen; one shared read for every view. */
function useCoverageText(): CoverageText {
  const coverage = useSyncExternalStore(subscribeOfflineCoverage, getOfflineCoverageSnapshot);
  return COVERAGE_TEXT[coverage ?? "checking"];
}

/**
 * Floating offline status + update banner for /atlas.
 * Hidden in dev, where the SW is intentionally not registered.
 */
export function OfflineStatus() {
  const enabled = shouldEnableServiceWorker();
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [updateReady, setUpdateReady] = useState(false);
  const text = useCoverageText();

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
          {text.banner}
        </div>
      )}
    </>
  );
}

interface OfflineMenuProps {
  className?: string;
}

const SAVE_MESSAGES = {
  offline: "You're offline — connect to save",
  failed: "Couldn't save everything — try again",
  unsupported: "This browser can't save pages for offline use",
} as const;

/** Compact dropdown trigger to be placed in the toolbar. */
export function OfflineMenu({ className }: OfflineMenuProps) {
  const enabled = shouldEnableServiceWorker();
  const [busy, setBusy] = useState<null | "save" | "reload" | "clear">(null);
  const [done, setDone] = useState<null | string>(null);
  const text = useCoverageText();

  if (!enabled) return null;

  const flash = (message: string) => {
    setDone(message);
    setTimeout(() => setDone(null), 1800);
  };

  const handleSave = async () => {
    setBusy("save");
    const result = await saveCurrentMapForOffline();
    setBusy(null);
    flash(result.ok ? "This map is saved for offline" : SAVE_MESSAGES[result.reason]);
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
    flash("Offline cache cleared");
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && void refreshOfflineCoverage()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Offline options"
          className={className}
          title={text.label}
        >
          {text.saved ? (
            <Cloud className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CloudOff className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-start gap-2 text-xs font-normal">
          {text.saved ? (
            <CheckCircle2
              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500"
              aria-hidden="true"
            />
          ) : (
            <CloudOff className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span>{text.label}</span>
        </DropdownMenuLabel>
        {text.note && (
          <div className="px-2 pb-1.5 pl-[1.875rem] text-[11px] text-muted-foreground">
            {text.note}
          </div>
        )}
        <DropdownMenuSeparator />
        {text.canSave && (
          <DropdownMenuItem onClick={handleSave} disabled={busy !== null}>
            <Download className="h-3.5 w-3.5 mr-2" aria-hidden="true" /> Save this map for offline
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleReload} disabled={busy !== null}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" aria-hidden="true" /> Reload latest atlas
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleClear}
          disabled={busy !== null}
          className="flex-col items-start gap-0.5"
        >
          <span className="flex items-center">
            <Trash2 className="h-3.5 w-3.5 mr-2" aria-hidden="true" /> Clear offline cache
          </span>
          <span className="pl-[1.375rem] text-[11px] text-muted-foreground">
            Removes saved notes, maps and pictures; the app itself stays
          </span>
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
