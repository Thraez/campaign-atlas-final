// Where a map layer uploaded in the editor is published: the one naming rule
// for `public/atlas/assets/maps/`, used by the upload (useMapLayers) and the
// save batch (buildSaveBatch) so the two can never disagree.
//
// Why this is not in imageEncoding.ts: AGENTS.md has two rules, "published
// image format and naming belong to imageEncoding.ts" and "maps stay lossless;
// maps:optimize owns them". Map layers fall under the second. imageEncoding's
// editorImageTargetName renames PNG/JPEG to `.webp`, and the save endpoint
// reads a `.webp` name as the instruction to convert (only under
// assets/images/ today, see isConvertibleImageTarget). Map layers need their
// own extension kept, because fog redaction and map labels break under a lossy
// re-encode; scripts/dev/optimize-maps.mjs makes any WebP twin later, by hand.
// So map naming lives here, next to imageEncoding, and keeps the extension.
//
// Kept free of node built-ins, like imageEncoding.ts, so the browser editor
// and Node scripts can both import it.

/** Folder every map layer upload is written to. */
export const MAP_ASSET_DIR = "public/atlas/assets/maps/";

/** Fields of a layer the target path is derived from. */
export interface MapLayerTargetSource {
  id: string;
  /** Original filename of the dropped file. */
  filename?: string;
  /** Path the DM chose; empty or whitespace counts as not chosen. */
  targetPath?: string;
}

/** Lowercase, filesystem-safe filename that keeps its extension. */
export function mapUploadFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The path a map layer upload is saved to.
 *
 * A non-blank `targetPath` wins. Otherwise the name comes from the original
 * filename, exactly as a fresh upload names it, so an old layer saved without
 * a path lands where it would have if uploaded today. A layer with no filename
 * at all (none are made today) falls back to `<id>.png`.
 */
export function mapLayerTargetPath(layer: MapLayerTargetSource): string {
  const chosen = layer.targetPath?.trim();
  if (chosen) return chosen;
  const fromFile = layer.filename ? mapUploadFileName(layer.filename) : "";
  // A name that is only an extension (".png" from "???.png") has no stem.
  const usable = fromFile && !fromFile.startsWith(".") ? fromFile : "";
  return `${MAP_ASSET_DIR}${usable || `${mapUploadFileName(layer.id)}.png`}`;
}
