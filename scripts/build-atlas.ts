/**
 * Build script: scans the content/ vault, parses Obsidian markdown,
 * resolves wikilinks, strips DM blocks, and writes
 * public/atlas/atlas.json + public/atlas/search-index.json.
 *
 * Run with: npm run atlas:build (which invokes via `tsx scripts/build-atlas.ts`).
 *
 * The leading `#!/usr/bin/env tsx` shebang was removed when A10 made this
 * file an ESM import target for the dev save plugin — vite/esbuild's
 * module loader trips on shebangs in imported files. Direct script
 * invocation now goes through `tsx`, never relying on file-execute bits.
 */
import fs from "node:fs";
import path from "node:path";
import { markdownToHtml } from "../src/atlas/content/markdownCore";
import { resolveImageEmbeds, DEFAULT_RESOLVE_ASSET } from "../src/atlas/content/renderEntityMarkdown";
import { parseFrontmatter, type ParsedFile } from "./atlas/parseFrontmatter";
import { stripDmBlocks, stripDmFromShippingString } from "./atlas/stripDmBlocks";
import { tokenizeWikilinks, renderLinkTokens } from "./atlas/parseWikilinks";
import { slugify } from "./atlas/slugify";
import { loadWorldConfig } from "./atlas/loadWorldConfig";
import { CURRENT_ATLAS_SCHEMA_VERSION } from "./atlas/schemaVersion";
import { sanitizeAtlasHtml } from "../src/atlas/sanitizeHtml";
import {
  validateAsset,
  formatFinding,
  type AssetFinding,
  type SvgPolicy,
} from "./atlas/validateAsset";
import { parseAtlasDate } from "./atlas/calendarDate";
import { PLAYER_VISIBLE } from "./atlas/visibility";
import { isLit } from "../src/atlas/fog/effectiveLit";
import { redactLayer, FogRedactionError } from "./atlas/redactFogMap";
import {
  stripDmProfile,
  filterRelationshipsForPlayer,
  compactProfile,
} from "../src/atlas/profiles/profileBuild";
import type {
  AtlasProject,
  CreditsConfig,
  Entity,
  MapDocument,
  MapPlacement,
  Region,
  FogOverlay,
  Route,
  Point,
} from "../src/atlas/content/schema";

interface Config {
  contentRoot: string;
  outputDir: string;
  defaultWorld: string;
  include: string[];
  exclude: string[];
}

// Tags that are organizational/meta for the DM but read as jargon to players
// ("#npc", "#stub"). Stripped from `entity.tags` in player builds only — DM
// builds keep them so the DM can still filter the editor by these.
const META_TAGS = new Set([
  "npc",
  "person",
  "region",
  "settlement",
  "city",
  "town",
  "village",
  "faction",
  "organization",
  "guild",
  "deity",
  "god",
  "event",
  "item",
  "artifact",
  "note",
  "location",
  "ruin",
  "dungeon",
  "cave",
  "temple",
  "shop",
  "port",
  "stub",
  "draft",
  "wip",
  "todo",
]);

// Resolved per-invocation inside runBuildCore so programmatic callers
// (the dev save plugin, tests) get the cwd that was active when they
// called, not the cwd that happened to be set when this module was first
// imported.

function loadConfig(configPath: string): Config {
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw) as Config;
}

function walk(
  dir: string,
  contentRoot: string,
  include: string[],
  exclude: string[],
  scanned: { excludedFiles: number; excludedPaths: string[] }
): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const contentRel = path.relative(contentRoot, full).replace(/\\/g, "/");
    if (matchAny(contentRel, exclude)) {
      if (entry.isDirectory()) {
        const all = listMd(full);
        scanned.excludedFiles += all.length;
        scanned.excludedPaths.push(...all);
      } else if (entry.name.endsWith(".md")) {
        scanned.excludedFiles += 1;
        scanned.excludedPaths.push(full);
      }
      continue;
    }
    if (entry.isDirectory()) {
      out.push(...walk(full, contentRoot, include, exclude, scanned));
    } else if (entry.name.endsWith(".md")) {
      // include globs only filter files (not dirs); empty list = include all.
      if (include.length > 0 && !matchAny(contentRel, include)) {
        scanned.excludedFiles += 1;
        scanned.excludedPaths.push(full);
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

function listMd(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMd(f));
    else if (e.name.endsWith(".md")) out.push(f);
  }
  return out;
}

function matchAny(target: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(target));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "::DSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DSTAR::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export function deriveTitle(file: string, fmTitle?: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  return path.basename(file, ".md")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_m, sp, ch) => sp + ch.toUpperCase());
}

function relImage(p: string): string {
  // Normalize "assets/..." paths to public output
  return p.replace(/^\/+/, "");
}

/**
 * Redact every occurrence of every secret name in a list of warning strings.
 * Names shorter than 3 characters are skipped to avoid pathological replaces
 * (e.g. an alias of "AI" would map every "ai" inside other words to "…").
 * Long names are tried first so a longer alias takes precedence over an id
 * that happens to be a substring of it.
 */
function scrubSecretNames(warnings: string[], secretNames: Set<string>): string[] {
  if (secretNames.size === 0) return warnings.slice();
  const names = Array.from(secretNames)
    .filter((n) => typeof n === "string" && n.length >= 3)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return warnings.slice();
  return warnings.map((w) => {
    let out = w;
    for (const n of names) out = out.split(n).join("…");
    return out;
  });
}

export interface BuildFlags {
  player: boolean;
  strict: boolean;
  outDir?: string;
  configPath?: string;
}

