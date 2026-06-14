/**
 * Pure helpers for the Map Import Wizard.
 *
 * All YAML generation and validation lives here so it can be unit-tested
 * without touching the React UI. The wizard component is a thin shell over
 * these functions — it never hand-writes YAML.
 */
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import { dumpYaml, patchHeader } from "@/atlas/yaml/dump";

export type ImportMode = "layers" | "per-image" | "world-plus-regional" | "variants" | "custom";

export type SizingMode =
  | "natural"             // map size = image natural size
  | "stretch-to-current"  // layer fills the current map
  | "center-natural"      // layer centered at natural size
  | "fit-within-current"  // layer scaled to fit, aspect preserved
  | "custom";             // user-provided width/height (keepAspect optional)

export interface ImportImage {
  id: string;                       // local UI id
  file?: File;                      // browser File (when picked)
  filename: string;                 // safe filename used in repo
  originalFilename: string;         // raw filename from picker
  mime: string;
  bytes: number;
  naturalWidth: number;
  naturalHeight: number;
  dataUrl?: string;                 // for preview + zipping
  /** Per-image assignment (filled in step 3). */
  assignment: ImageAssignment;
}

export interface ImageAssignment {
  // Map-level
  createNewMap: boolean;
  mapId: string;
  mapName: string;
  worldId: string;
  // Layer-level
  layerId: string;
  targetAssetPath: string;          // e.g. public/atlas/assets/maps/foo.webp
  opacity: number;
  zIndex: number;
  // Sizing
  sizing: SizingMode;
  customWidth?: number;
  customHeight?: number;
  keepAspect: boolean;
  // For variants mode: explicit visibility tag pinned to this image's layer id.
  variant?: "player" | "dm";
}

export interface BuildPlanInput {
  images: ImportImage[];
  mode: ImportMode;
  currentMap?: MapDocument;
  defaultWorldId: string;
}

/** A single map+layers entry that will be merged into world.yaml. */
export interface PlannedMap {
  id: string;
  name: string;
  worldId: string;
  width: number;
  height: number;
  layers: MapLayer[];
  /** True if this entry should REPLACE an existing map of the same id. */
  replaces?: boolean;
}

export interface ImportPlan {
  maps: PlannedMap[];
  /** Asset files to be written into the zip. Path is repo-relative. */
  assets: Array<{ targetPath: string; sourceImageId: string }>;
  warnings: string[];
}

// ---------- Filename / id helpers --------------------------------------------

const ID_SAFE = /[^a-z0-9-]/g;

