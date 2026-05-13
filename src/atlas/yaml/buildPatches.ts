/**
 * Unified patch engine.
 *
 * Every DM editor surface (placement editor, layer panel, map settings panel,
 * future entity-frontmatter editor) routes through these builders so we have
 * ONE source of YAML formatting + ONE validation pipeline.
 *
 * Each builder returns a {@link PatchArtifact} that the central
 * {@link ../ExportChangesModal} can preview, validate, and download — no
 * component should hand-roll YAML lines anymore.
 */

import type {
  AtlasProject,
  EntityVisibility,
  MapDocument,
  MapLayer,
  Region,
  Route,
} from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import { dumpYaml, patchHeader } from "./dump";

export type PatchKindId =
  | "placement"
  | "world-map"
  | "entity-frontmatter"
  | "asset-manifest"
  | "publish-report";

export interface PatchArtifact {
  kind: PatchKindId;
  filename: string;
  mime: string;
  /** Final downloadable text (or JSON for the report/manifest). */
  content: string;
  /** Human-readable summary lines shown in the modal. */
  summary: string[];
  /** Optional per-section breakdown for the "advanced raw YAML preview". */
  sections?: Array<{ label: string; yaml: string }>;
  /** Asset paths referenced by this patch (used by the manifest). */
  assets?: AssetManifestEntry[];
}

export interface AssetManifestEntry {
  filename: string;
  /** Where the file should live in the repo. */
  targetPath: string;
  /** "upload" = browser-only; user must include the zip. "external" = remote URL.
   *  "missing" = referenced but not present in the build. */
  source: "upload" | "external" | "missing" | "local";
  warning?: string;
}

// --------------------------------------------------------------------------
// 1. ENTITY FRONTMATTER PATCHES (placements, images, summary, type, …)
// --------------------------------------------------------------------------

export interface PlacementOverride {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
  /** Optional label override (defaults to entity.title at render time). */
  label?: string;
  /** Optional pin styling — only diff vs. the type preset is emitted. */
  pin?: import("@/atlas/pins/presets").PinOverride;
}

export interface BuildPlacementPatchOpts {
  project: AtlasProject;
  mapId: string;
  /** Final effective coords per entity for this map (drafts already merged). */
  placements: PlacementOverride[];
}

export function buildPlacementPatch(opts: BuildPlacementPatchOpts): PatchArtifact {
  const { project, mapId, placements } = opts;
  const map = project.maps.find((m) => m.id === mapId);
  const mapName = map?.name ?? mapId;
  const sections: Array<{ label: string; yaml: string }> = [];
  const bodyParts: string[] = [];

  for (const p of placements) {
    const entity = project.entities.find((e) => e.id === p.entityId);
    if (!entity) continue;
    const placement: Record<string, unknown> = { mapId: p.mapId, x: p.x, y: p.y };
    if (p.label && p.label !== entity.title) placement.label = p.label;
    if (p.pin && Object.keys(p.pin).length > 0) placement.pin = p.pin;
    const yamlBlock = dumpYaml({ atlas: { placements: [placement] } });
    sections.push({ label: `${entity.title} → ${entity.sourcePath || entity.id}`, yaml: yamlBlock });
    bodyParts.push(`# entity: ${entity.title}`);
    bodyParts.push(`# file:   ${entity.sourcePath || entity.id}`);
    bodyParts.push(yamlBlock.trimEnd());
    bodyParts.push("");
  }

  const header = patchHeader({
    title: `Entity placement patch — ${mapName}`,
    subject: `atlas.placements on ${placements.length} entit${placements.length === 1 ? "y" : "ies"}`,
    applyTo: "the matching entity .md frontmatter (one block per entity below)",
    notes: [
      "Each block REPLACES the entity's existing atlas.placements (or legacy atlas.x / atlas.y).",
      `Or run: npm run atlas:apply-placements -- placements-${mapId}.json`,
    ],
  });

  return {
    kind: "placement",
    filename: `placements-patch-${mapId}.yaml`,
    mime: "text/yaml",
    content: header + bodyParts.join("\n"),
    summary: [
      `${placements.length} entity placement${placements.length === 1 ? "" : "s"} on "${mapName}"`,
    ],
    sections,
  };
}

/** Companion JSON used by `atlas:apply-placements`. */
export function buildPlacementJson(opts: BuildPlacementPatchOpts): PatchArtifact {
  const { project, mapId, placements } = opts;
  const merged = placements
    .map((p) => {
      const e = project.entities.find((x) => x.id === p.entityId);
      return e ? { entityId: e.id, sourcePath: e.sourcePath, mapId: p.mapId, x: p.x, y: p.y } : null;
    })
    .filter(Boolean);
  return {
    kind: "placement",
    filename: `placements-${mapId}.json`,
    mime: "application/json",
    content: JSON.stringify(merged, null, 2),
    summary: [`${merged.length} placement${merged.length === 1 ? "" : "s"} (machine-readable)`],
  };
}

