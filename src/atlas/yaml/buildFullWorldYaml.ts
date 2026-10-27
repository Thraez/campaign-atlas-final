/**
 * Emit a complete world.yaml body from in-memory editor state.
 *
 * Used by the unified Save (A13) so the editor can write `world.yaml` as
 * part of the same batch that updates entity .md files. The caller is
 * responsible for merging every per-tab draft (regions, routes, fog,
 * layers, map metadata) into the `maps` array BEFORE calling — this
 * function is pure: same input, same output, no React, no fetch.
 *
 * Round-tripping is pinned by build-full-world-yaml.test.ts: the output
 * parses cleanly through scripts/atlas/loadWorldConfig — the same loader
 * the build pipeline uses — so a Save can never write a YAML the build
 * can't read.
 *
 * Comment preservation is delegated to serializeWorldYaml — the leading
 * block of the existing file is re-prepended byte-for-byte (or a default
 * boilerplate header when there's no existing file).
 *
 * Top-level keys the editor doesn't own (see EDITOR_OWNED_KEYS) are read
 * from the existing file and written back unchanged, so a Save never drops
 * Sync's `import:` block or any other hand-written key.
 */
import yaml from "js-yaml";
import type {
  AssetCredit,
  CreditsConfig,
  FogOverlay,
  MapDocument,
  MapLayer,
  Region,
  Route,
  SoundscapeConfig,
  WaterConfig,
  WorldCalendar,
} from "@/atlas/content/schema";
import { DEFAULT_WATER } from "@/atlas/ocean/resolveWater";
import { fogToYamlObject } from "@/atlas/fog/useFogDraft";
import { regionToYamlObject } from "@/atlas/regions/useRegionDraft";
import { routeToYamlObject } from "@/atlas/routes/useRouteDraft";
import { dumpYaml } from "./dump";
import { serializeWorldYaml } from "./worldYamlSerialize";

export interface BuildFullWorldYamlOpts {
  /** Every map with its merged drafts already applied (layers, regions, routes, fog).
   *  The caller does the merge so this function stays pure. */
  maps: MapDocument[];
  /** Optional calendar from the current project. */
  calendar?: WorldCalendar;
  /** Schema version. When omitted, the field is left out and the loader's default applies. */
  schemaVersion?: number;
  /** Optional world display name. When present, serialized as a top-level `name:` field. */
  name?: string;
  /** Current on-disk file contents — used by serializeWorldYaml to preserve the leading comment block.
   *  Pass null when the file does not yet exist. */
  existing: string | null;
  /** Optional site-wide credits config. When present, serialized as a top-level `credits:` block. */
  credits?: CreditsConfig;
  /** Optional per-asset credit registry. Serialized in full (disabled entries
   *  included) — the player-build projection strips disabled/empty ones. */
  assetCredits?: Record<string, AssetCredit>;
}

/**
 * Top-level keys the editor owns: Save rewrites them from editor state (or
 * removes them when the editor has no value). `regions`, `fog` and `routes`
 * are the legacy top-level forms the loader folds into `maps[]`; the editor
 * writes them nested, so keeping the top-level copies would duplicate them.
 * Every other top-level key in the existing file (`import:`, anything the
 * editor doesn't model) is carried over unchanged.
 */
export const EDITOR_OWNED_KEYS: ReadonlySet<string> = new Set([
  "schemaVersion",
  "name",
  "maps",
  "calendar",
  "credits",
  "assetCredits",
  "regions",
  "fog",
  "routes",
]);

export function buildFullWorldYaml(opts: BuildFullWorldYamlOpts): string {
  const existingRoot = parseExistingRoot(opts.existing);
  const owned: Record<string, unknown> = {};
  if (opts.schemaVersion !== undefined) owned.schemaVersion = opts.schemaVersion;
  if (opts.name) owned.name = opts.name;
  owned.maps = opts.maps.map(mapToYamlObject);
  if (opts.calendar) owned.calendar = calendarToYamlObject(opts.calendar);
  // The loader always fills credits in (both flags true), so the projection
  // carries it even when the file doesn't. Don't write the default into a
  // file that didn't have the key.
  if (opts.credits && (!isDefaultCredits(opts.credits) || "credits" in existingRoot)) {
    owned.credits = creditsToYamlObject(opts.credits);
  }
  if (opts.assetCredits && Object.keys(opts.assetCredits).length > 0) {
    owned.assetCredits = assetCreditsToYamlObject(opts.assetCredits);
  }

  // Keep the existing file's key order: owned keys are replaced in place,
  // unknown keys pass through, new owned keys are appended.
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existingRoot)) {
    if (!EDITOR_OWNED_KEYS.has(key)) root[key] = value;
    else if (key in owned) root[key] = owned[key];
  }
  for (const [key, value] of Object.entries(owned)) {
    if (!(key in root)) root[key] = value;
  }
  const body = dumpYaml(root);
  return serializeWorldYaml(body, opts.existing);
}

/** Thrown when the on-disk world.yaml exists but can't be read as a YAML
 *  mapping. Save refuses rather than overwrite it: rebuilding from the editor
 *  alone would drop `import:` and every key the editor doesn't model. */
export class WorldYamlUnreadableError extends Error {
  constructor(detail: string) {
    super(
      `world.yaml on disk can't be read (${detail}). Fix it by hand before saving; ` +
        `saving now would drop the keys the editor doesn't manage, such as import:.`,
    );
    this.name = "WorldYamlUnreadableError";
  }
}

