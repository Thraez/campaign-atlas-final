#!/usr/bin/env tsx
/**
 * Snapshot the about-to-be-overwritten player atlas to
 * public/atlas/.last-published.json, the editor diff baseline.
 *
 * D11: now an importable function so publish-push can snapshot AFTER a
 * successful push (not before the build). The CLI shim preserves the old
 * `npm run atlas:snapshot` behaviour for the atlas:publish chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Copy public/atlas/atlas.json → .last-published.json. Returns true if copied,
 *  false if there was no atlas.json yet. Never throws on a missing source. */
export function snapshotBaseline(repoRoot: string = process.cwd()): boolean {
  const src = path.resolve(repoRoot, "public/atlas/atlas.json");
  const dst = path.resolve(repoRoot, "public/atlas/.last-published.json");
  if (!fs.existsSync(src)) {
    console.log("snapshot-baseline: public/atlas/atlas.json not present yet — nothing to snapshot.");
    return false;
  }
  try {
    fs.copyFileSync(src, dst);
    console.log("snapshot-baseline: copied atlas.json → .last-published.json");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`snapshot-baseline: failed to write .last-published.json — ${msg} (continuing)`);
    return false;
  }
}

// CLI shim: only runs when invoked directly, never on import.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) snapshotBaseline();
