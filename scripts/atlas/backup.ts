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
 *
 * Retention: pass `--keep N` to delete the oldest .zip files in backups/
 * beyond the newest N after writing. Omit the flag to keep every backup
 * (current default behavior, unchanged).
 *
 * Restore: `npm run atlas:restore -- --restore <zip> --out <dir>` extracts a
 * backup into a fresh directory. Refuses (writes nothing) if <dir> exists
 * and is non-empty. Reports the extracted file count verified against the
 * backup's own MANIFEST.md "Files:" line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const SKIP_BASENAMES = new Set([".DS_Store", "Thumbs.db"]);

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

/** Parse `--keep N` out of CLI args. Returns undefined when the flag is absent
 *  or its value isn't a valid non-negative integer. */
export function parseKeepFlag(argv: string[]): number | undefined {
  const i = argv.indexOf("--keep");
  if (i === -1) return undefined;
  const n = Number(argv[i + 1]);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Given a directory listing, return the `.zip` filenames to delete so only
 *  the newest `keep` remain. ISO-timestamp filenames sort lexicographically
 *  in chronological order, so a plain string sort orders oldest-first.
 *  Non-.zip entries are ignored (never selected for pruning). */
export function zipsToPrune(filenames: string[], keep: number): string[] {
  const zips = filenames.filter((f) => f.endsWith(".zip")).sort();
  if (keep >= zips.length) return [];
  return zips.slice(0, zips.length - Math.max(keep, 0));
}

/** Delete the oldest .zip files in `dir` beyond the newest `keep`. Only ever
 *  unlinks files inside `dir` that `zipsToPrune` selected. */
function pruneOldBackups(dir: string, keep: number): void {
  const toPrune = zipsToPrune(fs.readdirSync(dir), keep);
  for (const name of toPrune) {
    fs.unlinkSync(path.join(dir, name));
    console.log(`  ✗ pruned ${name} (retention: keep ${keep})`);
  }
}

/** Parse `--restore <zip> --out <dir>` out of CLI args. Returns undefined
 *  unless both flags are present with a value (neither flag alone triggers
 *  restore mode — falls through to the normal backup path). */
export function parseRestoreFlag(argv: string[]): { zip: string; out: string } | undefined {
  const ri = argv.indexOf("--restore");
  const oi = argv.indexOf("--out");
  if (ri === -1 || oi === -1) return undefined;
  const zip = argv[ri + 1];
  const out = argv[oi + 1];
  if (!zip || zip.startsWith("--") || !out || out.startsWith("--")) return undefined;
  return { zip, out };
}

/** Extract the "Files: N" count out of a backup's MANIFEST.md text. Returns
 *  undefined if the line is missing or not a valid integer. */
export function parseManifestFileCount(manifestText: string): number | undefined {
  const m = manifestText.match(/^Files:\s*(\d+)\s*$/m);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : undefined;
}

/** Extract a backup zip into `outAbsDir`. Refuses (throws, writes nothing)
 *  if the zip doesn't exist or `outAbsDir` exists and already has entries.
 *  Returns the extracted file count (MANIFEST.md itself excluded, matching
 *  how backup.ts counts `Files:` when writing the manifest) alongside the
 *  manifest's own expected count for the caller to compare. */
export async function restoreBackup(
  zipAbsPath: string,
  outAbsDir: string,
): Promise<{ extracted: number; expected: number | undefined }> {
  if (!fs.existsSync(zipAbsPath)) {
    throw new Error(`backup not found: ${zipAbsPath}`);
  }
  if (fs.existsSync(outAbsDir) && fs.readdirSync(outAbsDir).length > 0) {
    throw new Error(`output directory is not empty: ${outAbsDir} — refusing to overwrite`);
  }
  const data = fs.readFileSync(zipAbsPath);
  const zip = await JSZip.loadAsync(data);

  fs.mkdirSync(outAbsDir, { recursive: true });
  let extracted = 0;
  for (const [relPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const destPath = path.join(outAbsDir, relPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const content = await entry.async("nodebuffer");
    fs.writeFileSync(destPath, content);
    if (relPath !== "MANIFEST.md") extracted++;
  }

  const manifestPath = path.join(outAbsDir, "MANIFEST.md");
  const manifestText = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  const expected = parseManifestFileCount(manifestText);
  return { extracted, expected };
}

async function runRestoreCli(zipArg: string, outArg: string): Promise<void> {
  const zipAbs = path.resolve(ROOT, zipArg);
  const outAbs = path.resolve(ROOT, outArg);
  console.log(
    `atlas:restore — extracting ${path.relative(ROOT, zipAbs)} → ${path.relative(ROOT, outAbs)}…`,
  );
  const { extracted, expected } = await restoreBackup(zipAbs, outAbs);
  console.log(`\n✓ Restored ${extracted} file(s) into ${path.relative(ROOT, outAbs)}`);
  if (expected === undefined) {
    console.warn(`  ! could not verify file count (no "Files:" line found in MANIFEST.md)`);
  } else if (expected === extracted) {
    console.log(`  ✓ verified: file count matches manifest (${expected})`);
  } else {
    console.warn(`  ! mismatch: manifest reports ${expected} file(s), extracted ${extracted}`);
  }
}

async function main(): Promise<void> {
  const restoreArgs = parseRestoreFlag(process.argv.slice(2));
  if (restoreArgs) {
    await runRestoreCli(restoreArgs.zip, restoreArgs.out);
    return;
  }

  console.log(`atlas:backup — bundling ${INCLUDE_PATHS.length} path(s)…`);
  const zip = new JSZip();
  for (const p of INCLUDE_PATHS) {
    console.log(`  • ${p}`);
    addToZip(zip, p);
  }

  // Manifest: human-readable record of what's in this zip. Helpful when
  // browsing a backup directory.
  const fileNames = Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .sort();
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
  const blob = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(OUT_FILE, blob);
  const sizeMb = (blob.length / 1024 / 1024).toFixed(2);
  console.log(
    `\n✓ Wrote ${path.relative(ROOT, OUT_FILE)} (${sizeMb} MB, ${fileNames.length} files)`,
  );

  const keep = parseKeepFlag(process.argv.slice(2));
  if (keep !== undefined) {
    pruneOldBackups(OUT_DIR, keep);
  }
}

// CLI shim: only runs when invoked directly, never on import (so tests can
// import zipsToPrune/parseKeepFlag without triggering a real backup).
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((e) => {
    console.error(`atlas:backup/restore failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
