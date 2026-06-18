import matter from "gray-matter";
import type { EntityVisibility, PinPlacementStyle } from "../../src/atlas/content/schema";
import type { EntityProfile, EntityRelationship } from "../../src/atlas/profiles/profileTypes";

export interface AtlasPlacementSpec {
  mapId?: string;
  x: number;
  y: number;
  /** Optional per-placement label override (defaults to entity.title). */
  label?: string;
  /** Optional per-placement pin styling override (preset/color/icon/...). */
  pin?: PinPlacementStyle;
}

export interface AtlasFrontmatter {
  publish?: boolean;
  type?: string;
  world?: string;
  visibility?: EntityVisibility;
  aliases?: string[];
  images?: string[];
  summary?: string;
  id?: string;
  tags?: string[];
  canon?: string;
  date?: string;
  dateValue?: number;
  /** Multi-map placements. Wins over legacy x/y when present. */
  placements?: AtlasPlacementSpec[];
  profile?: EntityProfile;
  relationships?: EntityRelationship[];
  race?: string;
  credit?: string;
}

export interface ParsedFile {
  data: Record<string, unknown>;
  atlas: AtlasFrontmatter;
  body: string;
  warnings: string[];
}

const VALID_VIS: EntityVisibility[] = ["player", "dm", "hidden", "rumor"];

export function parseFrontmatter(raw: string, sourcePath: string): ParsedFile {
  const warnings: string[] = [];
  const fm = matter(raw);
  const data = (fm.data ?? {}) as Record<string, unknown>;
  const atlasRaw = (data.atlas ?? {}) as Record<string, unknown>;

  const atlas: AtlasFrontmatter = {
    publish: typeof atlasRaw.publish === "boolean" ? atlasRaw.publish : undefined,
    type: pickString(atlasRaw.type, data.type),
    world: typeof atlasRaw.world === "string" ? atlasRaw.world : undefined,
    visibility: undefined,
    aliases: toStringArray(atlasRaw.aliases ?? data.aliases),
    images: toStringArray(atlasRaw.images),
    summary: pickString(atlasRaw.summary, data.summary),
    id: typeof atlasRaw.id === "string" ? atlasRaw.id : undefined,
    tags: toStringArray(atlasRaw.tags ?? data.tags),
    canon: typeof atlasRaw.canon === "string" ? atlasRaw.canon : undefined,
    date: typeof atlasRaw.date === "string" ? atlasRaw.date
        : (atlasRaw.date instanceof Date ? atlasRaw.date.toISOString().slice(0, 10) : undefined),
    dateValue: typeof atlasRaw.dateValue === "number" ? atlasRaw.dateValue : undefined,
    placements: parsePlacements(atlasRaw.placements, sourcePath, warnings),
    profile: parseProfile(atlasRaw.profile, sourcePath, warnings),
    relationships: parseRelationships(atlasRaw.relationships, sourcePath, warnings),
    race: pickString(atlasRaw.race, data.race),
    credit: typeof atlasRaw.credit === "string" && atlasRaw.credit.trim().length > 0
      ? atlasRaw.credit.trim() : undefined,
  };

  if (typeof atlasRaw.visibility === "string") {
    if (VALID_VIS.includes(atlasRaw.visibility as EntityVisibility)) {
      atlas.visibility = atlasRaw.visibility as EntityVisibility;
    } else {
      // Fail-safe: spoiler protection beats convenience. Invalid visibility
      // values must NOT silently fall through to the player default.
      atlas.visibility = "dm";
      warnings.push(
        `${sourcePath}: invalid atlas.visibility "${atlasRaw.visibility}" — defaulted to "dm"`
      );
    }
  }

  return { data, atlas, body: fm.content, warnings };
}

function toStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string") return [v];
  return [];
}

// First non-empty string among candidates. Used to let vault files keep flat
// top-level keys (summary, type, race, ...) without requiring atlas.* nesting.
function pickString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c;
  }
  return undefined;
}

function parsePlacements(v: unknown, sourcePath: string, warnings: string[]): AtlasPlacementSpec[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    warnings.push(`${sourcePath}: atlas.placements must be an array — ignored`);
    return undefined;
  }
  const out: AtlasPlacementSpec[] = [];
  for (let i = 0; i < v.length; i++) {
    const p = v[i] as Record<string, unknown> | null;
    if (!p || typeof p !== "object") {
      warnings.push(`${sourcePath}: atlas.placements[${i}] is not an object — skipped`);
      continue;
    }
    if (typeof p.x !== "number" || typeof p.y !== "number") {
      warnings.push(`${sourcePath}: atlas.placements[${i}] missing numeric x/y — skipped`);
      continue;
    }
    out.push({
      mapId: typeof p.mapId === "string" ? p.mapId : undefined,
      x: p.x,
      y: p.y,
      label: typeof p.label === "string" ? p.label : undefined,
      pin: parsePinStyle(p.pin, sourcePath, i, warnings),
    });
  }
  return out.length > 0 ? out : undefined;
}

