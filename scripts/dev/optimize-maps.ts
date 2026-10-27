/**
 * Dev tool: makes oversized map PNGs under public/atlas/assets/maps lighter
 * without losing a pixel, and repoints the matching world.yaml layers[].src
 * entries from .png to .webp.
 *
 * Maps stay lossless (fog redaction and map labels smear under a lossy
 * encode), so the encode settings come from src/atlas/assets/imageEncoding.ts,
 * shared with the save pipeline:
 *   - a PNG map becomes a lossless WebP twin (MAP_WEBP_OPTIONS), never resized;
 *   - a JPG map is left exactly as it is (already lossy; a lossy re-encode adds
 *     loss and a lossless one only makes it bigger).
 *
 * The source PNG is kept beside the twin, the same way audio keeps its source
 * .wav alongside the compressed .ogg/.m4a.
 *
 * Run with: npm run maps:optimize
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import sharp from "sharp";
import {
  MAP_WEBP_OPTIONS,
  shouldConvertMapToWebp,
  webpTargetName,
} from "../../src/atlas/assets/imageEncoding";
import { SIZE_WARN_BYTES } from "../../src/atlas/assets/assetSize";

const DEFAULT_MAPS_DIR = "public/atlas/assets/maps";
const DEFAULT_SEARCH_ROOTS = ["content", "examples"];
const KEPT_AS_IS = new Set(["jpg", "jpeg"]);

export interface ConvertedMap {
  from: string;
  to: string;
  beforeBytes: number;
  afterBytes: number;
  /** world.yaml files whose layer src was repointed at the twin. */
  rewrittenFiles: string[];
}

export interface OptimizeMapsResult {
  converted: ConvertedMap[];
  /** JPG maps found and deliberately left untouched. */
  kept: string[];
}

export interface OptimizeMapsOptions {
  mapsDir?: string;
  searchRoots?: string[];
  /** Only PNGs larger than this are converted. Defaults to the asset size warning. */
  minBytes?: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWorldYamlFiles(rootDirs: string[]): string[] {
  const found: string[] = [];
  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name === "world.yaml" && basename(dir) === "_atlas") {
        found.push(full);
      }
    }
  }
  for (const root of rootDirs) walk(root);
  return found;
}

function repointLayers(yamlFiles: string[], from: string, to: string): string[] {
  const pattern = new RegExp(`(src:\\s*/?atlas/assets/maps/)${escapeRegExp(from)}\\b`, "g");
  const touched: string[] = [];
  for (const file of yamlFiles) {
    const text = readFileSync(file, "utf8");
    const next = text.replace(pattern, `$1${to}`);
    if (next !== text) {
      writeFileSync(file, next);
      touched.push(file);
    }
  }
  return touched;
}

export async function optimizeMaps(opts: OptimizeMapsOptions = {}): Promise<OptimizeMapsResult> {
  const mapsDir = opts.mapsDir ?? DEFAULT_MAPS_DIR;
  const searchRoots = opts.searchRoots ?? DEFAULT_SEARCH_ROOTS;
  const minBytes = opts.minBytes ?? SIZE_WARN_BYTES;

  let entries: string[];
  try {
    entries = readdirSync(mapsDir);
  } catch {
    return { converted: [], kept: [] };
  }

  const kept = entries.filter((f) => KEPT_AS_IS.has(extname(f).slice(1).toLowerCase()));
  const sources = entries.filter(
    (f) => shouldConvertMapToWebp(extname(f)) && statSync(join(mapsDir, f)).size > minBytes,
  );
  if (sources.length === 0) return { converted: [], kept };

  const yamlFiles = findWorldYamlFiles(searchRoots);
  const converted: ConvertedMap[] = [];

  for (const from of sources) {
    const srcPath = join(mapsDir, from);
    const to = webpTargetName(from);
    // Read the bytes rather than handing sharp the path: sharp reads lazily
    // and holds the file open, which on Windows blocks cleanup.
    const out = await sharp(readFileSync(srcPath)).webp(MAP_WEBP_OPTIONS).toBuffer();
    writeFileSync(join(mapsDir, to), out);
    converted.push({
      from,
      to,
      beforeBytes: statSync(srcPath).size,
      afterBytes: out.length,
      rewrittenFiles: repointLayers(yamlFiles, from, to),
    });
  }

  return { converted, kept };
}

async function main(): Promise<void> {
  const { converted, kept } = await optimizeMaps();
  for (const f of kept) console.log(`${f}: JPG map, left as is (never re-encoded)`);
  if (converted.length === 0) {
    console.log("maps:optimize: no oversized PNG maps found, nothing to convert.");
    return;
  }
  for (const c of converted) {
    const beforeKb = Math.round(c.beforeBytes / 1024);
    const afterKb = Math.round(c.afterBytes / 1024);
    console.log(`${c.from}: png ${beforeKb}KB -> lossless webp ${afterKb}KB`);
    for (const f of c.rewrittenFiles) console.log(`  -> repointed ${f}`);
    if (c.rewrittenFiles.length === 0) {
      console.log(
        `  -> no world.yaml reference found for ${c.from} (twin emitted, nothing to repoint)`,
      );
    }
  }
}

// Only run when invoked directly, so the tests can import the function.
if (process.argv[1] && basename(process.argv[1]).startsWith("optimize-maps")) {
  void main();
}