// --------------------------------------------------------------------------
// 1b. ENTITY FRONTMATTER PATCH (full atlas: block, used by import wizard)
// --------------------------------------------------------------------------

export interface EntityFrontmatterPatch {
  /** Source-relative path to the .md file (e.g. "settlements/Sunhaven.md"). */
  sourcePath: string;
  /** Title written to the file's top-level `title:` if missing. */
  title?: string;
  /** Suggested atlas: block. Keys are written in canonical order. */
  atlas: {
    id?: string;
    type?: string;
    visibility?: EntityVisibility;
    publish?: boolean;
    summary?: string;
    aliases?: string[];
    images?: string[];
    tags?: string[];
    profile?: import("@/atlas/profiles/profileTypes").EntityProfile;
    relationships?: import("@/atlas/profiles/profileTypes").EntityRelationship[];
  };
}

export function buildEntityFrontmatterPatch(patches: EntityFrontmatterPatch[]): PatchArtifact {
  const sections: Array<{ label: string; yaml: string }> = [];
  const bodyParts: string[] = [];

  for (const p of patches) {
    const top: Record<string, unknown> = {};
    if (p.title) top.title = p.title;
    // Strip undefined keys so dumpYaml emits a clean block.
    const atlas: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p.atlas)) {
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) atlas[k] = v;
    }
    top.atlas = atlas;
    const ymlBlock = dumpYaml(top);
    sections.push({ label: p.sourcePath, yaml: ymlBlock });
    bodyParts.push(`# file: ${p.sourcePath}`);
    bodyParts.push("---");
    bodyParts.push(ymlBlock.trimEnd());
    bodyParts.push("---");
    bodyParts.push("");
  }

  const header = patchHeader({
    title: `Entity frontmatter patch — ${patches.length} file${patches.length === 1 ? "" : "s"}`,
    subject: `frontmatter on ${patches.length} entity .md file${patches.length === 1 ? "" : "s"}`,
    applyTo: "the matching entity .md file (replace its existing frontmatter block)",
    notes: [
      "Each '# file:' section below is a complete YAML frontmatter block.",
      "Replace the file's existing '---' frontmatter (top of file) with the block here.",
      "If the file has no frontmatter yet, paste the entire '---' block at the very top.",
    ],
  });

  return {
    kind: "entity-frontmatter",
    filename: `entity-frontmatter-patch-${patches.length}.yaml`,
    mime: "text/yaml",
    content: header + bodyParts.join("\n"),
    summary: [
      `Frontmatter for ${patches.length} entity file${patches.length === 1 ? "" : "s"}`,
    ],
    sections,
  };
}
// --------------------------------------------------------------------------
// 2. WORLD YAML PATCH (maps + layers + grid + scale + ocean + wrapX)
// --------------------------------------------------------------------------

export interface BuildWorldMapPatchOpts {
  /** The merged, edited map (source of truth for the patch). */
  map: MapDocument;
  /** Effective merged layers (built-in + local overrides + uploads). */
  mergedLayers: MapLayer[];
  /** Local-only layers (used to resolve upload target paths). */
  localLayers: LocalLayer[];
  /** Optional regions/routes/fog overrides — passed through if present. */
  regions?: Region[];
  routes?: Route[];
}

