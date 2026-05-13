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

function walk(dir: string, exclude: string[], scanned: { excludedFiles: number }): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (matchAny(rel, exclude) || matchAny(entry.name, exclude.map(stripPrefix))) {
      if (entry.isDirectory()) scanned.excludedFiles += countMd(full);
      else if (entry.name.endsWith(".md")) scanned.excludedFiles += 1;
      continue;
    }
    if (entry.isDirectory()) out.push(...walk(full, exclude, scanned));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function stripPrefix(g: string): string {
  return g.replace(/^\*\*\//, "").replace(/\/\*\*$/, "");
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
  const files = walk(contentDir, cfg.exclude, scanInfo);

  // Load world config up-front so entity parsing can resolve dates against
  // the in-world calendar.
  const worldCfg = loadWorldConfig(contentDir, cfg.defaultWorld);

  const warnings: string[] = [];
  const errors: string[] = [];
  let strippedDmBlocks = 0;
  let duplicateSlugs = 0;
  let brokenLinks = 0;
  let visibilityExcluded = 0;
  let secretPlacementsExcluded = 0;

  type Pending = { entity: Entity; rawBody: string; coords?: { x: number; y: number } };
  const pending: Pending[] = [];
  const slugSeen = new Map<string, string>();

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(raw, rel);
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

    const { text: noDm, count } = stripDmBlocks(parsed.body);
    strippedDmBlocks += count;

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
    const fmAtlas = (parsed.data.atlas as Record<string, unknown>) ?? {};
    const cx = typeof fmAtlas.x === "number" ? fmAtlas.x : undefined;
    const cy = typeof fmAtlas.y === "number" ? fmAtlas.y : undefined;
    const coords = cx !== undefined && cy !== undefined ? { x: cx, y: cy } : undefined;
    pending.push({ entity, rawBody: noDm, coords });
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
        brokenLinks += 1;
        warnings.push(`${entity.sourcePath || entity.id}: broken wikilink "${l.target}"`);
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

  // Load optional world.yaml (maps, regions, fog).
  const worldCfg = loadWorldConfig(contentDir, worldId);
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

  const project: AtlasProject = {
    version: new Date().toISOString().replace(/[:.]/g, "-"),
    publishedAt: new Date().toISOString(),
    worlds: [{ id: worldId, name: "Astrath Deeprealm", defaultMapId: primaryMapId }],
    maps,
    entities: pending.map((p) => p.entity),
    placements,
    assets: [],
    buildReport: {
      scanned: files.length + scanInfo.excludedFiles,
      included: pending.length,
      excluded: scanInfo.excludedFiles + visibilityExcluded,
      warnings,
      brokenLinks,
      duplicateSlugs,
      strippedDmBlocks,
    },
  };

  const outDir = path.resolve(ROOT, flags.outDir ?? cfg.outputDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "atlas.json"), JSON.stringify(project, null, 2));

  const searchIndex = pending.map(({ entity }) => ({
    id: entity.id,
    title: entity.title,
    type: entity.type,
    aliases: entity.aliases,
    tags: entity.tags,
    summary: entity.summary,
    excerpt: entity.body.replace(/\s+/g, " ").trim().slice(0, 240),
  }));
  fs.writeFileSync(path.join(outDir, "search-index.json"), JSON.stringify(searchIndex, null, 2));

  const r = project.buildReport!;
  console.log(`\n=== Atlas build report (${flags.player ? "PLAYER" : "DM"}${flags.strict ? ", strict" : ""}) ===`);
  console.log(`Scanned:                 ${r.scanned}`);
  console.log(`Included entities:       ${r.included}`);
  console.log(`Excluded by folder:      ${scanInfo.excludedFiles}`);
  console.log(`Excluded by visibility:  ${visibilityExcluded}`);
  console.log(`Stripped DM blocks:      ${r.strippedDmBlocks}`);
  console.log(`Excluded secret pins:    ${secretPlacementsExcluded}`);
  console.log(`Excluded secret regions: ${regionsExcluded}`);
  console.log(`Excluded secret routes:  ${routesExcluded}`);
  console.log(`Maps:                    ${maps.length}`);
  console.log(`Regions:                 ${regions.length}`);
  console.log(`Routes:                  ${routes.length}`);
  console.log(`Broken wikilinks:        ${r.brokenLinks}`);
  console.log(`Duplicate slugs:         ${r.duplicateSlugs}`);
  console.log(`Warnings:                ${warnings.length}`);
  console.log(`Errors:                  ${errors.length}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log(`\nWrote ${path.relative(ROOT, path.join(outDir, "atlas.json"))}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(outDir, "search-index.json"))}\n`);

  if (errors.length > 0) {
    console.error("Build failed: validation errors above.");
    process.exit(1);
  }
  if (flags.strict && (warnings.length > 0 || r.brokenLinks > 0)) {
    console.error("Strict mode: warnings present. Failing build.");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
