/**
 * Browser-side Obsidian markdown parser for the import wizard.
 *
 * Goals:
 *  - Tolerant: never throw on malformed frontmatter; surface as a warning.
 *  - Pure: no I/O; takes raw text + relative path.
 *  - Mirrors the build script's frontmatter contract so imported files can
 *    later be committed to the vault and re-built without surprises.
 */

import type { EntityVisibility } from "@/atlas/content/schema";
import { parseFrontmatter } from "./frontmatter";
import { inferTypeFromPath, isIgnoredPath } from "./inferType";

export type ImportLevel =
  | "ignored"          // folder excluded → never imported
  | "wiki-only"        // entity, no map placement
  | "placeable"        // can be placed on a map (DM-side)
  | "player-published"; // included in player build (visibility allows)

const VALID_VIS: EntityVisibility[] = ["player", "dm", "hidden", "rumor"];

export interface WikilinkRef {
  target: string;
  display: string;
  /** True if the target couldn't be matched against the known entity set. */
  broken?: boolean;
}

export interface AttachmentRef {
  rawSrc: string;
  /** Suggested target path under public/atlas/assets/. */
  suggestedTarget: string;
  resolved: boolean;
}

export interface ImportedFile {
  relPath: string;
  filename: string;
  /** Slug derived from filename (matches build script behavior). */
  suggestedId: string;
  title: string;
  level: ImportLevel;

  /** What we found in YAML, untouched. */
  rawFrontmatter: Record<string, unknown>;
  hasFrontmatter: boolean;
  frontmatterError?: string;

  /** Inferred / safe-defaulted values used for the suggested patch. */
  inferredType: string;
  effectiveVisibility: EntityVisibility;
  visibilityWasInvalid?: boolean;
  visibilityWasMissing?: boolean;

  suggestedSummary?: string;
  summaryWasGenerated: boolean;

  wikilinks: WikilinkRef[];
  attachments: AttachmentRef[];

  /** Notes shown in the import UI. Don't block import. */
  warnings: string[];
}

const WIKILINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

function safeFilenameToTitle(name: string): string {
  return name.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Generate a one-paragraph summary from the first meaningful prose. */
export function generateAutoSummary(body: string, maxLen = 220): string | undefined {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, "")           // fenced code
    .replace(/`[^`\n]+`/g, "")                 // inline code
    .replace(/<!--[\s\S]*?-->/g, "")           // HTML comments
    .replace(/%%[\s\S]*?%%/g, "")              // Obsidian comments
    .replace(/<[^>]+>/g, "")                   // raw HTML
    .replace(/!\[\[[^\]]+\]\]/g, "")           // embeds
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")      // md images
    .replace(/^\s*>\s?\[!.+?\][\s\S]*?(?=\n\n|$)/gm, "") // callouts
    .replace(/^\s*>.*$/gm, "")                 // blockquotes
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, "")      // headings
    .replace(/^\s*[-*+]\s+/gm, "")             // list markers
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, d) => (d ?? t).trim())
    .replace(/\*\*?([^*]+)\*\*?/g, "$1");

  for (const block of cleaned.split(/\n{2,}/)) {
    const trimmed = block.replace(/\s+/g, " ").trim();
    if (trimmed.length < 20) continue;
    if (trimmed.length <= maxLen) return trimmed;
    const cut = trimmed.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]?$/, "") + "…";
  }
  return undefined;
}

function extractWikilinks(body: string): WikilinkRef[] {
  const out: WikilinkRef[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(WIKILINK_RE)) {
    // Skip embeds (![[...]]).
    const before = body[m.index! - 1];
    if (before === "!") continue;
    const target = m[1].trim();
    const display = (m[2] ?? target).trim();
    const key = `${target}|${display}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ target, display });
  }
  return out;
}

function extractAttachments(body: string): AttachmentRef[] {
  const out: AttachmentRef[] = [];
  const push = (src: string) => {
    const rawSrc = src.trim();
    if (!rawSrc || /^https?:\/\//i.test(rawSrc) || /^\//.test(rawSrc)) {
      out.push({ rawSrc, suggestedTarget: rawSrc, resolved: /^https?:\/\//i.test(rawSrc) });
      return;
    }
    const filename = rawSrc.split("/").pop() ?? rawSrc;
    const suggestedTarget = `public/atlas/assets/images/${slugify(filename.replace(/\.[^.]+$/, ""))}${(filename.match(/\.[^.]+$/) ?? [""])[0]}`;
    out.push({ rawSrc, suggestedTarget, resolved: false });
  };
  for (const m of body.matchAll(EMBED_RE)) push(m[1]);
  for (const m of body.matchAll(MD_IMAGE_RE)) push(m[1]);
  // dedupe
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.rawSrc) ? false : (seen.add(a.rawSrc), true)));
}

