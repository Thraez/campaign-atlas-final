/**
 * Asset auditor for the atlas content vault.
 *
 * Walks every file in the assets directory (default: public/atlas/assets/)
 * and every asset reference in the content tree (markdown image syntax,
 * frontmatter `atlas.images`, and `world.yaml` `layers[].src`) and reports:
 *
 *   - oversize images   — > 1 MB warn, > 4 MB error
 *   - orphaned files    — exist on disk but referenced by no content (warn)
 *   - broken references — referenced by content but missing on disk (info;
 *                         build-atlas.ts already errors on this case)
 *
 * The point is to catch the slow-bloat failure modes before the player build
 * ships them: hand-painted PNGs that should have been WEBPs, stale draft
 * exports left in the assets folder, and typo'd map src paths.
 *
 * Usage:
 *   tsx scripts/atlas/audit-assets.ts \
 *     [--assets-dir <path>] \
 *     [--content-dir <path>] \
 *     [--config <atlas.config.json>] \
 *     [--strict]
 *
 * Exit codes:
 *   0   clean (or only warnings, unless --strict)
 *   1   bad invocation
 *   13  errors found (oversize > 4 MB hard cap, or --strict with any warning)
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/** Soft warning threshold for a single asset. */
export const SIZE_WARN_BYTES = 1 * 1024 * 1024;
/** Hard error threshold for a single asset. */
export const SIZE_ERROR_BYTES = 4 * 1024 * 1024;

/** Extensions that count as image/asset files when walking the assets dir. */
const ASSET_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif", ".bmp",
]);

interface Config {
  contentRoot: string;
  outputDir: string;
  defaultWorld: string;
  include: string[];
  exclude: string[];
}

export interface AssetRecord {
  /** Absolute path on disk. */
  absPath: string;
  /** Path normalized for comparison with content references (POSIX,
   *  relative to the public/ root, no leading slash).
   *  e.g. "atlas/assets/maps/main.jpg" */
  refPath: string;
  /** File size in bytes. */
  size: number;
}

export interface AssetReference {
  /** Normalized path, relative to public/, POSIX-style. */
  refPath: string;
  /** Source file that contained the reference (for error reports). */
  source: string;
}

export interface SizeFinding {
  severity: "error" | "warning";
  refPath: string;
  size: number;
}

export interface OrphanFinding {
  refPath: string;
  size: number;
}

export interface BrokenRefFinding {
  refPath: string;
  source: string;
}

export interface AuditReport {
  assets: AssetRecord[];
  references: AssetReference[];
  oversize: SizeFinding[];
  orphans: OrphanFinding[];
  brokenRefs: BrokenRefFinding[];
  totals: {
    assetCount: number;
    totalBytes: number;
    oversizeCount: number;
    orphanCount: number;
    brokenRefCount: number;
  };
}

/** True for URLs we do not own (http/https/data/blob). */
export function isExternalUrl(raw: string): boolean {
  return /^(https?:|data:|blob:)/i.test(raw);
}

/**
 * Normalize an asset reference for comparison with disk records.
 * Strips leading slashes and converts backslashes to forward slashes.
 * Returns null for external URLs and empty strings.
 */
export function normalizeRefPath(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isExternalUrl(trimmed)) return null;
  return trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Recursively walk a directory and collect every asset file with its size. */
export function collectAssets(assetsDir: string, publicDir: string): AssetRecord[] {
  const out: AssetRecord[] = [];
  if (!fs.existsSync(assetsDir)) return out;
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!ASSET_EXTENSIONS.has(ext)) continue;
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      const refPath = path.relative(publicDir, full).replace(/\\/g, "/");
      out.push({ absPath: full, refPath, size });
    }
  }
  walk(assetsDir);
  return out;
}

/**
 * Extract markdown image references: `![alt](path)`.
 * Returns the raw path captures (not normalized).
 */
