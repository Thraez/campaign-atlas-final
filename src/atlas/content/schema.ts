// AstrathDeeprealm Atlas — content schema (US-0001)
// Entities and placements are SEPARATE objects. A wiki entry is the primary
// object; a pin is only a placement of an entity on a map.

export type EntityVisibility = "player" | "dm" | "hidden" | "rumor";
export type CanonStatus = "canon" | "draft" | "rumor" | "deprecated" | "archived";

export interface AtlasProject {
  version: string;
  publishedAt: string; // ISO timestamp
  changelog?: string;
  worlds: World[];
  maps: MapDocument[];
  entities: Entity[];
  placements: MapPlacement[];
  assets: AssetRef[];
  buildReport?: BuildReport;
}

export interface World {
  id: string;
  name: string;
  defaultMapId?: string;
}

export interface MapDocument {
  id: string;
  worldId: string;
  name: string;
  width: number;
  height: number;
  layers: MapLayer[];
  oceanColor?: string;
  wrapX?: boolean;
}

export interface MapLayer {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  zIndex: number;
  rotation?: number;
  tileSrc?: string;
}

export interface ResolvedLink {
  target: string; // raw target text from [[...]]
  resolvedId?: string; // resolved entity id when known
  display: string;
  broken: boolean;
}

export interface Entity {
  id: string;            // stable slug
  title: string;
  type: string;          // settlement, region, npc, faction, ...
  world?: string;
  visibility: EntityVisibility;
  canon?: CanonStatus;
  aliases: string[];
  tags: string[];
  summary?: string;
  images: string[];
  body: string;          // raw markdown (with DM blocks stripped for player builds in later batch)
  bodyHtml: string;      // rendered HTML with internal-link tokens
  frontmatter: Record<string, unknown>;
  sourcePath: string;
  links: ResolvedLink[];
  backlinks: { id: string; title: string }[];
}

export interface MapPlacement {
  id: string;
  entityId: string;
  mapId: string;
  x: number;
  y: number;
  icon?: string;
  label?: string;
  visibility: EntityVisibility;
}

export interface AssetRef {
  id: string;
  src: string;
  type: "image" | "other";
}

export interface BuildReport {
  scanned: number;
  included: number;
  excluded: number;
  warnings: string[];
  brokenLinks: number;
  duplicateSlugs: number;
  strippedDmBlocks: number;
}
