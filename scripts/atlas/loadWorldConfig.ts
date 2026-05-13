/**
 * Loads optional content/<world>/_atlas/world.yaml and merges into the project.
 * Schema (all keys optional):
 *
 *   maps:
 *     - id: foo
 *       name: ...
 *       width: 200000
 *       height: 100000
 *       oceanColor: "#18313f"
 *       layers:
 *         - { id, src, x, y, width, height, opacity?, zIndex? }
 *   regions:
 *     - { id, mapId, name, entityId?, color?, fillOpacity?, strokeOpacity?, visibility?, points: [[x,y]...] }
 *   fog:
 *     - { mapId, enabled, color?, reveals: [[[x,y]...], ...] }
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type {
  EntityVisibility,
  FogOverlay,
  MapDocument,
  MapLayer,
  Point,
  Region,
} from "../../src/atlas/content/schema";

const VALID_VIS: EntityVisibility[] = ["player", "dm", "hidden", "rumor"];

interface WorldYaml {
  maps?: Array<Partial<MapDocument> & { layers?: Array<Partial<MapLayer> & { src: string; id: string }> }>;
  regions?: Array<Partial<Region> & { id: string; mapId: string; name: string; points: Point[] }>;
  fog?: Array<Partial<FogOverlay> & { mapId: string; reveals?: Point[][]; enabled?: boolean }>;
}

export interface WorldConfig {
  maps: MapDocument[];
  regions: Region[];
  fogs: FogOverlay[];
  warnings: string[];
}

export function loadWorldConfig(contentRoot: string, worldId: string): WorldConfig | null {
  const file = path.join(contentRoot, worldId, "_atlas", "world.yaml");
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const data = (yaml.load(raw) ?? {}) as WorldYaml;
  const warnings: string[] = [];

  const maps: MapDocument[] = (data.maps ?? []).map((m, i) => {
    const id = m.id ?? `${worldId}-map-${i}`;
    return {
      id,
      worldId,
      name: m.name ?? id,
      width: m.width ?? 200000,
      height: m.height ?? 100000,
      oceanColor: m.oceanColor ?? "#18313f",
      wrapX: m.wrapX ?? false,
      layers: (m.layers ?? []).map((l, li) => ({
        id: l.id ?? `${id}-layer-${li}`,
        src: l.src,
        x: l.x ?? 0,
        y: l.y ?? 0,
        width: l.width ?? m.width ?? 200000,
        height: l.height ?? m.height ?? 100000,
        opacity: l.opacity ?? 1,
        zIndex: l.zIndex ?? li + 1,
        rotation: l.rotation,
        tileSrc: l.tileSrc,
      })),
    };
  });

  const regions: Region[] = (data.regions ?? []).map((r) => {
    const visibility = normalizeVis(r.visibility, warnings, `region "${r.id}"`);
    if (!Array.isArray(r.points) || r.points.length < 3) {
      warnings.push(`region "${r.id}" has fewer than 3 points — skipping`);
    }
    return {
      id: r.id,
      mapId: r.mapId,
      name: r.name,
      entityId: r.entityId,
      color: r.color,
      fillOpacity: r.fillOpacity ?? 0.18,
      strokeOpacity: r.strokeOpacity ?? 0.85,
      points: (r.points ?? []) as Point[],
      visibility,
    };
  }).filter((r) => r.points.length >= 3);

  const fogs: FogOverlay[] = (data.fog ?? []).map((f) => ({
    mapId: f.mapId,
    enabled: f.enabled !== false,
    color: f.color ?? "rgba(8, 12, 20, 0.55)",
    reveals: (f.reveals ?? []) as Point[][],
  }));

  return { maps, regions, fogs, warnings };
}

function normalizeVis(v: unknown, warnings: string[], where: string): EntityVisibility {
  if (typeof v === "string" && VALID_VIS.includes(v as EntityVisibility)) return v as EntityVisibility;
  if (v !== undefined) warnings.push(`${where}: invalid visibility "${v}", defaulting to "player"`);
  return "player";
}
