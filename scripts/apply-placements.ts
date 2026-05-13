#!/usr/bin/env tsx
/**
 * Apply placements from a placements.json (exported by /atlas/edit) back into
 * the source markdown files' frontmatter as `atlas.x` and `atlas.y`.
 *
 * Usage: npm run atlas:apply-placements -- path/to/placements.json
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

interface Placement {
  entityId: string;
  sourcePath: string;
  mapId: string;
  x: number;
  y: number;
}

const ROOT = process.cwd();
const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/apply-placements.ts <placements.json>");
  process.exit(1);
}
const fullPath = path.resolve(ROOT, file);
if (!fs.existsSync(fullPath)) {
  console.error(`File not found: ${fullPath}`);
  process.exit(1);
}

const placements = JSON.parse(fs.readFileSync(fullPath, "utf8")) as Placement[];

let updated = 0;
let skipped = 0;
const warnings: string[] = [];

for (const p of placements) {
  if (!p.sourcePath) {
    warnings.push(`Skipped ${p.entityId}: missing sourcePath (was the atlas built in player mode?)`);
    skipped += 1;
    continue;
  }
  const md = path.resolve(ROOT, p.sourcePath);
  if (!fs.existsSync(md)) {
    warnings.push(`Skipped ${p.entityId}: file not found ${p.sourcePath}`);
    skipped += 1;
    continue;
  }
  const raw = fs.readFileSync(md, "utf8");
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const atlas = (data.atlas ?? {}) as Record<string, unknown>;
  if (atlas.x === p.x && atlas.y === p.y) {
    skipped += 1;
    continue;
  }
  atlas.x = p.x;
  atlas.y = p.y;
  data.atlas = atlas;
  const next = matter.stringify(parsed.content, data);
  fs.writeFileSync(md, next);
  updated += 1;
  console.log(`✓ ${p.sourcePath}  (${p.x}, ${p.y})`);
}

console.log(`\nApplied: ${updated}  Skipped: ${skipped}`);
for (const w of warnings) console.log(`  ! ${w}`);
console.log(`\nNext: re-run \`npm run atlas:build\` to regenerate atlas.json.`);