export interface ParseObsidianOpts {
  /** Optional set of known entity ids/aliases for wikilink resolution. */
  knownEntityNames?: Set<string>;
}

export function parseObsidianFile(
  raw: string,
  relPath: string,
  opts: ParseObsidianOpts = {}
): ImportedFile {
  const filename = relPath.split(/[\\/]/).pop() ?? relPath;
  const ignored = isIgnoredPath(relPath);

  let data: Record<string, unknown> = {};
  let body = raw;
  let frontmatterError: string | undefined;
  let hasFrontmatter = false;
  try {
    const fm = parseFrontmatter(raw);
    data = fm.data;
    body = fm.content;
    hasFrontmatter = Object.keys(data).length > 0;
  } catch (e) {
    frontmatterError = e instanceof Error ? e.message : String(e);
  }

  const atlas = (data.atlas ?? {}) as Record<string, unknown>;
  const explicitType = typeof atlas.type === "string" ? atlas.type : undefined;
  const inferredType = explicitType ?? inferTypeFromPath(relPath);

  const visRaw = typeof atlas.visibility === "string" ? atlas.visibility : undefined;
  let effectiveVisibility: EntityVisibility = "dm"; // safe default
  let visibilityWasInvalid = false;
  let visibilityWasMissing = false;
  if (!visRaw) {
    visibilityWasMissing = true;
    if (atlas.publish === true) effectiveVisibility = "player";
  } else if (VALID_VIS.includes(visRaw as EntityVisibility)) {
    effectiveVisibility = visRaw as EntityVisibility;
  } else {
    visibilityWasInvalid = true;
    effectiveVisibility = "dm";
  }

  const explicitSummary = typeof atlas.summary === "string" ? atlas.summary : undefined;
  const suggestedSummary = explicitSummary ?? generateAutoSummary(body);
  const summaryWasGenerated = !explicitSummary && !!suggestedSummary;

  const wikilinks = extractWikilinks(body);
  if (opts.knownEntityNames) {
    for (const w of wikilinks) {
      const key = w.target.toLowerCase();
      if (!opts.knownEntityNames.has(key)) w.broken = true;
    }
  }
  const attachments = extractAttachments(body);

  const title =
    typeof data.title === "string" ? data.title : safeFilenameToTitle(filename);
  const suggestedId =
    typeof atlas.id === "string" ? atlas.id : slugify(title);

  // Classify import level.
  let level: ImportLevel = "wiki-only";
  if (ignored) level = "ignored";
  else if (effectiveVisibility === "player" || atlas.publish === true) level = "player-published";
  else if (mappableTypes.has(inferredType)) level = "placeable";

  const warnings: string[] = [];
  if (frontmatterError) warnings.push(`Frontmatter parse error: ${frontmatterError}`);
  if (visibilityWasInvalid) warnings.push(`Invalid visibility "${visRaw}" → defaulted to dm`);
  if (visibilityWasMissing && !ignored) warnings.push(`Missing visibility → defaulted to dm`);
  if (level === "player-published" && wikilinks.some((w) => w.broken)) {
    warnings.push(`Player-published file has unresolved wikilinks — could leak DM-only refs`);
  }
  if (attachments.some((a) => !a.resolved && !a.rawSrc.startsWith("/"))) {
    warnings.push(`${attachments.filter((a) => !a.resolved).length} attachment(s) need a target path`);
  }

  return {
    relPath,
    filename,
    suggestedId,
    title,
    level,
    rawFrontmatter: data,
    hasFrontmatter,
    frontmatterError,
    inferredType,
    effectiveVisibility,
    visibilityWasInvalid,
    visibilityWasMissing,
    suggestedSummary,
    summaryWasGenerated,
    wikilinks,
    attachments,
    warnings,
  };
}

const mappableTypes = new Set([
  "settlement",
  "region",
  "ruin",
  "dungeon",
  "location",
  "map_note",
]);
