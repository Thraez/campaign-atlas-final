#!/usr/bin/env tsx
/**
 * Snapshot the about-to-be-overwritten player atlas to
 * `public/atlas/.last-published.json`, so the editor's "Changes since last
 * publish" panel has a baseline to diff against.
 *
 * Run as `npm run atlas:snapshot` (chained at the start of `atlas:publish`).
 *
 * - Reads `public/atlas/atlas.json` (the currently deployed player build).
 * - Writes that content verbatim to `public/atlas/.last-published.json`.
 * - If `atlas.json` doesn't exist yet (first ever build), exits 0 silently.
 * - Never fails the build — diff is a nice-to-have, not a safety gate.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.resolve(ROOT, "public/atlas/atlas.json");
const DST = path.resolve(ROOT, "public/atlas/.last-published.json");

function main() {
  if (!fs.existsSync(SRC)) {
    console.log("snapshot-baseline: public/atlas/atlas.json not present yet — nothing to snapshot.");
    return;
  }
  try {
    fs.copyFileSync(SRC, DST);
    console.log(`snapshot-baseline: copied atlas.json → .last-published.json`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`snapshot-baseline: failed to write .last-published.json — ${msg} (continuing)`);
  }
}

main();
