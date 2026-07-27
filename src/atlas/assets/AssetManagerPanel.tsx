// The Asset Manager: a menu of every image asset with a per-asset credit
// text + on/off toggle. Reuses the world-level assetCredits registry and the
// same CreditBadge look at render time (see Phase 3). Reads current values
// from `assetCredits`, writes the whole updated registry via `onPatch`
// (wired to patchWorld in the editor).

import { useEffect, useState } from "react";
import type { AtlasProject, AssetCredit } from "@/atlas/content/schema";
import { collectAssets } from "@/atlas/assets/collectAssets";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { SIZE_WARN_BYTES, SIZE_ERROR_BYTES, formatBytes } from "@/atlas/assets/assetSize";
import { Button } from "@/components/ui/button";
import { AtlasImage } from "@/atlas/content/AtlasImage";

const EMPTY: AssetCredit = { credit: "", enabled: false };

type SizeState = { size: number } | { error: true };

/** Fetches and caches each asset's served byte size, keyed by src. Never throws — a
 * failed fetch is recorded as an error state so the panel just omits the size. */
function useAssetSizes(srcs: string[]): Record<string, SizeState | undefined> {
  const [sizes, setSizes] = useState<Record<string, SizeState | undefined>>({});
  const key = srcs.join("\n");

  useEffect(() => {
    let cancelled = false;
    for (const src of srcs) {
      (async () => {
        try {
          const res = await fetch(normalizeAtlasAssetUrl(src));
          if (!res.ok) throw new Error(`asset fetch failed: ${res.status}`);
          const blob = await res.blob();
          if (cancelled) return;
          setSizes((prev) => ({ ...prev, [src]: { size: blob.size } }));
        } catch {
          if (cancelled) return;
          setSizes((prev) => ({ ...prev, [src]: { error: true } }));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return sizes;
}

function AssetSizeInfo({ state }: { state: SizeState | undefined }) {
  if (!state || "error" in state) return null;
  const isError = state.size > SIZE_ERROR_BYTES;
  const isWarn = !isError && state.size > SIZE_WARN_BYTES;
  return (
    <div className={isError ? "text-destructive" : isWarn ? "text-amber-600" : "text-muted-foreground"}>
      {formatBytes(state.size)}
      {(isError || isWarn) && (
        <span>
          {" "}
          — optimize this image ({isError ? "over the 4 MB limit" : "over 1 MB"})
        </span>
      )}
    </div>
  );
}

export function AssetManagerPanel({
  project,
  assetCredits,
  onPatch,
}: {
  project: Pick<AtlasProject, "entities" | "maps">;
  assetCredits?: Record<string, AssetCredit>;
  onPatch: (next: Record<string, AssetCredit>) => void;
}) {
  const assets = collectAssets(project);
  const sizes = useAssetSizes(assets.map((a) => a.src));

  const setEntry = (src: string, patch: Partial<AssetCredit>) => {
    const current = assetCredits?.[src] ?? EMPTY;
    onPatch({ ...assetCredits, [src]: { ...current, ...patch } });
  };

  const applyCreditToAll = (credit: string) => {
    const next: Record<string, AssetCredit> = { ...assetCredits };
    for (const a of assets) {
      next[a.src] = { ...(assetCredits?.[a.src] ?? EMPTY), credit };
    }
    onPatch(next);
  };

  const setAllEnabled = (enabled: boolean) => {
    const next: Record<string, AssetCredit> = { ...assetCredits };
    for (const a of assets) {
      next[a.src] = { ...(assetCredits?.[a.src] ?? EMPTY), enabled };
    }
    onPatch(next);
  };

  if (assets.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        No image assets found. Add entity images or map layers first.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-xs">
      <p className="text-muted-foreground">
        Toggle a credit on and type an attribution. It shows as a faint badge in the bottom-right
        corner of the image.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setAllEnabled(true)}
        >
          Enable all badges
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setAllEnabled(false)}
        >
          Disable all badges
        </Button>
      </div>
      <ul className="space-y-3">
        {assets.map((a) => {
          const entry = assetCredits?.[a.src] ?? EMPTY;
          return (
            <li key={a.src} className="flex gap-2 items-start border-t pt-3">
              <AtlasImage
                src={normalizeAtlasAssetUrl(a.src)}
                alt=""
                className="w-12 h-12 object-cover rounded border shrink-0 bg-muted"
                fallbackClassName="w-12 h-12 object-cover rounded border shrink-0 bg-muted flex items-center justify-center text-[8px] text-muted-foreground text-center leading-tight px-0.5"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="font-mono truncate" title={a.src}>
                  {a.src}
                </div>
                <div className="text-muted-foreground truncate">
                  Used by: {a.usedBy.map((u) => `${u.kind} ${u.id}`).join(", ")}
                </div>
                <AssetSizeInfo state={sizes[a.src]} />
                <div className="flex gap-1.5">
                  <input
                    aria-label={`Credit for ${a.src}`}
                    className="w-full h-7 px-2 rounded border bg-background"
                    placeholder="e.g. Art by Evelyn K, CC BY 4.0"
                    value={entry.credit}
                    onChange={(e) => setEntry(a.src, { credit: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] shrink-0"
                    title="Copy this credit to every asset"
                    onClick={() => applyCreditToAll(entry.credit)}
                  >
                    Apply to all
                  </Button>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Show credit for ${a.src}`}
                    checked={entry.enabled}
                    onChange={(e) => setEntry(a.src, { enabled: e.target.checked })}
                  />
                  <span>Show credit badge</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