/** Parse the existing file's top-level mapping. An absent or empty file
 *  yields `{}` (nothing to carry over); a file that won't parse, or whose top
 *  level isn't a mapping, throws WorldYamlUnreadableError. */
function parseExistingRoot(existing: string | null): Record<string, unknown> {
  if (existing === null) return {};
  let data: unknown;
  try {
    data = yaml.load(existing);
  } catch (e) {
    throw new WorldYamlUnreadableError(e instanceof Error ? e.message : String(e));
  }
  if (data === null || data === undefined) return {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new WorldYamlUnreadableError("top level is not a mapping");
  }
  return data as Record<string, unknown>;
}

/** True when `c` is what the loader produces for an absent `credits:` key.
 *  The default is owned by `resolveCredits` in scripts/atlas/loadWorldConfig.ts
 *  (both flags true); src/ can't import that Node-side module, so keep this
 *  in step with it. Pinned by build-full-world-yaml.test.ts. */
function isDefaultCredits(c: CreditsConfig): boolean {
  return c.badges !== false && c.page !== false;
}

function mapToYamlObject(m: MapDocument): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: m.id,
    name: m.name,
    width: Math.round(m.width),
    height: Math.round(m.height),
  };
  if (m.oceanColor) out.oceanColor = m.oceanColor;
  out.wrapX = !!m.wrapX;
  if (m.scale) out.scale = { unitsPerPixel: m.scale.unitsPerPixel, unitLabel: m.scale.unitLabel };
  if (m.grid) out.grid = gridToYamlObject(m.grid);
  out.layers = m.layers.map(layerToYamlObject);
  if (m.regions && m.regions.length > 0) {
    out.regions = m.regions.map((r: Region) => regionToYamlObject(r));
  }
  if (m.routes && m.routes.length > 0) {
    out.routes = m.routes.map((r: Route) => routeToYamlObject(r));
  }
  if (m.fog && (m.fog.enabled || (m.fog.reveals?.length ?? 0) > 0)) {
    out.fog = fogToYamlObject(m.fog as FogOverlay);
  }
  if (m.water) out.water = waterToYamlObject(m.water);
  if (m.soundscape) out.soundscape = soundscapeToYamlObject(m.soundscape);
  return out;
}

function layerToYamlObject(l: MapLayer): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: l.id,
    src: l.src,
    x: Math.round(l.x),
    y: Math.round(l.y),
    width: Math.round(l.width),
    height: Math.round(l.height),
    opacity: l.opacity,
    zIndex: l.zIndex,
  };
  if (l.rotation !== undefined) out.rotation = l.rotation;
  if (l.tileSrc !== undefined) out.tileSrc = l.tileSrc;
  return out;
}

function gridToYamlObject(g: NonNullable<MapDocument["grid"]>): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: g.kind, size: g.size };
  if (g.color) out.color = g.color;
  if (g.enabled !== undefined) out.enabled = g.enabled;
  return out;
}

/** Omit fields equal to the defaults to keep world.yaml clean. */
function waterToYamlObject(w: WaterConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (w.enabled === false) out.enabled = false;
  else if (w.enabled === true) out.enabled = true;
  if (w.intensity !== undefined && w.intensity !== DEFAULT_WATER.intensity)
    out.intensity = w.intensity;
  if (w.speed !== undefined && w.speed !== DEFAULT_WATER.speed) out.speed = w.speed;
  if (w.crestColor) out.crestColor = w.crestColor;
  return out;
}

function soundscapeToYamlObject(s: SoundscapeConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.enabled === false) out.enabled = false;
  else if (s.enabled === true) out.enabled = true;
  if (s.masterGain !== undefined) out.masterGain = s.masterGain;
  if (s.areas && s.areas.length > 0) {
    out.areas = s.areas.map((a) => {
      const area: Record<string, unknown> = {
        id: a.id,
        bed: {
          src: a.bed.src,
          ...(a.bed.srcFallback ? { srcFallback: a.bed.srcFallback } : {}),
          ...(a.bed.gain !== undefined ? { gain: a.bed.gain } : {}),
        },
      };
      if (a.regionId) area.regionId = a.regionId;
      if (a.points && a.points.length > 0) area.points = a.points;
      if (a.visibility) area.visibility = a.visibility;
      if (a.name) area.name = a.name;
      return area;
    });
  }
  return out;
}

function calendarToYamlObject(c: WorldCalendar): Record<string, unknown> {
  const out: Record<string, unknown> = {
    months: c.months.map((m) => ({ name: m.name, days: m.days })),
  };
  if (c.name) out.name = c.name;
  if (c.epochName) out.epochName = c.epochName;
  if (c.daysPerWeek !== undefined) out.daysPerWeek = c.daysPerWeek;
  return out;
}

function creditsToYamlObject(c: CreditsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.badges !== undefined) out.badges = c.badges;
  if (c.page !== undefined) out.page = c.page;
  return out;
}

/** Serialize the per-asset registry in full (including disabled entries — the
 *  DM's text is preserved on disk). Player-safety stripping happens in the
 *  build projection, not here. */
function assetCreditsToYamlObject(reg: Record<string, AssetCredit>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [src, c] of Object.entries(reg)) {
    out[src] = { credit: c.credit, enabled: c.enabled };
  }
  return out;
}