export function extractMarkdownImageRefs(markdown: string): string[] {
  const out: string[] = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/**
 * Extract `atlas.images: [...]` from a frontmatter YAML block.
 * Returns the raw path strings (not normalized). Best-effort: a missing or
 * malformed frontmatter block returns an empty array.
 */
export function extractFrontmatterImageRefs(markdown: string): string[] {
  if (!markdown.startsWith("---")) return [];
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return [];
  const fmBlock = markdown.slice(3, end);
  let doc: unknown;
  try {
    doc = yaml.load(fmBlock);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];
  const atlas = (doc as Record<string, unknown>).atlas;
  if (!atlas || typeof atlas !== "object") return [];
  const images = (atlas as Record<string, unknown>).images;
  if (!Array.isArray(images)) return [];
  return images.filter((v): v is string => typeof v === "string");
}

/**
 * Extract `layers[].src` paths from a parsed world.yaml document.
 * Returns the raw path strings (not normalized).
 */
export function extractWorldYamlLayerSrcs(doc: unknown): string[] {
  const out: string[] = [];
  if (!doc || typeof doc !== "object") return out;
  const maps = (doc as Record<string, unknown>).maps;
  if (!Array.isArray(maps)) return out;
  for (const m of maps) {
    if (!m || typeof m !== "object") continue;
    const layers = (m as Record<string, unknown>).layers;
    if (!Array.isArray(layers)) continue;
    for (const l of layers) {
      if (!l || typeof l !== "object") continue;
      const src = (l as Record<string, unknown>).src;
      if (typeof src === "string") out.push(src);
    }
  }
  return out;
}

/** Recursively walk a directory and collect all .md files plus _atlas/world.yaml. */
function walkContent(contentDir: string): { mdFiles: string[]; yamlFiles: string[] } {
  const mdFiles: string[] = [];
  const yamlFiles: string[] = [];
  if (!fs.existsSync(contentDir)) return { mdFiles, yamlFiles };
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        if (e.name.endsWith(".md")) {
          mdFiles.push(full);
        } else if (e.name === "world.yaml" && path.basename(dir) === "_atlas") {
          yamlFiles.push(full);
        }
      }
    }
  }
  walk(contentDir);
  return { mdFiles, yamlFiles };
}

/**
 * Walk content/ and gather every asset reference along with its source file.
 * Skips external URLs.
 */
