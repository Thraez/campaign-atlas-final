#!/usr/bin/env tsx
/**
 * Apply placements from a placements.json (exported by /atlas/edit) back into
 * the source markdown files' frontmatter.
 *
 * Writes `atlas.placements: [{mapId, x, y}, ...]` so one entity can carry pins
 * for multiple maps at once. Legacy `atlas.x` / `atlas.y` are still respected
 * by the build script, but apply-placements removes them when it writes a
 * `placements` array (single source of truth).
 *
 * Round-trip behavior:
 * - Placements grouped by entity (sourcePath) — multiple maps merge into one
 *   `atlas.placements` array.
 * - Existing `atlas.placements` entries on maps NOT mentioned in the input file
 *   are preserved (the editor only knows about the active map).
 * - Existing `atlas.placements` entries on maps that ARE mentioned are
 *   replaced with the new coords.
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

// Group input placements by source markdown file.
const grouped = new Map<string, Placement[]>();
const warnings: string[] = [];
for (const p of placements) {
  if (!p.sourcePath) {
    warnings.push(`Skipped ${p.entityId}: missing sourcePath (was the atlas built in player mode?)`);
    continue;
  }
  if (!p.mapId) {
    warnings.push(`Skipped ${p.entityId}: missing mapId`);
    continue;
  }
  const arr = grouped.get(p.sourcePath) ?? [];
  arr.push(p);
  grouped.set(p.sourcePath, arr);
}

let updated = 0;
let skipped = 0;

for (const [sourcePath, entries] of grouped) {
  const md = path.resolve(ROOT, sourcePath);
  if (!fs.existsSync(md)) {
    warnings.push(`Skipped ${sourcePath}: file not found`);
    skipped += 1;
    continue;
  }
  const raw = fs.readFileSync(md, "utf8");
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const atlas = (data.atlas ?? {}) as Record<string, unknown>;

  // Preserve existing placements on maps NOT touched by this round-trip.
  const existing = Array.isArray(atlas.placements) ? atlas.placements as Array<Record<string, unknown>> : [];
  const touchedMapIds = new Set(entries.map((e) => e.mapId));
  const preserved = existing.filter(
    (e) => typeof e.mapId === "string" && !touchedMapIds.has(e.mapId)
  );
  const next = [
    ...preserved,
    ...entries.map((e) => ({ mapId: e.mapId, x: e.x, y: e.y })),
  ].sort((a, b) => String(a.mapId).localeCompare(String(b.mapId)));

  // Determine if anything actually changed.
  const same =
    existing.length === next.length &&
    existing.every((e, i) => {
      const n = next[i];
      return e.mapId === n.mapId && e.x === n.x && e.y === n.y;
    });

  if (same && atlas.x === undefined && atlas.y === undefined) {
    skipped += 1;
    continue;
  }

  atlas.placements = next;
  // The placements array is now authoritative — drop legacy single-coord fields
  // so we don't end up with two sources of truth.
  delete atlas.x;
  delete atlas.y;
  data.atlas = atlas;

  fs.writeFileSync(md, matter.stringify(parsed.content, data));
  updated += 1;
  const summary = next.map((p) => `${p.mapId}:${p.x},${p.y}`).join("  ");
  console.log(`✓ ${sourcePath}  ${summary}`);
}

console.log(`\nApplied: ${updated}  Skipped: ${skipped}`);
for (const w of warnings) console.log(`  ! ${w}`);
console.log(`\nNext: re-run \`npm run atlas:build\` to regenerate atlas.json.`);
