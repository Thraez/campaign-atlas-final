/**
 * Dev tool: makes oversized map PNGs under public/atlas/assets/maps lighter
 * without losing a pixel, and repoints the matching world.yaml layers[].src
 * entries from .png to .webp.
 *
 * Maps stay lossless (fog redaction and map labels smear under a lossy
 * encode), so the format rules and encode settings come from
 * src/atlas/assets/imageEncoding.ts, shared with the save pipeline:
 *   - an 8-bit PNG map becomes a lossless WebP (scripts/atlas/mapWebp.ts),
 *     never resized, checked pixel for pixel (RGBA) before the PNG goes;
 *   - every other map (JPG, WebP, GIF, SVG, ...) is left as is and listed;
 *   - a PNG that wouldn't come out exact is skipped and listed: a 16-bit PNG
 *     (WebP is 8-bit), or one hiding colour under fully transparent pixels
 *     (the encoder rewrites it and sharp 0.34 has no `exact` option).
 *
 * Like images:optimize, the source PNG is deleted once its twin is written and
 * world.yaml repointed (git keeps it), so a second run does nothing. An
 * existing .webp is never overwritten, and two sources that would share one
 * twin (Region.PNG and Region.png) stop the run before anything is written.
 *
 * Run with: npm run maps:optimize [-- <mapsDir> [--content <dir>]...]
 * With no arguments it works on public/atlas/assets/maps and repoints
 * world.yaml under content/ and examples/. Given a mapsDir, it repoints only
 * the --content roots named (none by default), so a trial run on a temp copy
 * never touches the real world.yaml.
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import {
  formatOfFileName,
  mapKeepReason,
  webpTargetName,
} from "../../src/atlas/assets/imageEncoding";
import { SIZE_WARN_BYTES } from "../../src/atlas/assets/assetSize";
import { encodeMapWebp } from "../atlas/mapWebp";
import { escapeRegExp, findFiles } from "./devFiles";

const DEFAULT_MAPS_DIR = "public/atlas/assets/maps";
const DEFAULT_SEARCH_ROOTS = ["content", "examples"];

export interface ConvertedMap {
  from: string;
  to: string;
  beforeBytes: number;
  afterBytes: number;
  /** world.yaml files whose layer src was repointed at the twin. */
  rewrittenFiles: string[];
}

/** A map file that was not converted, and why. */
export interface MapNote {
  file: string;
  reason: string;
}

export interface OptimizeMapsResult {
  converted: ConvertedMap[];
  /** Non-PNG maps, published as is. */
  kept: MapNote[];
  /** PNG maps not converted on this run (under threshold, twin exists, 16-bit). */
  skipped: MapNote[];
}

export interface OptimizeMapsOptions {
  mapsDir?: string;
  searchRoots?: string[];
  /** Only PNGs larger than this are converted. Defaults to the asset size warning. */
  minBytes?: number;
}

/**
 * Groups of PNG names that would all produce the same twin on a
 * case-insensitive file system (Region.PNG and Region.png → Region.webp).
 */
export function findTwinCollisions(pngNames: string[]): string[][] {
  const byTwin = new Map<string, string[]>();
  for (const name of pngNames) {
    const key = webpTargetName(name).toLowerCase();
    byTwin.set(key, [...(byTwin.get(key) ?? []), name]);
  }
  return [...byTwin.values()].filter((group) => group.length > 1);
}

function findWorldYamlFiles(rootDirs: string[]): string[] {
  return findFiles(rootDirs, (dir, name) => name === "world.yaml" && basename(dir) === "_atlas");
}

/**
 * Repoint `src: /atlas/assets/maps/<from>` at `<to>`. Matches the whole value,
 * quoted or not, so `region.png.bak` or `region.png-old` is never touched.
 */