const VALID_SHAPES = new Set(["teardrop", "circle", "square", "diamond", "shield", "star"]);
const VALID_LABEL_MODES = new Set(["auto", "always", "never", "hover"]);

function parsePinStyle(v: unknown, sourcePath: string, idx: number, warnings: string[]): PinPlacementStyle | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object") {
    warnings.push(`${sourcePath}: atlas.placements[${idx}].pin must be an object — ignored`);
    return undefined;
  }
  const r = v as Record<string, unknown>;
  const out: PinPlacementStyle = {};
  if (typeof r.preset === "string") out.preset = r.preset;
  if (typeof r.color === "string") out.color = r.color;
  if (typeof r.icon === "string") out.icon = r.icon;
  if (typeof r.shape === "string" && VALID_SHAPES.has(r.shape)) out.shape = r.shape as PinPlacementStyle["shape"];
  if (typeof r.labelMode === "string" && VALID_LABEL_MODES.has(r.labelMode)) out.labelMode = r.labelMode as PinPlacementStyle["labelMode"];
  if (typeof r.labelMinZoom === "number") out.labelMinZoom = r.labelMinZoom;
  if (typeof r.priority === "number") {
    if (r.priority < 0 || r.priority > 10) {
      warnings.push(`${sourcePath}: atlas.placements[${idx}].pin.priority out of range 0..10 — clamped`);
      out.priority = Math.max(0, Math.min(10, r.priority));
    } else {
      out.priority = r.priority;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseProfile(v: unknown, sourcePath: string, warnings: string[]): EntityProfile | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) {
    warnings.push(`${sourcePath}: atlas.profile must be an object — ignored`);
    return undefined;
  }
  const r = v as Record<string, unknown>;
  const out: EntityProfile = {};
  if (r.player && typeof r.player === "object" && !Array.isArray(r.player)) {
    const p = r.player as Record<string, unknown>;
    const player: EntityProfile["player"] = {};
    if (typeof p.known_for === "string") player.known_for = p.known_for;
    const traits = toStringArray(p.visible_traits);
    if (traits.length) player.visible_traits = traits;
    const rumors = toStringArray(p.rumors);
    if (rumors.length) player.rumors = rumors;
    if (Object.keys(player).length > 0) out.player = player;
  }
  if (r.dm && typeof r.dm === "object" && !Array.isArray(r.dm)) {
    const d = r.dm as Record<string, unknown>;
    const dm: Record<string, string> = {};
    for (const [k, val] of Object.entries(d)) {
      if (typeof val === "string" && val.trim() !== "") dm[k] = val;
    }
    if (Object.keys(dm).length > 0) out.dm = dm;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseRelationships(v: unknown, sourcePath: string, warnings: string[]): EntityRelationship[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    warnings.push(`${sourcePath}: atlas.relationships must be an array — ignored`);
    return undefined;
  }
  const out: EntityRelationship[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = v[i] as Record<string, unknown> | null;
    if (!r || typeof r !== "object") {
      warnings.push(`${sourcePath}: atlas.relationships[${i}] is not an object — skipped`);
      continue;
    }
    if (typeof r.entity !== "string" || !r.entity.trim()) {
      warnings.push(`${sourcePath}: atlas.relationships[${i}] missing entity id — skipped`);
      continue;
    }
    if (typeof r.type !== "string" || !r.type.trim()) {
      warnings.push(`${sourcePath}: atlas.relationships[${i}] missing type — skipped`);
      continue;
    }
    let visibility: EntityVisibility = "dm";
    if (typeof r.visibility === "string") {
      if (VALID_VIS.includes(r.visibility as EntityVisibility)) {
        visibility = r.visibility as EntityVisibility;
      } else {
        warnings.push(`${sourcePath}: atlas.relationships[${i}] invalid visibility "${r.visibility}" — defaulted to "dm"`);
      }
    }
    out.push({
      entity: r.entity.trim(),
      type: r.type.trim(),
      label: typeof r.label === "string" ? r.label : undefined,
      description: typeof r.description === "string" ? r.description : undefined,
      visibility,
    });
  }
  return out.length > 0 ? out : undefined;
}
