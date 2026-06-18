// AstrathDeeprealm Atlas — content schema (US-0001)
// Entities and placements are SEPARATE objects. A wiki entry is the primary
// object; a pin is only a placement of an entity on a map.

export type EntityVisibility = "player" | "dm" | "hidden" | "rumor";
export type CanonStatus = "canon" | "draft" | "rumor" | "deprecated" | "archived";

export interface AtlasProject {
  version: string;
  /**
   * world.yaml schema version this atlas was built against. Mirrors
   * `CURRENT_ATLAS_SCHEMA_VERSION` from scripts/atlas/schemaVersion.ts at
   * build time so player runtimes can detect incompatible artifacts.
   */
  schemaVersion?: number;
  publishedAt: string; // ISO timestamp
  changelog?: string;
  worlds: World[];
  maps: MapDocument[];
  entities: Entity[];
  placements: MapPlacement[];
  assets: AssetRef[];
  calendar?: WorldCalendar;
  buildReport?: BuildReport;
}

// In-world calendar for the timeline. Months sum to the year length.
export interface CalendarMonth {
  name: string;
  days: number;
}

export interface WorldCalendar {
  name?: string;
  epochName?: string;          // e.g. "After Sundering" -> rendered as "1247 AS"
  daysPerWeek?: number;
  months: CalendarMonth[];
}

export interface ImportFolderConfig {
  /** Maps entity `atlas.type` value → destination folder name (single safe path segment). */
  folders: Record<string, string>;
  /** Destination folder for unknown/typeless entities. */
  defaultFolder: string;
}

export interface CreditsConfig {
  badges?: boolean; // default true — show corner credit badge on entity images
  page?: boolean;   // default true — publish the /atlas/credits aggregate page
}

export interface World {
  id: string;
  name: string;
  defaultMapId?: string;
  importFolders?: ImportFolderConfig; // present in DM builds only; absent in player builds
  credits?: CreditsConfig;            // both default true when absent
}

export interface MapDocument {
  id: string;
  worldId: string;
  name: string;
  width: number;
  height: number;
  layers: MapLayer[];
  regions?: Region[];
  routes?: Route[];
  fog?: FogOverlay;
  scale?: MapScale;
  grid?: GridOverlay;
  oceanColor?: string;
  water?: WaterConfig;
  soundscape?: SoundscapeConfig;
  wrapX?: boolean;
}

export interface WaterConfig {
  enabled?: boolean;    // default true
  intensity?: number;   // 0..1, default 0.35 (gentle)
  speed?: number;       // 0..1, default 0.3 (slow)
  crestColor?: string;  // hex; default derived from oceanColor
}

/** One looping ambient bed. Two files so Safari (no Ogg) has a fallback. */
export interface SoundBed {
  /** Path under atlas/assets/audio/ (primary, e.g. .ogg). */
  src: string;
  /** Optional Safari-friendly twin (.mp3/.aac). */
  srcFallback?: string;
  /** Per-bed loudness, 0..1, default 0.7. */
  gain?: number;
}

/** A place that makes sound. Either borrows a region's shape (regionId) or
 *  carries its own polygon (points). Exactly one bed; zoom layering is by
 *  nesting smaller areas, not by multiple beds. */
export interface SoundArea {
  id: string;
  /** Ride-on: borrow this region's points + visibility. */
  regionId?: string;
  /** Sound-only zone: own polygon (used when regionId is absent). */
  points?: Point[];
  /** Sound-only zones only; ride-on areas inherit the region's visibility. */
  visibility?: EntityVisibility;
  /** Optional label (editor + credits). DM-strippable; never required to ship. */
  name?: string;
  bed: SoundBed;
}

/** Per-map soundscape config (sibling of `water`). */
export interface SoundscapeConfig {
  /** default true. false ⇒ no AudioContext, no control for this map. */
  enabled?: boolean;
  /** Overall loudness, 0..1, default 0.6. */
  masterGain?: number;
  areas?: SoundArea[];
}

