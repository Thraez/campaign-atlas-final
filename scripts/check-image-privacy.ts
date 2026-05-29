#!/usr/bin/env tsx
/**
 * Image-privacy scan.
 *
 * Complements check-derived-secrets.ts, which only reads text file content.
 * This script catches two image-specific leak vectors:
 *
 *   1. METADATA LEAK — an image file in the player build contains EXIF, IPTC,
 *      or XMP metadata (e.g. GPS coordinates, camera model, timestamps).
 *      Invariant: every image saved via handleSaveRequest is stripped by the
 *      server; any surviving metadata means a file was placed outside that
 *      path (manual copy, build artefact, etc.).
 *
 *   2. FILENAME LEAK — an image filename (without extension) contains a
 *      derived-secret name. The text scan misses binary files, so a file
 *      named "the-cabal-lair.jpg" would ship uncaught even if no text
 *      reference exists.
 *
 * Usage:
 *   tsx scripts/check-image-privacy.ts <artifact-dir> [--config <path>]
 *
 * Exit codes:
 *   0   clean
 *   1   bad invocation
 *   13  image privacy violation detected
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { deriveSecretsFromVault } from "./check-derived-secrets";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const CONFIG_CANDIDATES = ["atlas.config.json"];
const EXIT_VIOLATION = 13;

function findConfig(): string | null {
  for (const c of CONFIG_CANDIDATES) {
    const p = path.resolve(process.cwd(), c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseArgs(): { dir: string; config: string } | null {
  const args = process.argv.slice(2);
  let dir: string | undefined;
  let config: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config") config = args[++i];
    else if (a.startsWith("--config=")) config = a.slice(9);
    else if (!dir) dir = a;
  }
  if (!dir) return null;
  if (!config) {
    const found = findConfig();
    if (!found) return null;
    config = found;
  }
  return { dir, config };
}

function walkImages(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkImages(full));
    } else if (entry.isFile()) {
      if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  return out;
}

export interface RunOpts { dir: string; config?: string }

export async function run(opts: RunOpts): Promise<number> {
  const configAbs = opts.config ?? findConfig();
  if (!configAbs) {
    console.error("check-image-privacy: config not found (place atlas.config.json in cwd or pass --config)");
    return 1;
  }

  const images = walkImages(opts.dir);
  if (images.length === 0) {
    console.log("check-image-privacy: no images found — clean");
    return 0;
  }

  const secrets = deriveSecretsFromVault(configAbs);

  const violations: string[] = [];

  for (const imgPath of images) {
    const stem = path.basename(imgPath, path.extname(imgPath)).toLowerCase();

    // Check 1: filename contains a derived-secret name
    for (const s of secrets) {
      if (stem.includes(s.name.toLowerCase())) {
        violations.push(
          `FILENAME LEAK: ${imgPath}\n    filename contains secret "${s.name}" (from ${s.source})`,
        );
        break;
      }
    }

    // Check 2: image contains metadata that should have been stripped on upload
    try {
      const buf = fs.readFileSync(imgPath);
      const meta = await sharp(buf).metadata();
      const leaking: string[] = [];
      if (meta.exif) leaking.push("exif");
      if (meta.iptc) leaking.push("iptc");
      if (meta.xmp) leaking.push("xmp");
      if (leaking.length > 0) {
        violations.push(
          `METADATA LEAK: ${imgPath}\n    contains ${leaking.join(", ")}`,
        );
      }
    } catch {
      // Unreadable image is unexpected in a valid player build — flag it.
      violations.push(`UNREADABLE: ${imgPath}\n    could not inspect metadata`);
    }
  }

  if (violations.length === 0) {
    console.log(`check-image-privacy: ${images.length} image(s) scanned — clean`);
    return 0;
  }

  console.error("\ncheck-image-privacy: VIOLATIONS FOUND\n");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} violation(s) — player build must not ship`);
  return EXIT_VIOLATION;
}

async function main(): Promise<number> {
  const args = parseArgs();
  if (!args) {
    console.error("Usage: tsx scripts/check-image-privacy.ts <artifact-dir> [--config <path>]");
    return 1;
  }
  return run({ dir: args.dir, config: args.config });
}

// Run only when invoked as a script (not when imported by tests).
const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("check-image-privacy.ts") || arg1.endsWith("check-image-privacy.js");
})();
if (invokedAsScript) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error("check-image-privacy: crashed", e);
      process.exit(1);
    });
}