/**
 * Thrown when the build encounters a validation failure that the CLI would
 * have signaled via `process.exit(code)`. Carries the same exit code so
 * the CLI shim can preserve its exit-status contract, while programmatic
 * callers (the dev save plugin) can catch it and report structured
 * failure without losing the process.
 */
export class BuildError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "BuildError";
    this.code = code;
  }
}

export interface BuildResult {
  ok: boolean;
  /** CLI exit code (0 on success, 1-9 on various failure modes). */
  exitCode: number;
  durationMs: number;
  /** Short error message — only set when ok is false. */
  error?: string;
}

function parseFlags(): BuildFlags {
  const args = process.argv.slice(2);
  const flags: BuildFlags = { player: false, strict: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--player") flags.player = true;
    else if (a === "--strict") flags.strict = true;
    else if (a === "--out") flags.outDir = args[++i];
    else if (a.startsWith("--out=")) flags.outDir = a.slice(6);
    else if (a === "--config") flags.configPath = args[++i];
    else if (a.startsWith("--config=")) flags.configPath = a.slice(9);
  }
  return flags;
}

/**
 * Programmatic entry. Same behavior as invoking `npx tsx scripts/build-atlas.ts`
 * with the equivalent flags, but never calls `process.exit` directly.
 * Validation failures throw `BuildError(code, message)`; the top-level
 * CLI shim translates those into process.exit. The dev save plugin uses
 * this directly so an in-flight save can rebuild atlas.json without
 * spawning a child process.
 */
export async function runBuild(flags: BuildFlags = { player: false, strict: false }): Promise<BuildResult> {
  const started = Date.now();
  try {
    await runBuildCore(flags);
    return { ok: true, exitCode: 0, durationMs: Date.now() - started };
  } catch (e) {
    if (e instanceof BuildError) {
      return { ok: false, exitCode: e.code, durationMs: Date.now() - started, error: e.message };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, exitCode: 1, durationMs: Date.now() - started, error: msg };
  }
}

