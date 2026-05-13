#!/usr/bin/env tsx
/**
 * Build script: scans the content/ vault, parses Obsidian markdown,
 * resolves wikilinks, strips DM blocks, and writes
 * public/atlas/atlas.json + public/atlas/search-index.json.
 *
 * Run with: npm run atlas:build
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { parseFrontmatter } from "./atlas/parseFrontmatter";
import { stripDmBlocks } from "./atlas/stripDmBlocks";
import { tokenizeWikilinks, renderLinkTokens } from "./atlas/parseWikilinks";
import { slugify } from "./atlas/slugify";
import { loadWorldConfig } from "./atlas/loadWorldConfig";
import { parseAtlasDate } from "./atlas/calendarDate";
import type {
  AtlasProject,
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

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "atlas.config.json");

function loadConfig(): Config {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw) as Config;
}

function walk(
  dir: string,
  contentRoot: string,
  include: string[],
  exclude: string[],
  scanned: { excludedFiles: number }
): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const contentRel = path.relative(contentRoot, full).replace(/\\/g, "/");
    if (matchAny(contentRel, exclude)) {
      if (entry.isDirectory()) scanned.excludedFiles += countMd(full);
      else if (entry.name.endsWith(".md")) scanned.excludedFiles += 1;
      continue;
    }
    if (entry.isDirectory()) {
      out.push(...walk(full, contentRoot, include, exclude, scanned));
    } else if (entry.name.endsWith(".md")) {
      // include globs only filter files (not dirs); empty list = include all.
      if (include.length > 0 && !matchAny(contentRel, include)) {
        scanned.excludedFiles += 1;
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

function countMd(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) n += countMd(f);
    else if (e.name.endsWith(".md")) n += 1;
  }
  return n;
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

function deriveTitle(file: string, fmTitle?: unknown): string {
  if (typeof fmTitle === "string" && fmTitle.trim()) return fmTitle.trim();
  return path.basename(file, ".md").replace(/[-_]+/g, " ").trim();
}

function relImage(p: string): string {
  // Normalize "assets/..." paths to public output
  return p.replace(/^\/+/, "");
}

interface CliFlags {
  player: boolean;
  strict: boolean;
  outDir?: string;
}

function parseFlags(): CliFlags {
  const args = process.argv.slice(2);
  const flags: CliFlags = { player: false, strict: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--player") flags.player = true;
    else if (a === "--strict") flags.strict = true;
    else if (a === "--out") flags.outDir = args[++i];
    else if (a.startsWith("--out=")) flags.outDir = a.slice(6);
  }
  return flags;
}

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

async function main() {
  const flags = parseFlags();
  const cfg = loadConfig();
  const contentDir = path.join(ROOT, cfg.contentRoot);
  const scanInfo = { excludedFiles: 0 };
  const files = walk(contentDir, contentDir, cfg.include ?? [], cfg.exclude ?? [], scanInfo);

  // Load world config up-front so entity parsing can resolve dates against
  // the in-world calendar.
  const worldCfg = loadWorldConfig(contentDir, cfg.defaultWorld);

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
    placements: Array<{ mapId?: string; x: number; y: number }>;
    /** Legacy atlas.x / atlas.y, used only if `placements` is empty. */
    legacy?: { x: number; y: number };
  };
  const pending: Pending[] = [];
  const slugSeen = new Map<string, string>();

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(raw, rel);
    // Detect parser warnings about invalid visibility (used for strict-player gate)
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

    // Player-safe build: physically exclude dm + hidden entities (not just hide in UI).
    if (flags.player && !PLAYER_VISIBLE.has(visibility)) {
      visibilityExcluded += 1;
      continue;
    }
    // Player-safe build: also exclude entries explicitly marked publish: false
    if (flags.player && parsed.atlas.publish === false) {
      visibilityExcluded += 1;
      continue;
    }

    // DM blocks are stripped only in player builds. DM builds preserve %% ... %%
    // so the editor can still use Obsidian comments freely.
    const { text: noDmStripped, count: cStripped } = stripDmBlocks(parsed.body);
    detectedDmBlocks += cStripped;
    const noDm = flags.player ? noDmStripped : parsed.body;
    if (flags.player) strippedDmBlocks += cStripped;

    const entity: Entity = {
      id,
      title,
      type: parsed.atlas.type ?? "note",
      world: parsed.atlas.world ?? cfg.defaultWorld,
      visibility,
      canon: (parsed.atlas.canon as Entity["canon"]) ?? "canon",
      aliases: parsed.atlas.aliases ?? [],
      tags: parsed.atlas.tags ?? [],
      summary: parsed.atlas.summary,
      images: (parsed.atlas.images ?? []).map(relImage),
      body: noDm,
      bodyHtml: "",
      frontmatter: flags.player ? {} : parsed.data, // strip frontmatter from player output
      sourcePath: flags.player ? "" : rel,           // strip source paths from player output
      links: [],
      backlinks: [],
    };

    // Date / timeline support.
    const parsedDate = parseAtlasDate(parsed.atlas.date, worldCfg?.calendar);
    if (parsedDate) {
      entity.dateRaw = parsedDate.label;
      entity.dateValue = parsed.atlas.dateValue ?? parsedDate.value;
      entity.dateYear = parsedDate.year;
    } else if (typeof parsed.atlas.dateValue === "number") {
      entity.dateValue = parsed.atlas.dateValue;
      entity.dateRaw = parsed.atlas.date;
    }

    const fmAtlas = (parsed.data.atlas as Record<string, unknown>) ?? {};
    const cx = typeof fmAtlas.x === "number" ? fmAtlas.x : undefined;
    const cy = typeof fmAtlas.y === "number" ? fmAtlas.y : undefined;
    const legacy = cx !== undefined && cy !== undefined ? { x: cx, y: cy } : undefined;
    const explicitPlacements = parsed.atlas.placements ?? [];
    pending.push({ entity, rawBody: noDm, placements: explicitPlacements, legacy });
  }

  // Wikilink name index
  const nameIndex = new Map<string, string>();
  for (const { entity } of pending) {
    nameIndex.set(entity.title.toLowerCase(), entity.id);
    for (const a of entity.aliases) nameIndex.set(a.toLowerCase(), entity.id);
  }
  const resolveByName = (n: string) => nameIndex.get(n.trim().toLowerCase());

  const backlinkMap = new Map<string, Map<string, string>>();
  for (const item of pending) {
    const { entity, rawBody } = item;
    const { tokenized, links } = tokenizeWikilinks(rawBody, { resolveByName });
    entity.links = links;
    for (const l of links) {
      if (l.broken) {
        // Unresolved wikilinks are normal "not created yet" — count, don't warn.
        unresolvedLinks += 1;
      } else if (l.resolvedId) {
        if (!backlinkMap.has(l.resolvedId)) backlinkMap.set(l.resolvedId, new Map());
        backlinkMap.get(l.resolvedId)!.set(entity.id, entity.title);
      }
    }
    const html = marked.parse(tokenized, { async: false }) as string;
    // In player builds, broken link tokens (which now include links to excluded
    // dm entities) must NOT leak the target name. Render as plain display text.
    entity.bodyHtml = renderLinkTokens(html, links, { hideBroken: flags.player });
  }
  for (const { entity } of pending) {
    const m = backlinkMap.get(entity.id);
    if (m) entity.backlinks = Array.from(m.entries()).filter(([id]) => id !== entity.id).map(([id, title]) => ({ id, title }));
  }

  const worldId = cfg.defaultWorld;
  const fallbackMapId = `${worldId}-overview`;

  // worldCfg was loaded earlier (so entity dates can resolve against the calendar).
  if (worldCfg) warnings.push(...worldCfg.warnings);

  let maps: MapDocument[] = worldCfg?.maps?.length
    ? worldCfg.maps
    : [{ id: fallbackMapId, worldId, name: "Overview", width: 200000, height: 100000, layers: [], oceanColor: "#18313f", wrapX: true }];

  let regions: Region[] = worldCfg?.regions ?? [];
  let fogs: FogOverlay[] = worldCfg?.fogs ?? [];
  let regionsExcluded = 0;

  if (flags.player) {
    regions = regions.filter((r) => {
      const keep = PLAYER_VISIBLE.has(r.visibility);
      if (!keep) regionsExcluded += 1;
      return keep;
    });
  }

  // Default placements to first map if no specific mapId on entity.
  const primaryMapId = maps[0]?.id ?? fallbackMapId;
  const placements: MapPlacement[] = [];
  for (const item of pending) {
    if (!item.coords) continue;
    const { entity, coords } = item;
    if (flags.player && !PLAYER_VISIBLE.has(entity.visibility)) {
      secretPlacementsExcluded += 1;
      continue;
    }
    placements.push({
      id: `${entity.id}@${primaryMapId}`,
      entityId: entity.id,
      mapId: primaryMapId,
      x: coords.x,
      y: coords.y,
      label: entity.title,
      visibility: entity.visibility,
    });
  }

  // Resolve route waypoints (entity ids → coordinates) and filter for player.
  let routesExcluded = 0;
  const placementByEntity = new Map<string, MapPlacement>();
  placements.forEach((p) => placementByEntity.set(p.entityId, p));
  const routes: Route[] = [];
  for (const r of worldCfg?.routes ?? []) {
    if (flags.player && !PLAYER_VISIBLE.has(r.visibility)) {
      routesExcluded += 1;
      continue;
    }
    const resolved: Point[] = [];
    let dropped = false;
    for (const w of r.waypoints) {
      if (Array.isArray(w)) {
        resolved.push([w[0], w[1]]);
      } else {
        const p = placementByEntity.get(w.entityId);
        if (!p) {
          warnings.push(`route "${r.id}": waypoint entity "${w.entityId}" has no placement on any map — route skipped`);
          dropped = true;
          break;
        }
        resolved.push([p.x, p.y]);
      }
    }
    if (dropped || resolved.length < 2) continue;
    routes.push({
      id: r.id,
      mapId: r.mapId,
      name: r.name,
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

  // -------- Asset validation --------
  // Walk every entity image and every map layer src. We separate:
  //   - external URLs (http(s)/data) — warned but allowed
  //   - local paths    — must exist under public/ (or the configured outputDir's parent)
  const PUBLIC_DIR = path.join(ROOT, "public");
  const missingAssetList: string[] = [];
  const externalAssetList: string[] = [];

  const checkAsset = (raw: string, owner: string) => {
    if (!raw) return;
    const isExternal = /^(https?:|data:|blob:)/i.test(raw);
    if (isExternal) {
      externalAssets += 1;
      externalAssetList.push(`${owner}: ${raw}`);
      warnings.push(`${owner}: external asset "${raw}" — not bundled with the player build`);
      return;
    }
    localAssets += 1;
    // Local: try public/<path> with leading slash stripped.
    const rel = raw.replace(/^\/+/, "");
    const abs = path.join(PUBLIC_DIR, rel);
    if (!fs.existsSync(abs)) {
      missingAssets += 1;
      missingAssetList.push(`${owner}: missing local asset "${raw}" (looked in public/${rel})`);
    }
  };

  for (const { entity } of pending) {
    for (const img of entity.images) checkAsset(img, `entity ${entity.id}`);
  }
  for (const m of maps) {
    for (const layer of m.layers ?? []) checkAsset(layer.src, `map ${m.id} layer ${layer.id}`);
  }

  const project: AtlasProject = {
    version: new Date().toISOString().replace(/[:.]/g, "-"),
    publishedAt: new Date().toISOString(),
    worlds: [{ id: worldId, name: "Astrath Deeprealm", defaultMapId: primaryMapId }],
    maps,
    entities: pending.map((p) => p.entity),
    placements,
    assets: [],
    calendar: worldCfg?.calendar,
    buildReport: {
      scanned: files.length + scanInfo.excludedFiles,
      included: pending.length,
      excluded: scanInfo.excludedFiles + visibilityExcluded,
      warnings,
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
  const stripMd = (s: string) =>
    s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, (_m, t, d) => d || t)
      .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
      .replace(/[*_`>#~]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const searchIndex = pending.map(({ entity }) => ({
    id: entity.id,
    title: entity.title,
    type: entity.type,
    aliases: entity.aliases,
    tags: entity.tags,
    summary: entity.summary,
    excerpt: entity.body.replace(/\s+/g, " ").trim().slice(0, 240),
    body: stripMd(entity.body).slice(0, 4000),
    dateRaw: entity.dateRaw,
    dateValue: entity.dateValue,
    dateYear: entity.dateYear,
  }));
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
  console.log(`Warnings:                ${warnings.length}`);
  console.log(`Errors:                  ${errors.length}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const m of missingAssetList) console.log(`  ✗ ${m}`);
  console.log(`\nWrote ${path.relative(ROOT, path.join(outDir, "atlas.json"))}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(outDir, "search-index.json"))}\n`);

  if (errors.length > 0) {
    console.error("Build failed: validation errors above.");
    process.exit(1);
  }
  // Strict + player must NEVER ship a build with invalid visibility values,
  // because the parser silently coerces them to "dm" and the spoiler risk
  // demands authoring discipline.
  if (flags.player && flags.strict && invalidVisibilityCount > 0) {
    console.error(`Strict player mode: ${invalidVisibilityCount} invalid visibility value(s). Failing build.`);
    process.exit(3);
  }
  // Missing local assets in a strict player build must fail — players would
  // see broken images. External URLs only warn.
  if (flags.player && flags.strict && missingAssets > 0) {
    console.error(`Strict player mode: ${missingAssets} missing local asset(s). Failing build.`);
    process.exit(4);
  }
  // Strict mode (non-asset, non-link) still fails on duplicate slugs etc.
  // Unresolved wikilinks are explicitly allowed and do NOT fail strict.
  if (flags.strict && duplicateSlugs > 0) {
    console.error("Strict mode: duplicate slugs present. Failing build.");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