function repointLayers(yamlFiles: string[], from: string, to: string): string[] {
  const pattern = new RegExp(
    `(src:[ \\t]*(["']?)/?atlas/assets/maps/)${escapeRegExp(from)}(?=\\2[ \\t\\r]*(?:#.*)?$)`,
    "gm",
  );
  const touched: string[] = [];
  for (const file of yamlFiles) {
    const text = readFileSync(file, "utf8");
    const next = text.replace(pattern, (_m, lead: string) => `${lead}${to}`);
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
  const result: OptimizeMapsResult = { converted: [], kept: [], skipped: [] };

  let entries: string[];
  try {
    entries = readdirSync(mapsDir).filter(
      (f) => !f.startsWith(".") && statSync(join(mapsDir, f)).isFile(),
    );
  } catch {
    return result;
  }

  const pngs: string[] = [];
  for (const f of entries) {
    const reason = mapKeepReason(formatOfFileName(f));
    if (reason === null) pngs.push(f);
    else result.kept.push({ file: f, reason });
  }

  // Refuse before writing anything: one twin can't hold two sources.
  const collisions = findTwinCollisions(pngs);
  if (collisions.length > 0) {
    const list = collisions.map((g) => g.join(" + ")).join("; ");
    throw new Error(`maps:optimize: these PNGs would share one WebP twin: ${list}. Rename one.`);
  }

  // Plan every PNG first, so a refusal can't leave a half-done run.
  const present = new Set(entries.map((f) => f.toLowerCase()));
  const plan: { from: string; to: string; bytes: Buffer; out: Buffer }[] = [];
  for (const from of pngs) {
    const to = webpTargetName(from);
    const size = statSync(join(mapsDir, from)).size;
    if (size <= minBytes) {
      result.skipped.push({ file: from, reason: "under the size threshold" });
      continue;
    }
    if (present.has(to.toLowerCase())) {
      result.skipped.push({ file: from, reason: `${to} already exists; not replaced` });
      continue;
    }
    // Read the bytes rather than handing sharp the path: sharp reads lazily
    // and holds the file open, which on Windows blocks the rmSync below.
    const bytes = readFileSync(join(mapsDir, from));
    // Encodes and checks every pixel; a 16-bit PNG or one whose transparent
    // pixels hide colour is skipped, never converted with loss.
    const encoded = await encodeMapWebp(bytes);
    if (!encoded.ok) {
      result.skipped.push({ file: from, reason: encoded.reason });
      continue;
    }
    plan.push({ from, to, bytes, out: encoded.webp });
  }

  const yamlFiles = plan.length > 0 ? findWorldYamlFiles(searchRoots) : [];
  for (const { from, to, bytes, out } of plan) {
    writeFileSync(join(mapsDir, to), out);
    const rewrittenFiles = repointLayers(yamlFiles, from, to);
    rmSync(join(mapsDir, from), { force: true });
    result.converted.push({
      from,
      to,
      beforeBytes: bytes.length,
      afterBytes: out.length,
      rewrittenFiles,
    });
  }

  return result;
}

/** `[mapsDir] [--content <dir>]...` → options. */
export function parseArgs(argv: string[]): OptimizeMapsOptions {
  const content: string[] = [];
  let mapsDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--content") {
      const dir = argv[++i];
      if (!dir) throw new Error("maps:optimize: --content needs a directory");
      content.push(dir);
    } else if (mapsDir === undefined) {
      mapsDir = argv[i];
    } else {
      throw new Error(`maps:optimize: unexpected argument ${argv[i]}`);
    }
  }
  if (mapsDir === undefined) {
    return content.length > 0 ? { searchRoots: content } : {};
  }
  return { mapsDir, searchRoots: content };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`maps:optimize: ${opts.mapsDir ?? DEFAULT_MAPS_DIR}`);
  const { converted, kept, skipped } = await optimizeMaps(opts);
  for (const k of kept) console.log(`${k.file}: kept as is (${k.reason})`);
  for (const s of skipped) console.log(`${s.file}: skipped (${s.reason})`);
  for (const c of converted) {
    const beforeKb = Math.round(c.beforeBytes / 1024);
    const afterKb = Math.round(c.afterBytes / 1024);
    console.log(`${c.from} -> ${c.to}: png ${beforeKb}KB -> lossless webp ${afterKb}KB`);
    for (const f of c.rewrittenFiles) console.log(`  -> repointed ${f}`);
    if (c.rewrittenFiles.length === 0) {
      console.log(`  -> no world.yaml reference found for ${c.from}`);
    }
  }
  console.log(
    `maps:optimize: ${converted.length} converted, ${skipped.length} skipped, ${kept.length} kept as is.`,
  );
}

// Only run when invoked directly, so the tests can import the function.
if (process.argv[1] && basename(process.argv[1]).startsWith("optimize-maps")) {
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  });
}
