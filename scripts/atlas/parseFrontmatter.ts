import matter from "gray-matter";
import type { EntityVisibility } from "../../src/atlas/content/schema";

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
  date?: string;        // human-readable, e.g. "1247-03-12" or "Spring 1247"
  dateValue?: number;   // optional explicit numeric override for sorting
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
    type: typeof atlasRaw.type === "string" ? atlasRaw.type : undefined,
    world: typeof atlasRaw.world === "string" ? atlasRaw.world : undefined,
    visibility: undefined,
    aliases: toStringArray(atlasRaw.aliases),
    images: toStringArray(atlasRaw.images),
    summary: typeof atlasRaw.summary === "string" ? atlasRaw.summary : undefined,
    id: typeof atlasRaw.id === "string" ? atlasRaw.id : undefined,
    tags: toStringArray(atlasRaw.tags ?? data.tags),
    canon: typeof atlasRaw.canon === "string" ? atlasRaw.canon : undefined,
    date: typeof atlasRaw.date === "string" ? atlasRaw.date
        : (atlasRaw.date instanceof Date ? atlasRaw.date.toISOString().slice(0, 10) : undefined),
    dateValue: typeof atlasRaw.dateValue === "number" ? atlasRaw.dateValue : undefined,
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
