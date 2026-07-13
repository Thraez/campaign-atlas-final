// The Asset Manager: a menu of every image asset with a per-asset credit
// text + on/off toggle. Reuses the world-level assetCredits registry and the
// same CreditBadge look at render time (see Phase 3). Reads current values
// from `assetCredits`, writes the whole updated registry via `onPatch`
// (wired to patchWorld in the editor).

import type { AtlasProject, AssetCredit } from "@/atlas/content/schema";
import { collectAssets } from "@/atlas/assets/collectAssets";
import { normalizeAtlasAssetUrl } from "@/atlas/url";

const EMPTY: AssetCredit = { credit: "", enabled: false };

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

  const setEntry = (src: string, patch: Partial<AssetCredit>) => {
    const current = assetCredits?.[src] ?? EMPTY;
    onPatch({ ...assetCredits, [src]: { ...current, ...patch } });
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
      <ul className="space-y-3">
        {assets.map((a) => {
          const entry = assetCredits?.[a.src] ?? EMPTY;
          return (
            <li key={a.src} className="flex gap-2 items-start border-t pt-3">
              <img
                src={normalizeAtlasAssetUrl(a.src)}
                alt=""
                className="w-12 h-12 object-cover rounded border shrink-0 bg-muted"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="font-mono truncate" title={a.src}>
                  {a.src}
                </div>
                <div className="text-muted-foreground truncate">
                  Used by: {a.usedBy.map((u) => `${u.kind} ${u.id}`).join(", ")}
                </div>
                <input
                  aria-label={`Credit for ${a.src}`}
                  className="w-full h-7 px-2 rounded border bg-background"
                  placeholder="e.g. Art by Evelyn K, CC BY 4.0"
                  defaultValue={entry.credit}
                  onChange={(e) => setEntry(a.src, { credit: e.target.value })}
                />
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
