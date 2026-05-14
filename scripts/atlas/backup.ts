#!/usr/bin/env tsx
/**
 * `npm run atlas:backup` — produce a portable zip snapshot of canon + assets.
 *
 * Includes:
 *   - content/           the full canon vault (markdown + world.yaml)
 *   - public/atlas/assets/  every image and map asset referenced by the build
 *   - atlas.config.json  the build config so a restore is reproducible
 *   - examples/seed-world/  the seed world so a restore stays self-sufficient
 *
 * Excludes:
 *   - node_modules, dist, dist-ssr, .local-atlas
 *   - public/atlas/atlas.json, public/atlas/search-index.json,
 *     public/atlas/.last-published.json  (regenerable from canon)
 *   - .git  (use `git bundle` for git history)
 *
 * Output: backups/<ISO timestamp>.zip
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const ROOT = process.cwd();
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.resolve(ROOT, "backups");
const OUT_FILE = path.join(OUT_DIR, `${TS}.zip`);

const INCLUDE_PATHS = [
  "content",
  "public/atlas/assets",
  "atlas.config.json",
  "examples/seed-world",
];

const SKIP_BASENAMES = new Set([
  ".DS_Store",
  "Thumbs.db",
]);

/** Recursively add a path (file or directory) to the zip under the same relative path. */
function addToZip(zip: JSZip, rel: string): void {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.warn(`  ! skipping ${rel} (not found)`);
    return;
  }
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    addFile(zip, abs, rel);
    return;
  }
  if (stat.isDirectory()) {
    walkDir(zip, abs, rel);
    return;
  }
}

function addFile(zip: JSZip, abs: string, rel: string): void {
  if (SKIP_BASENAMES.has(path.basename(rel))) return;
  zip.file(rel.replace(/\\/g, "/"), fs.readFileSync(abs));
}

function walkDir(zip: JSZip, abs: string, rel: string): void {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const subAbs = path.join(abs, entry.name);
    const subRel = path.posix.join(rel.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) {
      walkDir(zip, subAbs, subRel);
    } else if (entry.isFile()) {
      addFile(zip, subAbs, subRel);
    }
  }
}

async function main(): Promise<void> {
  console.log(`atlas:backup — bundling ${INCLUDE_PATHS.length} path(s)…`);
  const zip = new JSZip();
  for (const p of INCLUDE_PATHS) {
    console.log(`  • ${p}`);
    addToZip(zip, p);
  }

  // Manifest: human-readable record of what's in this zip. Helpful when
  // browsing a backup directory.
  const fileNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  const manifest = [
    `# Atlas backup ${TS}`,
    ``,
    `Files: ${fileNames.length}`,
    `Created: ${new Date().toISOString()}`,
    ``,
    `## Contents`,
    ...fileNames.map((f) => `- ${f}`),
  ].join("\n");
  zip.file("MANIFEST.md", manifest);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const blob = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  fs.writeFileSync(OUT_FILE, blob);
  const sizeMb = (blob.length / 1024 / 1024).toFixed(2);
  console.log(`\n✓ Wrote ${path.relative(ROOT, OUT_FILE)} (${sizeMb} MB, ${fileNames.length} files)`);
}

main().catch((e) => {
  console.error(`atlas:backup failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
