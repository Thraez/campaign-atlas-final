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
import type {
  AtlasProject,
  Entity,
  MapPlacement,
  ResolvedLink,
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

async function main() {
  const cfg = loadConfig();
  const contentDir = path.join(ROOT, cfg.contentRoot);
  const scanInfo = { excludedFiles: 0 };
  const files = walk(contentDir, cfg.exclude, scanInfo);

  const warnings: string[] = [];
  let strippedDmBlocks = 0;
  let duplicateSlugs = 0;
  let brokenLinks = 0;

  // First pass: parse frontmatter + body, build entity skeletons
  type Pending = {
    entity: Entity;
    rawBody: string;
  };
  const pending: Pending[] = [];
  const slugSeen = new Map<string, string>();

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(raw, rel);
    warnings.push(...parsed.warnings);

    const title = deriveTitle(file, (parsed.data.title as string) ?? undefined);
    if (!title) {
      warnings.push(`${rel}: missing title`);
      continue;
    }

    const id = parsed.atlas.id || slugify(title);
    if (slugSeen.has(id)) {
      duplicateSlugs += 1;
      warnings.push(
        `${rel}: duplicate slug "${id}" also produced by ${slugSeen.get(id)} — skipping`
      );
      continue;
    }
    slugSeen.set(id, rel);

    const { text: noDm, count } = stripDmBlocks(parsed.body);
    strippedDmBlocks += count;

    const entity: Entity = {
      id,
      title,
      type: parsed.atlas.type ?? "note",
      world: parsed.atlas.world ?? cfg.defaultWorld,
      visibility: parsed.atlas.visibility ?? (parsed.atlas.publish === false ? "dm" : "player"),
      canon: (parsed.atlas.canon as Entity["canon"]) ?? "canon",
      aliases: parsed.atlas.aliases ?? [],
      tags: parsed.atlas.tags ?? [],
      summary: parsed.atlas.summary,
      images: (parsed.atlas.images ?? []).map(relImage),
      body: noDm,
      bodyHtml: "",
      frontmatter: parsed.data,
      sourcePath: rel,
      links: [],
      backlinks: [],
    };
    pending.push({ entity, rawBody: noDm });
  }

  // Build name index for wikilink resolution
  const nameIndex = new Map<string, string>();
  for (const { entity } of pending) {
    nameIndex.set(entity.title.toLowerCase(), entity.id);
    for (const a of entity.aliases) nameIndex.set(a.toLowerCase(), entity.id);
  }
  const resolveByName = (n: string) => nameIndex.get(n.trim().toLowerCase());

  // Second pass: tokenize wikilinks, render markdown, restore links, build backlinks
  const backlinkMap = new Map<string, Map<string, string>>(); // targetId -> (sourceId -> sourceTitle)

  for (const item of pending) {
    const { entity, rawBody } = item;
    const { tokenized, links } = tokenizeWikilinks(rawBody, { resolveByName });
    entity.links = links;
    for (const l of links) {
      if (l.broken) {
        brokenLinks += 1;
        warnings.push(`${entity.sourcePath}: broken wikilink "${l.target}"`);
      } else if (l.resolvedId) {
        if (!backlinkMap.has(l.resolvedId)) backlinkMap.set(l.resolvedId, new Map());
        backlinkMap.get(l.resolvedId)!.set(entity.id, entity.title);
      }
    }
    const html = marked.parse(tokenized, { async: false }) as string;
    entity.bodyHtml = renderLinkTokens(html, links);
  }
  for (const { entity } of pending) {
    const map = backlinkMap.get(entity.id);
    if (map) {
      entity.backlinks = Array.from(map.entries())
        .filter(([id]) => id !== entity.id)
        .map(([id, title]) => ({ id, title }));
    }
  }

  // Seed default world + map document so the published atlas has context.
  // Map dimensions match the existing in-app default (Tidemarrow-sized) — Batch 2
  // will replace this with proper map documents read from content.
  const worldId = cfg.defaultWorld;
  const mapId = `${worldId}-overview`;

  // Bootstrap map placements from frontmatter atlas.x / atlas.y if present.
  // (Visual placement editor will populate these in a later batch.)
  const placements: MapPlacement[] = [];
  for (const { entity } of pending) {
    const fmAtlas = (entity.frontmatter.atlas as Record<string, unknown>) ?? {};
    const x = typeof fmAtlas.x === "number" ? fmAtlas.x : undefined;
    const y = typeof fmAtlas.y === "number" ? fmAtlas.y : undefined;
    if (x !== undefined && y !== undefined) {
      placements.push({
        id: `${entity.id}@${mapId}`,
        entityId: entity.id,
        mapId,
        x,
        y,
        label: entity.title,
        visibility: entity.visibility,
      });
    }
  }

  const project: AtlasProject = {
    version: new Date().toISOString().replace(/[:.]/g, "-"),
    publishedAt: new Date().toISOString(),
    worlds: [{ id: worldId, name: "Astrath Deeprealm", defaultMapId: mapId }],
    maps: [
      {
        id: mapId,
        worldId,
        name: "Overview",
        width: 200000,
        height: 100000,
        layers: [],
        oceanColor: "#18313f",
        wrapX: true,
      },
    ],
    entities: pending.map((p) => p.entity),
    placements,
    assets: [],
    buildReport: {
      scanned: files.length + scanInfo.excludedFiles,
      included: pending.length,
      excluded: scanInfo.excludedFiles,
      warnings,
      brokenLinks,
      duplicateSlugs,
      strippedDmBlocks,
    },
  };

  const outDir = path.join(ROOT, cfg.outputDir);
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
  fs.writeFileSync(
    path.join(outDir, "search-index.json"),
    JSON.stringify(searchIndex, null, 2)
  );

  // Report
  const r = project.buildReport!;
  console.log("\n=== Atlas build report ===");
  console.log(`Scanned:           ${r.scanned}`);
  console.log(`Included entities: ${r.included}`);
  console.log(`Excluded files:    ${r.excluded}`);
  console.log(`Stripped DM blocks: ${r.strippedDmBlocks}`);
  console.log(`Broken wikilinks:  ${r.brokenLinks}`);
  console.log(`Duplicate slugs:   ${r.duplicateSlugs}`);
  console.log(`Warnings:          ${r.warnings.length}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  console.log(`\nWrote ${path.relative(ROOT, path.join(outDir, "atlas.json"))}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(outDir, "search-index.json"))}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