export function safeFilename(raw: string): string {
  // Keep the original extension. Lowercase the stem and strip unsafe chars.
  const dot = raw.lastIndexOf(".");
  const stem = (dot >= 0 ? raw.slice(0, dot) : raw).toLowerCase();
  const ext = (dot >= 0 ? raw.slice(dot + 1) : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeStem = stem.replace(/\s+/g, "-").replace(ID_SAFE, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return ext ? `${safeStem || "image"}.${ext}` : safeStem || "image";
}

export function idFromFilename(raw: string): string {
  const dot = raw.lastIndexOf(".");
  const stem = (dot >= 0 ? raw.slice(0, dot) : raw).toLowerCase();
  return stem.replace(/[\s_]+/g, "-").replace(ID_SAFE, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "image";
}

export function nameFromFilename(raw: string): string {
  const dot = raw.lastIndexOf(".");
  const stem = dot >= 0 ? raw.slice(0, dot) : raw;
  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled";
}

export function defaultTargetPath(filename: string): string {
  return `public/atlas/assets/maps/${filename}`;
}

// ---------- Default assignment ------------------------------------------------

export function defaultAssignment(
  filename: string,
  mode: ImportMode,
  currentMap?: MapDocument,
  worldId = "default",
): ImageAssignment {
  const id = idFromFilename(filename);
  const safe = safeFilename(filename);
  const createNewMap = mode !== "layers" && mode !== "variants";
  return {
    createNewMap,
    mapId: createNewMap ? id : (currentMap?.id ?? id),
    mapName: createNewMap ? nameFromFilename(filename) : (currentMap?.name ?? nameFromFilename(filename)),
    worldId: currentMap?.worldId ?? worldId,
    layerId: id,
    targetAssetPath: defaultTargetPath(safe),
    opacity: 1,
    zIndex: 0,
    sizing: createNewMap ? "natural" : "stretch-to-current",
    keepAspect: true,
  };
}

// ---------- Sizing resolution ------------------------------------------------

export interface ResolvedLayerSize {
  mapWidth: number;
  mapHeight: number;
  layer: { x: number; y: number; width: number; height: number };
}

export function resolveSize(image: ImportImage, currentMap?: MapDocument): ResolvedLayerSize {
  const a = image.assignment;
  const nw = image.naturalWidth || 1;
  const nh = image.naturalHeight || 1;
  const cm = currentMap;
  switch (a.sizing) {
    case "natural":
      return {
        mapWidth: nw, mapHeight: nh,
        layer: { x: 0, y: 0, width: nw, height: nh },
      };
    case "stretch-to-current":
      if (!cm) return { mapWidth: nw, mapHeight: nh, layer: { x: 0, y: 0, width: nw, height: nh } };
      return {
        mapWidth: cm.width, mapHeight: cm.height,
        layer: { x: 0, y: 0, width: cm.width, height: cm.height },
      };
    case "center-natural":
      if (!cm) return { mapWidth: nw, mapHeight: nh, layer: { x: 0, y: 0, width: nw, height: nh } };
      return {
        mapWidth: cm.width, mapHeight: cm.height,
        layer: { x: Math.round((cm.width - nw) / 2), y: Math.round((cm.height - nh) / 2), width: nw, height: nh },
      };
    case "fit-within-current": {
      if (!cm) return { mapWidth: nw, mapHeight: nh, layer: { x: 0, y: 0, width: nw, height: nh } };
      const scale = Math.min(cm.width / nw, cm.height / nh);
      const w = Math.round(nw * scale);
      const h = Math.round(nh * scale);
      return {
        mapWidth: cm.width, mapHeight: cm.height,
        layer: { x: Math.round((cm.width - w) / 2), y: Math.round((cm.height - h) / 2), width: w, height: h },
      };
    }
    case "custom": {
      let w = a.customWidth ?? nw;
      let h = a.customHeight ?? nh;
      if (a.keepAspect) {
        if (a.customWidth && !a.customHeight) h = Math.round((w / nw) * nh);
        else if (a.customHeight && !a.customWidth) w = Math.round((h / nh) * nw);
      }
      const mw = cm?.width ?? w;
      const mh = cm?.height ?? h;
      return { mapWidth: mw, mapHeight: mh, layer: { x: 0, y: 0, width: w, height: h } };
    }
  }
}

// ---------- Plan + YAML build ------------------------------------------------

export function buildImportPlan(input: BuildPlanInput): ImportPlan {
  const { images, mode, currentMap } = input;
  const warnings: string[] = [];
  const mapBuckets = new Map<string, PlannedMap>();
  const assets: ImportPlan["assets"] = [];

  const ensureMap = (id: string, name: string, worldId: string, w: number, h: number, replaces = false): PlannedMap => {
    let m = mapBuckets.get(id);
    if (!m) {
      m = { id, name, worldId, width: w, height: h, layers: [], replaces };
      mapBuckets.set(id, m);
    } else {
      // Grow map to contain all assigned images.
      m.width = Math.max(m.width, w);
      m.height = Math.max(m.height, h);
    }
    return m;
  };

  // Establish per-image plans. world-plus-regional: first image becomes the
  // overview, the rest become regional maps (one per image).
  images.forEach((img, i) => {
    const a = img.assignment;
    const sized = resolveSize(img, currentMap);
    let mapId = a.mapId;
    let mapName = a.mapName;
    let createNew = a.createNewMap;
    if (mode === "world-plus-regional") {
      createNew = true;
      if (i === 0) { mapId = a.mapId || "world-overview"; mapName = a.mapName || "World"; }
    }
    if (mode === "per-image") createNew = true;
    if (mode === "layers") createNew = false;

    const targetMapId = createNew ? mapId : (currentMap?.id ?? mapId);
    const targetMapName = createNew ? mapName : (currentMap?.name ?? mapName);
    const targetWorldId = a.worldId || currentMap?.worldId || input.defaultWorldId;

    const plannedMap = ensureMap(
      targetMapId, targetMapName, targetWorldId, sized.mapWidth, sized.mapHeight,
      !createNew && targetMapId === currentMap?.id,
    );
    if (!createNew && currentMap) {
      // Bring along existing layers so the patch doesn't drop them.
      plannedMap.layers = [...currentMap.layers];
      plannedMap.width = currentMap.width;
      plannedMap.height = currentMap.height;
    }
    plannedMap.layers.push({
      id: a.layerId,
      src: "/" + a.targetAssetPath.replace(/^\/?public\//, "").replace(/^\/+/, ""),
      x: sized.layer.x,
      y: sized.layer.y,
      width: sized.layer.width,
      height: sized.layer.height,
      opacity: a.opacity,
      zIndex: a.zIndex,
    });
    assets.push({ targetPath: a.targetAssetPath, sourceImageId: img.id });
  });

  if (mode === "variants" && images.length > 0) {
    warnings.push("Variant mode tags layers but does not yet auto-set entity visibility — confirm in the player build.");
  }

  return { maps: [...mapBuckets.values()], assets, warnings };
}

export interface ValidationIssue {
  severity: "blocking" | "warning";
  message: string;
}

export function validateImportPlan(plan: ImportPlan, images: ImportImage[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const mapIds = new Set<string>();
  for (const m of plan.maps) {
    if (mapIds.has(m.id)) issues.push({ severity: "blocking", message: `Duplicate map id "${m.id}"` });
    mapIds.add(m.id);
    const layerIds = new Set<string>();
    if (m.width <= 0 || m.height <= 0) issues.push({ severity: "blocking", message: `Map "${m.id}" has invalid size (${m.width}×${m.height})` });
    for (const l of m.layers) {
      if (layerIds.has(l.id)) issues.push({ severity: "blocking", message: `Duplicate layer id "${l.id}" in map "${m.id}"` });
      layerIds.add(l.id);
      if (l.width <= 0 || l.height <= 0) issues.push({ severity: "blocking", message: `Layer "${l.id}" has invalid size` });
      if (l.opacity < 0 || l.opacity > 1) issues.push({ severity: "blocking", message: `Layer "${l.id}" opacity must be in 0..1` });
      if (/^https?:\/\//i.test(l.src)) issues.push({ severity: "warning", message: `Layer "${l.id}" uses an external URL — won't work offline` });
      if (!l.src) issues.push({ severity: "blocking", message: `Layer "${l.id}" is missing image source` });
    }
  }
  for (const img of images) {
    if (!/\.(png|jpe?g|webp|svg)$/i.test(img.filename)) {
      issues.push({ severity: "warning", message: `"${img.originalFilename}" has an unusual extension` });
    }
    if (img.bytes > 8 * 1024 * 1024) {
      issues.push({ severity: "warning", message: `"${img.originalFilename}" is ${(img.bytes / 1024 / 1024).toFixed(1)}MB — consider compressing` });
    }
  }
  for (const a of plan.assets) {
    if (!a.targetPath.startsWith("public/atlas/assets/")) {
      issues.push({ severity: "blocking", message: `Asset path "${a.targetPath}" must live under public/atlas/assets/` });
    }
    if (/\s|[^\w./-]/.test(a.targetPath)) {
      issues.push({ severity: "blocking", message: `Asset path "${a.targetPath}" contains unsafe characters` });
    }
  }
  return issues;
}

export function buildPlanYaml(plan: ImportPlan): string {
  return dumpYaml({
    maps: plan.maps.map((m) => ({
      id: m.id,
      worldId: m.worldId,
      name: m.name,
      width: Math.round(m.width),
      height: Math.round(m.height),
      layers: m.layers.map((l) => ({
        id: l.id,
        src: l.src,
        x: Math.round(l.x),
        y: Math.round(l.y),
        width: Math.round(l.width),
        height: Math.round(l.height),
        opacity: l.opacity,
        zIndex: l.zIndex,
      })),
    })),
  });
}

export function buildPatchFile(plan: ImportPlan): string {
  const yaml = buildPlanYaml(plan);
  return (
    patchHeader({
      title: `Map import patch — ${plan.maps.length} map${plan.maps.length === 1 ? "" : "s"}`,
      subject: `world.yaml > maps[]`,
      applyTo: `content/<world>/_atlas/world.yaml (merge with your existing maps: list)`,
      notes: [
        "If a map id below already exists in world.yaml, REPLACE that entry.",
        "Otherwise APPEND it to the maps: list.",
        "Image files for these layers live in atlas-assets.zip — extract into the repo root.",
      ],
    }) + yaml
  );
}

export function buildReadme(plan: ImportPlan, images: ImportImage[]): string {
  const lines: string[] = [
    "# Apply map import",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 1. Asset files",
    "Extract `atlas-assets.zip` at the repo root. It contains:",
    "",
    ...plan.assets.map((a) => {
      const img = images.find((i) => i.id === a.sourceImageId);
      return `- \`${a.targetPath}\` (${img?.bytes ?? 0} bytes, ${img?.naturalWidth ?? "?"}×${img?.naturalHeight ?? "?"})`;
    }),
    "",
    "## 2. world.yaml",
    "Open `content/<your-world>/_atlas/world.yaml` and merge the entries from",
    "`world-map-patch.yaml` into the top-level `maps:` list. Replace by id when",
    "the id already exists; append otherwise.",
    "",
    "## 3. Rebuild + commit",
    "",
    "    npm run atlas:build",
    "    git add public/atlas content",
    "    git commit -m \"atlas: import maps\"",
    "    git push",
    "",
    "## Maps in this patch",
    ...plan.maps.map((m) => `- **${m.name}** (\`${m.id}\`) — ${m.width}×${m.height}, ${m.layers.length} layer(s)`),
  ];
  return lines.join("\n");
}
