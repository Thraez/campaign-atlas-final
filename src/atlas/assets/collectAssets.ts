import type { AtlasProject } from "@/atlas/content/schema";

export interface AssetUse {
  kind: "entity" | "layer";
  id: string;
}

export interface CollectedAsset {
  /** The asset's src path, exactly as stored on the entity image / map layer. */
  src: string;
  /** Every place this asset is referenced, in first-seen order. */
  usedBy: AssetUse[];
}

/**
 * Walk a project for every image asset — entity `images[]` plus map
 * `layers[].src` — deduped by src, recording where each is used.
 *
 * Pure and synchronous: the editor already holds `project` in memory, so this
 * is a live inventory feed for the Asset Manager with no rebuild required.
 * Insertion order is preserved (entity images first, then layer srcs), so the
 * output is deterministic.
 */
export function collectAssets(
  project: Pick<AtlasProject, "entities" | "maps">,
): CollectedAsset[] {
  const bySrc = new Map<string, CollectedAsset>();
  const add = (src: string | undefined | null, use: AssetUse) => {
    if (!src) return;
    let entry = bySrc.get(src);
    if (!entry) {
      entry = { src, usedBy: [] };
      bySrc.set(src, entry);
    }
    entry.usedBy.push(use);
  };
  for (const e of project.entities ?? []) {
    for (const img of e.images ?? []) add(img, { kind: "entity", id: e.id });
  }
  for (const m of project.maps ?? []) {
    for (const l of m.layers ?? []) add(l.src, { kind: "layer", id: l.id });
  }
  return [...bySrc.values()];
}