async function runBuildCore(flags: BuildFlags) {
  const ROOT = process.cwd();
  const configPath = path.resolve(ROOT, flags.configPath ?? "atlas.config.json");
  const cfg = loadConfig(configPath);
  const contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);

  const scanInfo = { excludedFiles: 0, excludedPaths: [] as string[] };
  const files = walk(contentDir, contentDir, cfg.include ?? [], cfg.exclude ?? [], scanInfo);

  // Load world config up-front so entity parsing can resolve dates against
  // the in-world calendar.
  let worldCfg: ReturnType<typeof loadWorldConfig> | null = null;
  try {
    worldCfg = loadWorldConfig(contentDir, cfg.defaultWorld);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\n✗ ${msg}\n`);
    throw new BuildError(1, msg);
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  let strippedDmBlocks = 0;
  let detectedDmBlocks = 0;
  let duplicateSlugs = 0;
  let unresolvedLinks = 0;
  let visibilityExcluded = 0;
  let secretPlacementsExcluded = 0;
  let invalidVisibilityCount = 0;
  let localAssets = 0;
  let externalAssets = 0;
  let missingAssets = 0;

  type Pending = {
    entity: Entity;
    rawBody: string;
    /** Explicit multi-map placements from atlas.placements[]. */
    placements: Array<{ mapId?: string; x: number; y: number; label?: string; pin?: import("../src/atlas/content/schema").PinPlacementStyle }>;
    /** Legacy atlas.x / atlas.y, used only if `placements` is empty. */
    legacy?: { x: number; y: number };
  };
  const pending: Pending[] = [];
  const slugSeen = new Map<string, string>();

  // PASS 1: parse every file regardless of visibility, so that we can build a
  // full name index for cross-reference leak detection. A `[[Vampire Lord]]`
  // wikilink in a public entry that resolves to a DM-only entity is a spoiler
  // leak even if the target entity is later excluded from the player build —
  // the display TEXT inside the link still ships and reveals the name.
  type AllParsed = {
    file: string;
    rel: string;
    parsed: ParsedFile;
    title: string;
    id: string;
    visibility: import("../src/atlas/content/schema").EntityVisibility;
    isSecret: boolean;
  };
  const allParsed: AllParsed[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(raw, rel);
    for (const w of parsed.warnings) {
      if (w.includes("invalid atlas.visibility")) invalidVisibilityCount += 1;
    }
    warnings.push(...parsed.warnings);

    const title = deriveTitle(file, (parsed.data.title as string) ?? undefined);
    if (!title) {
      errors.push(`${rel}: missing title`);
      continue;
    }
    const id = parsed.atlas.id || slugify(title);
    if (slugSeen.has(id)) {
      duplicateSlugs += 1;
      errors.push(`${rel}: duplicate slug "${id}" also produced by ${slugSeen.get(id)} — skipping`);
      continue;
    }
    slugSeen.set(id, rel);

    const visibility = parsed.atlas.visibility ?? (parsed.atlas.publish === false ? "dm" : "player");
    const isSecret = !PLAYER_VISIBLE.has(visibility) || parsed.atlas.publish === false;
    allParsed.push({ file, rel, parsed, title, id, visibility, isSecret });
  }

  // Cross-reference index: title + aliases → id, covering EVERY parsed entity
  // (player-visible and DM/hidden). Used for wikilink resolution so we can
  // detect cross-ref leaks (a public-entry link to a DM-only target).
  const crossRefNameIndex = new Map<string, string>();
  const allEntityVisibility = new Map<string, import("../src/atlas/content/schema").EntityVisibility>();
  const secretEntityIds = new Set<string>();
  // Every literal string (title / id / alias) belonging to a non-player
  // entity. Used to scrub warning text before it ships in a player build.
  const secretNames = new Set<string>();
  for (const p of allParsed) {
    crossRefNameIndex.set(p.title.toLowerCase(), p.id);
    for (const a of p.parsed.atlas.aliases ?? []) {
      crossRefNameIndex.set(a.toLowerCase(), p.id);
    }
    allEntityVisibility.set(p.id, p.visibility);
    if (p.isSecret) {
      secretEntityIds.add(p.id);
      secretNames.add(p.title);
      secretNames.add(p.id);
      for (const a of p.parsed.atlas.aliases ?? []) secretNames.add(a);
    }
  }

  // Also parse identity-only from folder-excluded files (e.g. `_dm/`,
  // `_drafts/`). These files are NEVER read into entities and never ship, but
  // a public-entry wikilink to their title would still leak the display text
  // unless we treat them as secret targets in the cross-ref index.
  const excludedIdSeen = new Set<string>();
  for (const file of scanInfo.excludedPaths) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    let raw: string;
    try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
    const parsed = parseFrontmatter(raw, rel);
    const title = deriveTitle(file, (parsed.data.title as string) ?? undefined);
    if (!title) continue;
    const id = parsed.atlas.id || slugify(title);
    if (slugSeen.has(id) || excludedIdSeen.has(id)) continue;
    excludedIdSeen.add(id);
    crossRefNameIndex.set(title.toLowerCase(), id);
    for (const a of parsed.atlas.aliases ?? []) {
      crossRefNameIndex.set(a.toLowerCase(), id);
    }
    // Folder-excluded files have no published visibility, but for cross-ref
    // purposes they're DM-equivalent: anything wikilinking to them from a
    // public entry is a spoiler leak.
    const vis = parsed.atlas.visibility ?? "dm";
    allEntityVisibility.set(id, vis);
    secretEntityIds.add(id);
    secretNames.add(title);
    secretNames.add(id);
    for (const a of parsed.atlas.aliases ?? []) secretNames.add(a);
  }

  // PASS 2: build entities for pending, filtering out secrets in player mode
  // and applying shipping-field DM-block stripping defensively.
  let crossRefLeaks = 0;
  for (const item of allParsed) {
    const { parsed, title, id, visibility, isSecret, rel } = item;
    if (flags.player && isSecret) {
      visibilityExcluded += 1;
      continue;
    }

    // Body DM-block stripping (player builds only). Unbalanced %% is a build
    // error in either mode — it indicates an unclosed comment block, which
    // can silently leak everything after it.
    const { text: noDmStripped, count: cStripped, unbalanced } = stripDmBlocks(parsed.body);
    detectedDmBlocks += cStripped;
    if (unbalanced) {
      errors.push(`${rel}: body has an unbalanced DM delimiter — likely an unclosed %%...%% block or an unclosed :::dm...::: callout. Add the closing fence (or remove the stray opener).`);
    }
    const noDm = flags.player ? noDmStripped : parsed.body;
    if (flags.player) strippedDmBlocks += cStripped;

    // Shipping-field sanitization: every string that lands in atlas.json must
    // be free of %% blocks in player builds. The body is already handled
    // above; this covers summary, aliases, tags, profile player fields, etc.
    const stripField = flags.player
      ? (s: string | undefined) => stripDmFromShippingString(s)
      : (s: string | undefined) => s;
    const stripArr = flags.player
      ? (arr: string[]) =>
          arr
            .map((x) => stripDmFromShippingString(x) ?? "")
            .filter((x) => x.length > 0)
      : (arr: string[]) => arr;

    // Player builds only: strip meta tags ("#npc", "#stub") that read as
    // jargon to players. DM builds keep them — they're useful for editor
    // filtering. Comparison is case-insensitive.
    const scrubTags = flags.player
      ? (arr: string[]) => arr.filter((t) => !META_TAGS.has(t.toLowerCase()))
      : (arr: string[]) => arr;

    // Drop aliases that duplicate the title (case-insensitive). The vault
    // convention of `aliases: [TitleString, ...]` is common and harmless on
    // disk, but rendering "aka {title}" alongside the title itself looks like
    // a bug. Always apply — duplicate aliases are never useful anywhere.
    const dedupAliases = (arr: string[], t: string) => {
      const tl = t.toLowerCase();
      return arr.filter((a) => a.trim().toLowerCase() !== tl);
    };

    const entity: Entity = {
      id,
      title: stripField(title) ?? title,
      type: parsed.atlas.type ?? "note",
      world: parsed.atlas.world ?? cfg.defaultWorld,
      visibility,
      canon: (parsed.atlas.canon as Entity["canon"]) ?? "canon",
      aliases: dedupAliases(stripArr(parsed.atlas.aliases ?? []), title),
      tags: scrubTags(stripArr(parsed.atlas.tags ?? [])),
      summary: stripField(parsed.atlas.summary),
      race: stripField(parsed.atlas.race),
      credit: parsed.atlas.credit,
      images: (parsed.atlas.images ?? []).map(relImage),
      body: noDm,
      bodyHtml: "",
      frontmatter: flags.player ? {} : parsed.data,
      sourcePath: flags.player ? "" : rel,
      links: [],
      backlinks: [],
      profile: compactProfile(parsed.atlas.profile),
      relationships: parsed.atlas.relationships,
    };

    // Sanitize profile.player shipping strings (profile.dm is dropped later).
    if (flags.player && entity.profile?.player) {
      const pp = entity.profile.player;
      if (pp.known_for) pp.known_for = stripDmFromShippingString(pp.known_for);
      if (pp.visible_traits) {
        pp.visible_traits = pp.visible_traits
          .map((s: string) => stripDmFromShippingString(s) ?? "")
          .filter((s: string) => s.length > 0);
      }
      if (pp.rumors) {
        pp.rumors = pp.rumors
          .map((s: string) => stripDmFromShippingString(s) ?? "")
          .filter((s: string) => s.length > 0);
      }
    }
    // Sanitize relationship.label / description for player builds.
    if (flags.player && entity.relationships) {
      for (const r of entity.relationships) {
        if (r.label) r.label = stripDmFromShippingString(r.label);
        if (r.description) r.description = stripDmFromShippingString(r.description);
      }
    }

    // Date / timeline support.
    const parsedDate = parseAtlasDate(parsed.atlas.date, worldCfg?.calendar);
    if (parsedDate) {
      entity.dateRaw = stripField(parsedDate.label);
      entity.dateValue = parsed.atlas.dateValue ?? parsedDate.value;
      entity.dateYear = parsedDate.year;
    } else if (typeof parsed.atlas.dateValue === "number") {
      entity.dateValue = parsed.atlas.dateValue;
      entity.dateRaw = stripField(parsed.atlas.date);
    }

    const fmAtlas = (parsed.data.atlas as Record<string, unknown>) ?? {};
    const cx = typeof fmAtlas.x === "number" ? fmAtlas.x : undefined;
    const cy = typeof fmAtlas.y === "number" ? fmAtlas.y : undefined;
    const legacy = cx !== undefined && cy !== undefined ? { x: cx, y: cy } : undefined;
    const explicitPlacements = parsed.atlas.placements ?? [];
    pending.push({ entity, rawBody: noDm, placements: explicitPlacements, legacy });
  }

  // Wikilink resolution uses the FULL cross-reference index (including
  // DM/hidden entities) so we can detect public-entry → DM-target leaks.
  const resolveByName = (n: string) => crossRefNameIndex.get(n.trim().toLowerCase());

  const backlinkMap = new Map<string, Map<string, string>>();
  for (const item of pending) {
    const { entity, rawBody } = item;
    // Resolve ![[image.ext]] AFTER DM stripping (rawBody is already noDm) so embeds in %% blocks are absent.
    const resolvedBody = resolveImageEmbeds(rawBody, DEFAULT_RESOLVE_ASSET);
    const { tokenized, links } = tokenizeWikilinks(resolvedBody, { resolveByName });
    entity.links = links;
    for (const l of links) {
      // Cross-reference spoiler leak detection (player builds only). The link
      // resolved to a real entity, but that entity is excluded from the player
      // build — keeping the link would ship the display text (often the
      // secret's name). Redact display, drop href, mark broken, count it.
      if (flags.player && l.resolvedId && secretEntityIds.has(l.resolvedId)) {
        crossRefLeaks += 1;
        const targetVis = allEntityVisibility.get(l.resolvedId) ?? "dm";
        warnings.push(
          `entity "${entity.id}": wikilink "${l.target}" resolves to ${targetVis} entity "${l.resolvedId}" — spoiler leak, redacted from player output`
        );
        // Redact body markdown: replace the raw `[[target(|display)?]]`
        // syntax with "…" so the secret name doesn't leak through atlas.json
        // entity.body or the search index (which both ship the raw body).
        if (l.target) {
          const escTarget = l.target.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
          entity.body = entity.body.replace(
            new RegExp(`\\[\\[${escTarget}(?:\\|[^\\]]+)?\\]\\]`, "g"),
            "…"
          );
        }
        l.resolvedId = undefined;
        l.display = "…";
        // Redact target too — entity.links ships verbatim, and the raw target
        // text is usually the secret's name.
        l.target = "";
        l.broken = true;
      }
      if (l.broken) {
        // Unresolved wikilinks are normal "not created yet" — count, don't warn.
        unresolvedLinks += 1;
      } else if (l.resolvedId) {
        if (!backlinkMap.has(l.resolvedId)) backlinkMap.set(l.resolvedId, new Map());
        backlinkMap.get(l.resolvedId)!.set(entity.id, entity.title);
      }
    }
    const html = markdownToHtml(tokenized);
    // In player builds, broken link tokens (which now include links to excluded
    // dm entities) must NOT leak the target name. Render as plain display text.
    // Sanitize rendered markdown HTML BEFORE shipping it in atlas.json.
    // This is defense-in-depth against HTML/script injection in lore content;
    // it does NOT replace player-safe DM stripping (which has already run
    // upstream on the raw markdown).
    const linked = renderLinkTokens(html, links, { hideBroken: flags.player });
    entity.bodyHtml = sanitizeAtlasHtml(linked);
  }
  for (const { entity } of pending) {
    const m = backlinkMap.get(entity.id);
    if (m) entity.backlinks = Array.from(m.entries()).filter(([id]) => id !== entity.id).map(([id, title]) => ({ id, title }));
  }

  const worldId = cfg.defaultWorld;
  const fallbackMapId = `${worldId}-overview`;

  // Build entity → visibility map up-front so route/region leak detection
  // (which runs before the relationship pass) can use it too.
  const entityVisibility = new Map<string, import("../src/atlas/content/schema").EntityVisibility>();
  for (const { entity } of pending) entityVisibility.set(entity.id, entity.visibility);

  // worldCfg was loaded earlier (so entity dates can resolve against the calendar).
  if (worldCfg) warnings.push(...worldCfg.warnings);

  let maps: MapDocument[] = worldCfg?.maps?.length
    ? worldCfg.maps
    : [{ id: fallbackMapId, worldId, name: "Overview", width: 200000, height: 100000, layers: [], oceanColor: "#18313f", wrapX: true }];

  // Soft warning: if the maps assets directory has uploaded image files but
  // every map has empty layers, the user almost certainly forgot to wire them
  // into world.yaml. This catches the "uploaded map.jpg but it never shows up"
  // failure mode.
  try {
    const mapsAssetsDir = path.join(ROOT, "public/atlas/assets/maps");
    const allEmpty = maps.every((m) => !m.layers || m.layers.length === 0);
    if (allEmpty && fs.existsSync(mapsAssetsDir)) {
      const imgs = fs.readdirSync(mapsAssetsDir).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
      if (imgs.length > 0) {
        warnings.push(
          `world.yaml: every map has layers: [] but ${imgs.length} image file(s) are present in public/atlas/assets/maps/ (${imgs.slice(0, 3).join(", ")}${imgs.length > 3 ? ", …" : ""}). Add a layers: entry referencing them.`
        );
      }
    }
  } catch { /* ignore */ }

  let regions: Region[] = worldCfg?.regions ?? [];
  const fogs: FogOverlay[] = worldCfg?.fogs ?? [];
  let regionsExcluded = 0;

  // Build a per-mapId fog checker for player builds.
  const fogByMapId = new Map(fogs.map((f) => [f.mapId, f]));
  const isFoggedOnMap = (mapId: string, x: number, y: number): boolean => {
    const fog = fogByMapId.get(mapId);
    return !!fog?.enabled && !isLit(x, y, fog);
  };

  if (flags.player) {
    regions = regions
      .filter((r) => {
        const keep = PLAYER_VISIBLE.has(r.visibility);
        if (!keep) regionsExcluded += 1;
        return keep;
      })
      // Region names ship to players; strip any %% blocks the DM left behind.
      .map((r) => ({ ...r, name: stripDmFromShippingString(r.name) ?? r.name }))
      .filter((r) => {
        if (!r.mapId || !r.points?.length) return true;
        return !r.points.some(([x, y]) => isFoggedOnMap(r.mapId!, x, y));
      });
    // Map names ship to players too; sanitize before attaching overlays below.
    maps = maps.map((m) => ({
      ...m,
      name: stripDmFromShippingString(m.name) ?? m.name,
    }));
  }

  // Default placements to first map if no specific mapId on entity.
  const primaryMapId = maps[0]?.id ?? fallbackMapId;
  const validMapIds = new Set(maps.map((m) => m.id));
  const placements: MapPlacement[] = [];
  for (const item of pending) {
    const { entity } = item;
    // Build the effective list: explicit placements win; legacy x/y only as fallback.
    const list = item.placements.length > 0
      ? item.placements
      : (item.legacy ? [{ mapId: undefined, x: item.legacy.x, y: item.legacy.y }] : []);
    if (list.length === 0) continue;
    if (flags.player && !PLAYER_VISIBLE.has(entity.visibility)) {
      secretPlacementsExcluded += list.length;
      continue;
    }
    for (const p of list) {
      const mapId = p.mapId ?? primaryMapId;
      if (!validMapIds.has(mapId)) {
        warnings.push(`entity "${entity.id}": placement references unknown mapId "${mapId}" — skipped`);
        continue;
      }
      if (flags.player && isFoggedOnMap(mapId, p.x, p.y)) {
        secretPlacementsExcluded += 1;
        continue;
      }
      const rawLabel = (p as { label?: string }).label;
      const cleanLabel = flags.player ? stripDmFromShippingString(rawLabel) : rawLabel;
      placements.push({
        id: `${entity.id}@${mapId}`,
        entityId: entity.id,
        mapId,
        x: p.x,
        y: p.y,
        label: cleanLabel ?? entity.title,
        visibility: entity.visibility,
        pin: (p as { pin?: import("../src/atlas/content/schema").PinPlacementStyle }).pin,
      });
    }
  }

  // Resolve route waypoints (entity ids → coordinates) and filter for player.
  let routesExcluded = 0;
  // Routes must resolve waypoints using a placement on the SAME map. Using a
  // global entityId→placement map silently let a route on map B resolve via a
  // pin on map A (regional-map spoiler bug).
  const placementByMapEntity = new Map<string, MapPlacement>();
  placements.forEach((p) => placementByMapEntity.set(`${p.mapId}:${p.entityId}`, p));
  let regionLeaks = 0;
  let routeLeaks = 0;
  let routeWaypointMisses = 0;
  const routes: Route[] = [];
  for (const r of worldCfg?.routes ?? []) {
    if (flags.player && !PLAYER_VISIBLE.has(r.visibility)) {
      routesExcluded += 1;
      continue;
    }
    // Spoiler-leak: player-visible route mentions a DM/hidden/unknown entity.
    if (PLAYER_VISIBLE.has(r.visibility)) {
      for (const w of r.waypoints) {
        if (Array.isArray(w)) continue;
        const targetVis = entityVisibility.get(w.entityId);
        if (!targetVis || !PLAYER_VISIBLE.has(targetVis)) {
          routeLeaks += 1;
          warnings.push(
            `route "${r.id}": player-visible route routes through ${targetVis ? `${targetVis} entity` : "unknown entity"} "${w.entityId}" — spoiler leak`
          );
        }
      }
    }
    const resolved: Point[] = [];
    let dropped = false;
    for (const w of r.waypoints) {
      if (Array.isArray(w)) {
        resolved.push([w[0], w[1]]);
      } else {
        const p = placementByMapEntity.get(`${r.mapId}:${w.entityId}`);
        if (!p) {
          routeWaypointMisses += 1;
          warnings.push(`route "${r.id}": waypoint entity "${w.entityId}" has no placement on map "${r.mapId}" — route skipped`);
          dropped = true;
          break;
        }
        resolved.push([p.x, p.y]);
      }
    }
    if (dropped || resolved.length < 2) continue;
    if (flags.player && resolved.some(([x, y]) => isFoggedOnMap(r.mapId, x, y))) {
      routesExcluded += 1;
      continue;
    }
    // Route names ship to players; strip any %% blocks the DM left behind.
    const routeName = flags.player ? (stripDmFromShippingString(r.name) ?? r.name) : r.name;
    routes.push({
      id: r.id,
      mapId: r.mapId,
      name: routeName,
      mode: r.mode,
      speed: r.speed,
      color: r.color,
      weight: r.weight,
      dashed: r.dashed,
      visibility: r.visibility,
      waypoints: r.waypoints,
      resolvedPoints: resolved,
    });
  }

  // Attach regions + fog + routes to their owning maps.
  maps = maps.map((m) => ({
    ...m,
    regions: regions.filter((r) => r.mapId === m.id),
    fog: fogs.find((f) => f.mapId === m.id),
    routes: routes.filter((r) => r.mapId === m.id),
  }));

  // -------- Player-mode fog redaction --------
  // For each fog-enabled map, redact every raster layer to a feathered alpha
  // mask PNG, write <name>.fog.png next to the source, rewrite the layer src
  // in the player atlas, and strip fog geometry so reveal polygons never ship.
  // (See docs/superpowers/specs/2026-05-19-fog-player-mechanic-design.md.)
  if (flags.player) {
    const redactedMaps: typeof maps = [];
    for (const m of maps) {
      if (!m.fog?.enabled) { redactedMaps.push(m); continue; }

      const fog = m.fog;
      const newLayers: typeof m.layers = [];
      for (const layer of m.layers ?? []) {
        if (layer.tileSrc) {
          throw new FogRedactionError(
            `Map "${m.id}" layer "${layer.id}" is tiled (tileSrc set) — fog is not supported for tiled layers. ` +
            `Either remove fog.enabled on this map or convert the layer to a raster image.`
          );
        }
        const srcPath = path.resolve(ROOT, "public", layer.src);
        if (!fs.existsSync(srcPath)) {
          warnings.push(
            `map "${m.id}" layer "${layer.id}": source image missing at ${path.relative(ROOT, srcPath)} — skipped fog redaction (layer will not render)`
          );
          continue;
        }
        const imageBuffer = fs.readFileSync(srcPath);
        const redacted = await redactLayer(
          imageBuffer,
          { width: m.width, height: m.height },
          fog,
          { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
        );
        // Output path: insert ".fog" before the extension. Strip any query/hash.
        const cleanSrc = layer.src.replace(/[?#].*$/, "");
        const ext = path.extname(cleanSrc); // ".png", ".jpg", etc.
        const srcAbs = path.resolve(ROOT, "public", cleanSrc);
        const base = srcAbs.slice(0, -ext.length);
        const outPath = `${base}.fog.png`;
        fs.writeFileSync(outPath, redacted);
        // Rewrite the layer src to the redacted file (relative to public/, forward slashes).
        const newSrcRel = path.relative(path.resolve(ROOT, "public"), outPath).split(path.sep).join("/");
        newLayers.push({ ...layer, src: newSrcRel });
      }
      // Strip fog geometry — only mapId + enabled remain in the player atlas.
      // The cast intentionally drops reveals/conceals/featherPx/color so the
      // player atlas never ships reveal polygon coordinates.
      const playerFog = { mapId: fog.mapId, enabled: true } as FogOverlay;
      redactedMaps.push({ ...m, layers: newLayers, fog: playerFog });
    }
    maps = redactedMaps;
  }

  // -------- Profile + relationship player-strip --------
  // The DM half of `profile` and DM-only relationships must NEVER reach a
  // player build. Relationships pointing at DM-only entities are SPOILER
  // LEAKS and warn here (and fail strict-player builds).
  //
  // Region leak detection: player-visible region linked to DM/hidden/unknown entity.
  for (const r of regions) {
    if (!PLAYER_VISIBLE.has(r.visibility) || !r.entityId) continue;
    const targetVis = entityVisibility.get(r.entityId);
    if (!targetVis || !PLAYER_VISIBLE.has(targetVis)) {
      regionLeaks += 1;
      warnings.push(
        `region "${r.id}": player-visible region links to ${targetVis ? `${targetVis} entity` : "unknown entity"} "${r.entityId}" — spoiler leak`
      );
    }
  }

  let strippedDmProfiles = 0;
  let strippedDmRelationships = 0;
  let relationshipLeaks = 0;
  let unresolvedRelationships = 0;
  for (const { entity } of pending) {
    if (flags.player) {
      if (entity.profile?.dm) strippedDmProfiles += 1;
      entity.profile = stripDmProfile(entity.profile);
    }
    if (!entity.relationships?.length) continue;
    if (flags.player) {
      const res = filterRelationshipsForPlayer(entity.relationships, { entityVisibility });
      strippedDmRelationships += res.droppedByVisibility.length;
      relationshipLeaks += res.droppedByLeak.length;
      unresolvedRelationships += res.unresolved.length;
      for (const r of res.droppedByLeak) {
        warnings.push(
          `entity "${entity.id}": relationship → "${r.entity}" (visibility=${r.visibility}) ` +
          `would leak a DM-only target — dropped from player build`
        );
      }
      for (const r of res.unresolved) {
        warnings.push(
          `entity "${entity.id}": relationship → "${r.entity}" points at unknown entity — dropped`
        );
      }
      entity.relationships = res.kept.length > 0 ? res.kept : undefined;
    } else {
      // DM build: only check for unresolved targets so the editor can flag them.
      for (const r of entity.relationships) {
        if (!entityVisibility.has(r.entity)) {
          unresolvedRelationships += 1;
          warnings.push(
            `entity "${entity.id}": relationship → "${r.entity}" points at unknown entity`
          );
        }
      }
    }
  }

  // -------- Asset validation --------
  // Walk every entity image and every map layer src through the centralized
  // validator (scripts/atlas/validateAsset.ts). Each finding includes the
  // referring owner id, the offending path, and an actionable suggestion.
  const PUBLIC_DIR = path.join(ROOT, "public");
  const assetFindings: AssetFinding[] = [];
  // SVG policy is centralized in validateAsset.ts; expose hook here for future
  // per-project overrides via atlas.config.json.
  const svgPolicy: SvgPolicy | undefined = undefined;

  const runAssetCheck = (raw: string, owner: string) => {
    if (!raw) return;
    if (/^(https?:|data:|blob:)/i.test(raw)) externalAssets += 1;
    else localAssets += 1;
    const found = validateAsset(raw, owner, { publicDir: PUBLIC_DIR, svgPolicy });
    for (const f of found) {
      assetFindings.push(f);
      if (f.category === "missing") missingAssets += 1;
    }
  };

  for (const { entity } of pending) {
    for (const img of entity.images) runAssetCheck(img, `entity ${entity.id}`);
  }
  for (const m of maps) {
    for (const layer of m.layers ?? []) runAssetCheck(layer.src, `map ${m.id} layer ${layer.id}`);
  }

  // Strict-player gate for unsupported extensions: ship-blocking because the
  // browser will refuse to render the file. Counted separately from missing
  // assets (which already have exit code 4).
  const badExtensionCount = assetFindings.filter((f) => f.category === "bad-extension").length;
  // Non-fatal categories surface as warnings in the standard build log.
  for (const f of assetFindings) {
    if (f.severity === "warning") warnings.push(`${f.owner}: ${f.message} — ${f.suggestion}`);
  }

  const project: AtlasProject = {
    version: new Date().toISOString().replace(/[:.]/g, "-"),
    schemaVersion: worldCfg?.schemaVersion ?? CURRENT_ATLAS_SCHEMA_VERSION,
    publishedAt: new Date().toISOString(),
    worlds: [{
      id: worldId,
      name: "Astrath Deeprealm",
      defaultMapId: primaryMapId,
      ...(flags.player ? {} : { importFolders: worldCfg?.importConfig ?? { folders: {}, defaultFolder: "imports" } }),
      credits: worldCfg?.credits ?? ({ badges: true, page: true } satisfies CreditsConfig),
    }],
    maps,
    entities: pending.map((p) => p.entity),
    placements,
    assets: [],
    calendar: worldCfg?.calendar,
    buildReport: {
      scanned: files.length + scanInfo.excludedFiles,
      included: pending.length,
      excluded: scanInfo.excludedFiles + visibilityExcluded,
      // Warning text routinely names DM entities (cross-ref leak messages,
      // relationship leak messages, unresolved-target messages, etc.). Player
      // builds get the same diagnostic warnings, but every secret entity's
      // title/id/alias is scrubbed to "…" so a leak message about a hidden
      // entity doesn't itself leak the secret's name.
      warnings: flags.player ? scrubSecretNames(warnings, secretNames) : warnings,
      brokenLinks: unresolvedLinks,        // back-compat alias
      unresolvedLinks,
      duplicateSlugs,
      strippedDmBlocks,
      localAssets,
      externalAssets,
      missingAssets,
    },
  };

  // Output safety: player builds go to public/atlas (committed/served).
  // DM builds go to a gitignored .local-atlas folder by default to avoid
  // accidentally shipping spoilers via the committed atlas.json.
  const defaultOut = flags.player ? cfg.outputDir : ".local-atlas";
  const outDir = path.resolve(ROOT, flags.outDir ?? defaultOut);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "atlas.json"), JSON.stringify(project, null, 2));

  // Strip markdown syntax for the search index body field. Keeps it small enough
  // for client-side full-text scan without shipping a wasm search engine.
  // Core strips markdown but preserves original case — used as bodyText for display.
  const stripMdCore = (s: string) =>
    s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, (_m, t, d) => d || t)
      .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
      .replace(/[*_`>#~]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // Lowercase wrapper — used for full-text matching.
  const stripMd = (s: string) => stripMdCore(s).toLowerCase();

  const searchIndex = pending.map(({ entity }) => {
    const stripped = stripMdCore(entity.body).slice(0, 4000);
    return {
      id: entity.id,
      title: entity.title,
      type: entity.type,
      aliases: entity.aliases,
      tags: entity.tags,
      summary: entity.summary,
      excerpt: entity.body.replace(/\s+/g, " ").trim().slice(0, 240),
      body: stripped.toLowerCase(),
      bodyText: stripped,
      dateRaw: entity.dateRaw,
      dateValue: entity.dateValue,
      dateYear: entity.dateYear,
    };
  });
  fs.writeFileSync(path.join(outDir, "search-index.json"), JSON.stringify(searchIndex, null, 2));

  const r = project.buildReport!;
  console.log(`\n=== Atlas build report (${flags.player ? "PLAYER" : "DM"}${flags.strict ? ", strict" : ""}) ===`);
  console.log(`Scanned:                 ${r.scanned}`);
  console.log(`Included entities:       ${r.included}`);
  console.log(`Excluded by folder:      ${scanInfo.excludedFiles}`);
  console.log(`Excluded by visibility:  ${visibilityExcluded}`);
  console.log(`Stripped DM blocks:      ${r.strippedDmBlocks}${flags.player ? "" : ` (DM build keeps ${detectedDmBlocks} block${detectedDmBlocks === 1 ? "" : "s"} in body)`}`);
  console.log(`Excluded secret pins:    ${secretPlacementsExcluded}`);
  console.log(`Excluded secret regions: ${regionsExcluded}`);
  console.log(`Excluded secret routes:  ${routesExcluded}`);
  console.log(`Invalid visibility (→dm):${invalidVisibilityCount}`);
  console.log(`Maps:                    ${maps.length}`);
  console.log(`Regions:                 ${regions.length}`);
  console.log(`Routes:                  ${routes.length}`);
  console.log(`Unresolved wikilinks:    ${r.unresolvedLinks} (allowed — not-yet-created notes)`);
  console.log(`Duplicate slugs:         ${r.duplicateSlugs}`);
  console.log(`Local assets:            ${localAssets}`);
  console.log(`External assets:         ${externalAssets}`);
  console.log(`Missing local assets:    ${missingAssets}`);
  console.log(`Stripped DM profiles:    ${strippedDmProfiles}`);
  console.log(`Stripped DM rels:        ${strippedDmRelationships}`);
  console.log(`Relationship leaks:      ${relationshipLeaks}`);
  console.log(`Region leaks:            ${regionLeaks}`);
  console.log(`Route leaks:             ${routeLeaks}`);
  console.log(`Route waypoint misses:   ${routeWaypointMisses}`);
  console.log(`Cross-ref leaks:         ${crossRefLeaks}`);
  console.log(`Unresolved relationships:${unresolvedRelationships}`);
  console.log(`Warnings:                ${warnings.length}`);
  console.log(`Errors:                  ${errors.length}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const f of assetFindings) {
    if (f.severity === "error") console.log(`  ${formatFinding(f)}`);
  }
  console.log(`\nWrote ${path.relative(ROOT, path.join(outDir, "atlas.json"))}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(outDir, "search-index.json"))}\n`);

  if (errors.length > 0) {
    console.error("Build failed: validation errors above.");
    throw new BuildError(1, "validation errors");
  }
  // Strict + player must NEVER ship a build with invalid visibility values,
  // because the parser silently coerces them to "dm" and the spoiler risk
  // demands authoring discipline.
  if (flags.player && flags.strict && invalidVisibilityCount > 0) {
    const msg = `Strict player mode: ${invalidVisibilityCount} invalid visibility value(s). Failing build.`;
    console.error(msg);
    throw new BuildError(3, msg);
  }
  // Missing local assets in a strict player build must fail — players would
  // see broken images. External URLs only warn.
  if (flags.player && flags.strict && missingAssets > 0) {
    const msg = `Strict player mode: ${missingAssets} missing local asset(s). Failing build.`;
    console.error(msg);
    throw new BuildError(4, msg);
  }
  // Unsupported asset extensions are unrenderable in browsers — block strict
  // player builds before they ship 404s or broken images.
  if (flags.player && flags.strict && badExtensionCount > 0) {
    const msg = `Strict player mode: ${badExtensionCount} asset(s) with unsupported extension. Failing build.`;
    console.error(msg);
    throw new BuildError(9, msg);
  }
  // Strict mode (non-asset, non-link) still fails on duplicate slugs etc.
  // Unresolved wikilinks are explicitly allowed and do NOT fail strict.
  if (flags.strict && duplicateSlugs > 0) {
    const msg = "Strict mode: duplicate slugs present. Failing build.";
    console.error(msg);
    throw new BuildError(2, msg);
  }
  // Strict + player must never ship a relationship that points at a DM-only
  // entity — that's a direct spoiler leak via the public relationship graph.
  if (flags.player && flags.strict && relationshipLeaks > 0) {
    const msg = `Strict player mode: ${relationshipLeaks} relationship leak(s) to DM-only entities. Failing build.`;
    console.error(msg);
    throw new BuildError(5, msg);
  }
  // Strict + player must never ship player-visible region/route geometry that
  // names DM-only or unknown entities — these leak DM map prep to players.
  if (flags.player && flags.strict && regionLeaks > 0) {
    const msg = `Strict player mode: ${regionLeaks} region leak(s) to DM-only/unknown entities. Failing build.`;
    console.error(msg);
    throw new BuildError(6, msg);
  }
  if (flags.player && flags.strict && routeLeaks > 0) {
    const msg = `Strict player mode: ${routeLeaks} route leak(s) to DM-only/unknown entities. Failing build.`;
    console.error(msg);
    throw new BuildError(7, msg);
  }
  // Strict + player must never ship a wikilink from a public entry to a
  // DM/hidden entity — the display TEXT inside the link reveals the secret
  // name even after we redact the href. Build fails so the DM rewrites the
  // sentence.
  if (flags.player && flags.strict && crossRefLeaks > 0) {
    const msg = `Strict player mode: ${crossRefLeaks} cross-reference leak(s): wikilinks from player-visible entries to DM/hidden entities. Failing build.`;
    console.error(msg);
    throw new BuildError(8, msg);
  }
}

/**
 * Detect whether this module is the process entry point. tsx invokes the
 * script with `process.argv[1]` set to its absolute path; ESM gives us
 * `import.meta.url` as a file:// URL. Both are normalized for comparison so
 * the CLI shim only runs when invoked directly, never on programmatic
 * import from the dev save plugin or a test file.
 */
function isMainModule(): boolean {
  if (typeof process === "undefined" || !process.argv?.[1]) return false;
  try {
    const argvUrl = new URL(`file://${path.resolve(process.argv[1])}`).href;
    return import.meta.url === argvUrl;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const flags = parseFlags();
  runBuild(flags).then((result) => {
    if (!result.ok) process.exit(result.exitCode);
  }).catch((e: unknown) => {
    // runBuild itself shouldn't throw, but belt + suspenders.
    console.error(e);
    process.exit(1);
  });
}