export function buildWorldMapPatch(opts: BuildWorldMapPatchOpts): PatchArtifact {
  const { map, mergedLayers, localLayers } = opts;
  const assets: AssetManifestEntry[] = [];

  // Resolve layer src — uploads point at their target repo path.
  const layerObjs = mergedLayers.map((l) => {
    const local = localLayers.find((x) => x.id === l.id);
    let src = l.src;
    if (local?.origin === "upload") {
      const target = local.targetPath ?? `public/atlas/assets/maps/${l.id}.webp`;
      src = "/" + target.replace(/^public\//, "");
      assets.push({
        filename: local.filename ?? l.id,
        targetPath: target,
        source: "upload",
        warning: "Browser-only upload — must be added to the asset zip.",
      });
    } else if (/^https?:\/\//i.test(src)) {
      assets.push({
        filename: src.split("/").pop() ?? src,
        targetPath: src,
        source: "external",
        warning: "External URL — will not work offline in player builds.",
      });
    }
    return {
      id: l.id,
      src,
      x: Math.round(l.x),
      y: Math.round(l.y),
      width: Math.round(l.width),
      height: Math.round(l.height),
      opacity: l.opacity,
      zIndex: l.zIndex,
    };
  });

  // ID dedup invariants
  const layerIds = new Set<string>();
  for (const l of layerObjs) {
    if (layerIds.has(l.id)) {
      throw new Error(`Duplicate layer id "${l.id}" in map "${map.id}" — patch refused.`);
    }
    layerIds.add(l.id);
  }

  const mapEntry: Record<string, unknown> = {
    id: map.id,
    name: map.name,
    width: Math.round(map.width),
    height: Math.round(map.height),
  };
  if (map.oceanColor) mapEntry.oceanColor = map.oceanColor;
  mapEntry.wrapX = !!map.wrapX;
  if (map.scale) mapEntry.scale = map.scale;
  if (map.grid) mapEntry.grid = map.grid;
  mapEntry.layers = layerObjs;
  if (opts.regions?.length) mapEntry.regions = opts.regions;
  if (opts.routes?.length) mapEntry.routes = opts.routes;

  const yamlBlock = dumpYaml({ maps: [mapEntry] });

  const header = patchHeader({
    title: `World map patch — ${map.name} (${map.id})`,
    subject: `world.yaml > maps[id=${map.id}]`,
    applyTo: `content/<world>/_atlas/world.yaml (replace the matching map entry)`,
    notes: [
      "Preserves your unrelated maps[]/regions[]/routes[]/fog[]/calendar sections —",
      "only this map's entry is replaced.",
      assets.some((a) => a.source === "upload")
        ? `Asset checklist: ${assets.filter((a) => a.source === "upload").length} upload(s) — see asset manifest.`
        : "",
    ].filter(Boolean),
  });

  const summary: string[] = [
    `Map "${map.name}" — ${layerObjs.length} layer${layerObjs.length === 1 ? "" : "s"}, ${map.width}×${map.height}`,
  ];
  if (assets.length) summary.push(`${assets.length} asset reference${assets.length === 1 ? "" : "s"}`);

  return {
    kind: "world-map",
    filename: `world-map-${map.id}.yaml`,
    mime: "text/yaml",
    content: header + yamlBlock,
    summary,
    sections: [{ label: `maps[${map.id}]`, yaml: yamlBlock }],
    assets,
  };
}

// --------------------------------------------------------------------------
// 3. ASSET PATCH MANIFEST
// --------------------------------------------------------------------------

export function buildAssetManifest(entries: AssetManifestEntry[]): PatchArtifact {
  const lines: string[] = [
    "# Asset manifest",
    `# Generated ${new Date().toISOString()}`,
    "#",
    "# Files referenced by the world.yaml patch above. Browser uploads must be",
    "# added to the repo at the listed targetPath; external URLs work but won't",
    "# survive offline player builds; missing assets will fail the build.",
    "",
  ];
  const grouped: Record<string, AssetManifestEntry[]> = { upload: [], external: [], missing: [], local: [] };
  for (const a of entries) grouped[a.source].push(a);

  for (const [k, arr] of Object.entries(grouped)) {
    if (!arr.length) continue;
    lines.push(`${k}:`);
    for (const a of arr) {
      lines.push(`  - filename: "${a.filename}"`);
      lines.push(`    targetPath: "${a.targetPath}"`);
      if (a.warning) lines.push(`    warning: "${a.warning.replace(/"/g, '\\"')}"`);
    }
    lines.push("");
  }

  return {
    kind: "asset-manifest",
    filename: "asset-manifest.yaml",
    mime: "text/yaml",
    content: lines.join("\n"),
    summary: [
      `${grouped.upload.length} upload(s) needed in repo`,
      `${grouped.external.length} external URL(s)`,
      `${grouped.missing.length} missing asset(s)`,
    ].filter((l) => !l.startsWith("0 ")),
    assets: entries,
  };
}

// --------------------------------------------------------------------------
// 4. PUBLISH REPORT
// --------------------------------------------------------------------------

export function buildPublishReport(opts: {
  project: AtlasProject;
  artifacts: PatchArtifact[];
  issueCount: { blocking: number; warning: number; suggestion: number };
}): PatchArtifact {
  const lines: string[] = [
    "# Publish report",
    `# Generated ${new Date().toISOString()}`,
    "",
    `Project version: ${opts.project.version}`,
    `Maps: ${opts.project.maps.length}`,
    `Entities: ${opts.project.entities.length}`,
    `Placements: ${opts.project.placements.length}`,
    "",
    "Validation:",
    `  blocking:   ${opts.issueCount.blocking}`,
    `  warning:    ${opts.issueCount.warning}`,
    `  suggestion: ${opts.issueCount.suggestion}`,
    "",
    "Artifacts:",
    ...opts.artifacts.map((a) => `  - ${a.filename} (${a.kind})`),
  ];
  return {
    kind: "publish-report",
    filename: "publish-report.txt",
    mime: "text/plain",
    content: lines.join("\n"),
    summary: [`${opts.artifacts.length} artifact(s) bundled`],
  };
}