export function collectReferences(contentDir: string): AssetReference[] {
  const out: AssetReference[] = [];
  const { mdFiles, yamlFiles } = walkContent(contentDir);
  for (const file of mdFiles) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    const raws = [
      ...extractMarkdownImageRefs(text),
      ...extractFrontmatterImageRefs(text),
    ];
    for (const r of raws) {
      const norm = normalizeRefPath(r);
      if (!norm) continue;
      out.push({ refPath: norm, source: rel });
    }
  }
  for (const file of yamlFiles) {
    let doc: unknown;
    try {
      doc = yaml.load(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    for (const src of extractWorldYamlLayerSrcs(doc)) {
      const norm = normalizeRefPath(src);
      if (!norm) continue;
      out.push({ refPath: norm, source: rel });
    }
  }
  return out;
}

export interface AuditOptions {
  /** Absolute path to the directory of assets to audit. */
  assetsDir: string;
  /** Absolute path to the public/ root (used to relativize asset paths
   *  for comparison with content references). Typically the parent of
   *  `atlas/assets/`. */
  publicDir: string;
  /** Absolute path to the content/ directory. */
  contentDir: string;
  /** Override soft size threshold (default SIZE_WARN_BYTES). */
  warnBytes?: number;
  /** Override hard size threshold (default SIZE_ERROR_BYTES). */
  errorBytes?: number;
}

/**
 * Run the asset audit. Pure over filesystem reads; emits a structured report
 * but does not log or exit.
 */
export function auditAssets(opts: AuditOptions): AuditReport {
  const warnBytes = opts.warnBytes ?? SIZE_WARN_BYTES;
  const errorBytes = opts.errorBytes ?? SIZE_ERROR_BYTES;

  const assets = collectAssets(opts.assetsDir, opts.publicDir);
  const references = collectReferences(opts.contentDir);

  // Build sets for cheap lookups in both directions.
  const assetByRefPath = new Map<string, AssetRecord>();
  for (const a of assets) assetByRefPath.set(a.refPath, a);
  const referencedRefPaths = new Set<string>();
  for (const r of references) referencedRefPaths.add(r.refPath);

  const oversize: SizeFinding[] = [];
  for (const a of assets) {
    if (a.size > errorBytes) {
      oversize.push({ severity: "error", refPath: a.refPath, size: a.size });
    } else if (a.size > warnBytes) {
      oversize.push({ severity: "warning", refPath: a.refPath, size: a.size });
    }
  }

  const orphans: OrphanFinding[] = [];
  for (const a of assets) {
    if (!referencedRefPaths.has(a.refPath)) {
      orphans.push({ refPath: a.refPath, size: a.size });
    }
  }

  const brokenRefs: BrokenRefFinding[] = [];
  for (const r of references) {
    if (!assetByRefPath.has(r.refPath)) {
      brokenRefs.push({ refPath: r.refPath, source: r.source });
    }
  }

  const totalBytes = assets.reduce((acc, a) => acc + a.size, 0);
  return {
    assets,
    references,
    oversize,
    orphans,
    brokenRefs,
    totals: {
      assetCount: assets.length,
      totalBytes,
      oversizeCount: oversize.length,
      orphanCount: orphans.length,
      brokenRefCount: brokenRefs.length,
    },
  };
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

interface CliFlags {
  assetsDir?: string;
  contentDir?: string;
  configPath?: string;
  strict: boolean;
  /** Captures parse errors so main() can short-circuit with exit 1. */
  parseError?: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--strict") flags.strict = true;
    else if (a === "--assets-dir") flags.assetsDir = argv[++i];
    else if (a.startsWith("--assets-dir=")) flags.assetsDir = a.slice("--assets-dir=".length);
    else if (a === "--content-dir") flags.contentDir = argv[++i];
    else if (a.startsWith("--content-dir=")) flags.contentDir = a.slice("--content-dir=".length);
    else if (a === "--config") flags.configPath = argv[++i];
    else if (a.startsWith("--config=")) flags.configPath = a.slice("--config=".length);
    else {
      flags.parseError = `unknown argument: ${a}`;
    }
  }
  return flags;
}

function loadConfig(configPath: string): Config {
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
}

export interface RunOpts {
  assetsDir: string;
  publicDir: string;
  contentDir: string;
  strict?: boolean;
}

export function run(opts: RunOpts): number {
  if (!fs.existsSync(opts.assetsDir)) {
    console.log(`atlas:audit-assets: assets dir "${opts.assetsDir}" does not exist, skipping`);
    return 0;
  }
  if (!fs.existsSync(opts.contentDir)) {
    console.log(`atlas:audit-assets: content dir "${opts.contentDir}" does not exist, skipping`);
    return 0;
  }

  const report = auditAssets({ assetsDir: opts.assetsDir, publicDir: opts.publicDir, contentDir: opts.contentDir });

  const totalsMb = (report.totals.totalBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `atlas:audit-assets: scanned ${report.totals.assetCount} asset(s) (${totalsMb} MB total), ` +
    `${report.references.length} reference(s) in content`,
  );

  // Size findings: errors first, then warnings.
  const sizeErrors = report.oversize.filter((f) => f.severity === "error");
  const sizeWarns = report.oversize.filter((f) => f.severity === "warning");
  for (const f of sizeErrors) {
    console.error(`  OVERSIZE (error)   ${f.refPath} :: ${formatBytes(f.size)} > ${formatBytes(SIZE_ERROR_BYTES)}`);
  }
  for (const f of sizeWarns) {
    console.log(`  OVERSIZE (warn)    ${f.refPath} :: ${formatBytes(f.size)} > ${formatBytes(SIZE_WARN_BYTES)}`);
  }

  // Orphans: warn-only.
  for (const o of report.orphans) {
    console.log(`  ORPHAN             ${o.refPath} :: ${formatBytes(o.size)}`);
  }

  // Broken refs: info line only — build-atlas.ts is the authority and will
  // already fail strict-player builds on missing assets.
  for (const b of report.brokenRefs) {
    console.log(`  BROKEN REF (info)  ${b.refPath} :: referenced by ${b.source} (build-atlas reports this as an error)`);
  }

  console.log(
    `atlas:audit-assets: ${report.totals.assetCount} assets, ${totalsMb} MB total, ` +
    `${report.totals.oversizeCount} oversized, ${report.totals.orphanCount} orphan` +
    (report.totals.brokenRefCount > 0 ? `, ${report.totals.brokenRefCount} broken ref(s)` : ""),
  );

  if (sizeErrors.length > 0) return 13;
  if (opts.strict && (sizeWarns.length > 0 || report.orphans.length > 0 || report.brokenRefs.length > 0)) {
    console.error("atlas:audit-assets: --strict failed because warnings/info findings are present");
    return 13;
  }
  console.log("atlas:audit-assets: clean");
  return 0;
}

function main(): number {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.parseError) {
    console.error(`atlas:audit-assets: ${flags.parseError}`);
    console.error("Usage: tsx scripts/atlas/audit-assets.ts [--assets-dir <path>] [--content-dir <path>] [--config <atlas.config.json>] [--strict]");
    return 1;
  }

  const cwd = process.cwd();
  const configPath = path.resolve(cwd, flags.configPath ?? "atlas.config.json");

  let contentDir: string;
  if (flags.contentDir) {
    contentDir = path.resolve(cwd, flags.contentDir);
  } else {
    if (!fs.existsSync(configPath)) {
      console.error(`atlas:audit-assets: config "${configPath}" does not exist (use --content-dir to override)`);
      return 1;
    }
    let cfg: Config;
    try {
      cfg = loadConfig(configPath);
    } catch (e) {
      console.error(`atlas:audit-assets: failed to parse config "${configPath}": ${(e as Error).message}`);
      return 1;
    }
    contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);
  }

  const assetsDir = flags.assetsDir
    ? path.resolve(cwd, flags.assetsDir)
    : path.resolve(cwd, "public/atlas/assets");
  const publicDir = flags.assetsDir
    ? path.dirname(assetsDir)
    : path.resolve(cwd, "public");

  return run({ assetsDir, publicDir, contentDir, strict: flags.strict });
}

// Run only when invoked as a script (not when imported by tests).
const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("audit-assets.ts") || arg1.endsWith("audit-assets.js");
})();
if (invokedAsScript) {
  process.exit(main());
}
