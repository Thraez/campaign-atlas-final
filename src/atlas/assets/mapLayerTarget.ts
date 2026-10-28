// Map layer file naming: the one owner of "what is a map file under
// public/atlas/assets/maps/ called". Editor uploads (useMapLayers), the save
// batch (buildSaveBatch) and the Map Import Wizard (mapImport) all name files
// here, so the same file gets the same name whichever way it comes in.
//
// Why this is not in imageEncoding.ts: AGENTS.md has two rules, "published
// image format and naming belong to imageEncoding.ts" and "maps stay lossless;
// maps:optimize owns them". Map layers fall under the second. imageEncoding's
// editorImageTargetName renames PNG/JPEG to `.webp`, and the save endpoint
// reads a `.webp` name as the instruction to convert (only under
// assets/images/ today, see isConvertibleImageTarget). Map layers need their
// own extension kept, because fog redaction and map labels break under a lossy
// re-encode; scripts/dev/optimize-maps.mjs makes any WebP twin later, by hand.
//
// Kept free of node built-ins, like imageEncoding.ts, so the browser editor
// and Node scripts can both import it.

// The same folder is MAPS_DIR in scripts/dev/optimize-maps.mjs, a plain .mjs
// script that can't import this TypeScript module; keep the two in step.
const MAP_ASSET_DIR = "public/atlas/assets/maps/";

/** Extensions the save endpoint accepts for a map (sourcePathAllowlist). */
const MAP_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** Fields of a layer the target path is derived from. */
export interface MapLayerTargetSource {
  id: string;
  /** Original filename of the dropped file. */
  filename?: string;
  /** Path the DM chose; blank, or outside the maps folder, counts as not chosen. */
  targetPath?: string;
  /** Cached bytes; its MIME type names the extension when there's no filename. */
  dataUrl?: string;
}

/**
 * Lowercase, filesystem-safe filename that keeps its extension. Spaces become
 * dashes, other unsafe characters are dropped, and dashes at either end of the
 * name are stripped (`Fog Overlay (v2).PNG` → `fog-overlay-v2.png`). A name
 * with nothing left becomes `image`.
 */
export function safeFilename(raw: string): string {
  const dot = raw.lastIndexOf(".");
  const stem = (dot >= 0 ? raw.slice(0, dot) : raw).toLowerCase();
  const ext = (dot >= 0 ? raw.slice(dot + 1) : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeStem = stem
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ext ? `${safeStem || "image"}.${ext}` : safeStem || "image";
}

/** Path of a map file, given its (already safe) filename. */
export function defaultTargetPath(filename: string): string {
  return `${MAP_ASSET_DIR}${filename}`;
}

/**
 * Whether `path` is a file directly inside the maps folder, the only place
 * a map layer upload may be saved.
 */
export function isMapAssetPath(path: string): boolean {
  if (!path.startsWith(MAP_ASSET_DIR)) return false;
  const name = path.slice(MAP_ASSET_DIR.length);
  return name.length > 0 && !/[/\\]/.test(name) && name !== "." && name !== "..";
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function mimeExtension(dataUrl: string | undefined): string {
  const subtype = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(dataUrl ?? "")?.[1]?.toLowerCase();
  return subtype && MAP_EXTENSIONS.has(subtype) ? subtype : "";
}

/** The name a layer with no original filename gets, built from its id. */
function nameFromId(layer: MapLayerTargetSource): string {
  const idExt = extensionOf(layer.id);
  const hasExt = MAP_EXTENSIONS.has(idExt);
  const stem = safeFilename(hasExt ? layer.id.slice(0, -(idExt.length + 1)) : layer.id);
  const ext = mimeExtension(layer.dataUrl) || (hasExt ? idExt : "png");
  return `${stem}.${ext}`;
}

/** Where Save writes the layer when the DM hasn't chosen a usable path. */
export function defaultMapLayerTargetPath(layer: MapLayerTargetSource): string {
  return defaultTargetPath(layer.filename ? safeFilename(layer.filename) : nameFromId(layer));
}

/**
 * The path a map layer upload is saved to.
 *
 * A typed path wins only if it is a file directly inside the maps folder.
 * Otherwise (blank, a bare name, another folder) the layer gets the default:
 * the original filename named exactly as a fresh upload or the Map Import
 * Wizard would name it, so an old layer saved without a path lands where it
 * would if uploaded today.
 */
export function mapLayerTargetPath(layer: MapLayerTargetSource): string {
  const chosen = layer.targetPath?.trim();
  if (chosen && isMapAssetPath(chosen)) return chosen;
  return defaultMapLayerTargetPath(layer);
}