export interface MapScale {
  unitsPerPixel: number;        // e.g. 0.05 means 1 px = 0.05 miles
  unitLabel: string;            // "mi" | "km" | "leagues" | ...
}

export type GridKind = "square" | "hex";

export interface GridOverlay {
  kind: GridKind;
  size: number;                 // cell size in map pixels
  color?: string;               // CSS color, default rgba(255,255,255,0.08)
  enabled?: boolean;            // default true
}

export type RouteMode = "foot" | "horse" | "ship" | "cart" | "fly" | "custom";

export interface Route {
  id: string;
  mapId: string;
  name: string;
  mode?: RouteMode;
  speed?: number;               // units per hour (uses MapScale unitLabel)
  color?: string;
  weight?: number;              // px stroke
  dashed?: boolean;
  visibility: EntityVisibility;
  // Each waypoint is either explicit coords or an entity id (resolved at build time).
  waypoints: Array<Point | { entityId: string }>;
  description?: string;
  // Resolved at build time:
  resolvedPoints?: Point[];
}

export type Point = [number, number]; // [x, y] in map coordinates (top-left origin)

export interface Region {
  id: string;
  mapId: string;
  name: string;
  entityId?: string;     // optional link to a wiki entity
  color?: string;        // CSS color, defaults derived from entity type
  fillOpacity?: number;
  strokeOpacity?: number;
  points: Point[];       // simple polygon (no holes)
  visibility: EntityVisibility;
}

export interface FogOverlay {
  mapId: string;
  enabled: boolean;
  color?: string;        // default rgba(0,0,0,0.55)
  reveals: Point[][];    // each polygon is a "hole" the players can see through
  conceals?: Point[][];  // "fog" polygons; subtract from reveals
  featherPx?: number;    // soft-edge band width, default applied by consumers
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
  type: string;          // settlement, region, npc, faction, event, ...
  world?: string;
  visibility: EntityVisibility;
  canon?: CanonStatus;
  aliases: string[];
  tags: string[];
  summary?: string;
  race?: string;
  images: string[];
  body: string;          // raw markdown (with DM blocks stripped for player builds in later batch)
  bodyHtml: string;      // rendered HTML with internal-link tokens
  frontmatter: Record<string, unknown>;
  sourcePath: string;
  links: ResolvedLink[];
  backlinks: { id: string; title: string }[];
  // Timeline support (Batch 7). dateRaw is human-readable; dateValue is a
  // sortable integer derived from the world calendar (or ISO date fallback).
  dateRaw?: string;
  dateValue?: number;
  dateYear?: number;
  /** DM/player profile fields. In player builds, only `profile.player` survives. */
  profile?: import("@/atlas/profiles/profileTypes").EntityProfile;
  /** Entity-to-entity relationships. Filtered by visibility in player builds. */
  relationships?: import("@/atlas/profiles/profileTypes").EntityRelationship[];
  /** Optional attribution string for the entity's images (e.g. "Portrait by Evelyn K, CC BY 4.0"). */
  credit?: string;
}

/** Per-placement pin styling overrides. Stored under atlas.placements[].pin in YAML.
 *  All keys are OPTIONAL — anything left unset inherits from the type-derived preset
 *  (see src/atlas/pins/presets.ts). The preset is the source of truth; YAML only
 *  stores what the DM explicitly changed, so frontmatter stays terse. */
export interface PinPlacementStyle {
  preset?: string;
  color?: string;
  icon?: string;
  shape?: "teardrop" | "circle" | "square" | "diamond" | "shield" | "star";
  labelMode?: "auto" | "always" | "never" | "hover";
  labelMinZoom?: number;
  priority?: number;
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
  /** Optional pin-styling overrides; renderer falls back to entity.type preset. */
  pin?: PinPlacementStyle;
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
  /** Renamed to unresolvedLinks. Kept for back-compat. */
  brokenLinks: number;
  /** Wikilinks pointing at notes that don't exist yet — allowed, not an error. */
  unresolvedLinks: number;
  duplicateSlugs: number;
  strippedDmBlocks: number;
  localAssets?: number;
  externalAssets?: number;
  missingAssets?: number;
}
