#!/usr/bin/env tsx
/**
 * Derived-secret leak scanner.
 *
 * Complements check-no-secrets.ts. Sentinels catch test fixtures, but a real
 * DM secret named "The Drowned Temple of Nepheth" would not be in the static
 * sentinel list — so a regression that accidentally included a hidden
 * entity's title or alias in the search index would still ship.
 *
 * This script derives a list of "must-not-appear" strings from the source
 * vault itself:
 *
 *   - any entity with atlas.visibility: dm | hidden
 *   - any entity with atlas.publish: false
 *
 * For each such entity, the title, the slug-form id (filename), and every
 * alias is added to the secret list. The target directory is then scanned
 * for verbatim occurrences. Names that are too short or too generic to
 * meaningfully flag (single common words) are excluded to keep false
 * positives manageable — a DM who names a secret "Door" or "The North"
 * is on their own.
 *
 * Usage:
 *   tsx scripts/check-derived-secrets.ts <artifact-dir>
 *
 * Exit codes:
 *   0   clean
 *   1   bad invocation
 *   12  derived secret leak detected
 */
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./atlas/parseFrontmatter";
import { slugify } from "./atlas/slugify";

interface Config {
  contentRoot: string;
  outputDir: string;
  defaultWorld: string;
  include: string[];
  exclude: string[];
}

const TEXT_EXTENSIONS = new Set([
  ".html", ".js", ".mjs", ".cjs", ".css", ".json",
  ".txt", ".xml", ".webmanifest", ".svg", ".md",
]);

/** Names below this length are skipped to avoid noisy generic matches. */
const MIN_NAME_LENGTH = 4;

/** Common English words / very generic short strings that are not useful as
 *  secret names — if a DM uses one, the static sentinel test still applies. */
const GENERIC_NAMES = new Set([
  "the", "and", "for", "from", "into", "with", "this", "that",
  "north", "south", "east", "west", "city", "town", "lake", "river",
  "wood", "hill", "mountain", "road", "path", "door", "gate", "tower",
  "keep", "ruin", "ruins", "temple", "shrine", "cave", "caves",
  "draft", "dm", "hidden", "secret", "note", "notes",
]);

export interface SecretEntry {
  /** The literal string that must not appear. */
  name: string;
  /** Source file that produced this entry. Used for the offender report. */
  source: string;
  /** Field that produced this entry (title/alias/id). */
  field: "title" | "alias" | "id";
}

export interface DerivedScanHit {
  file: string;
  match: SecretEntry;
}

export interface DerivedScanResult {
  /** Number of secret-name candidates derived from the vault. */
  derivedCount: number;
  /** Number of files scanned in the target directory. */
  filesScanned: number;
  hits: DerivedScanHit[];
}

/** Default content config locations to try if no --config is given. */
const CONFIG_CANDIDATES = ["atlas.config.json"];

function loadConfig(configPath: string): Config {
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
}

function matchAny(target: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(target));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "::DSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DSTAR::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function walkMd(
  dir: string,
  contentRoot: string,
  include: string[],
  exclude: string[],
): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const contentRel = path.relative(contentRoot, full).replace(/\\/g, "/");
    if (matchAny(contentRel, exclude)) continue;
    if (entry.isDirectory()) {
      out.push(...walkMd(full, contentRoot, include, exclude));
    } else if (entry.name.endsWith(".md")) {
      if (include.length > 0 && !matchAny(contentRel, include)) continue;
      out.push(full);
    }
  }
  return out;
}

/** Should the candidate name be included in the must-not-appear list? */
function isReportableName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) return false;
  if (GENERIC_NAMES.has(trimmed.toLowerCase())) return false;
  return true;
}

export function deriveSecretsFromVault(configPath: string): SecretEntry[] {
  const cfg = loadConfig(configPath);
  const contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);
  const files = walkMd(contentDir, contentDir, cfg.include ?? [], cfg.exclude ?? []);
  const secrets: SecretEntry[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const rel = path.relative(path.dirname(configPath), file).replace(/\\/g, "/");
    const parsed = parseFrontmatter(raw, rel);
    const isHiddenVisibility =
      parsed.atlas.visibility === "dm" || parsed.atlas.visibility === "hidden";
    const isUnpublished = parsed.atlas.publish === false;
    if (!isHiddenVisibility && !isUnpublished) continue;

    const title = typeof parsed.data.title === "string"
      ? parsed.data.title.trim()
      : path.basename(file, ".md").replace(/[-_]+/g, " ").trim();
    if (isReportableName(title)) {
      secrets.push({ name: title, source: rel, field: "title" });
    }
    const id = parsed.atlas.id ?? slugify(title);
    if (isReportableName(id)) {
      secrets.push({ name: id, source: rel, field: "id" });
    }
    for (const alias of parsed.atlas.aliases ?? []) {
      if (isReportableName(alias)) {
        secrets.push({ name: alias, source: rel, field: "alias" });
      }
    }
  }
  // De-duplicate by exact name; keep the first source for the report.
  const seen = new Set<string>();
  return secrets.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

export function scanArtifactForSecrets(dir: string, secrets: SecretEntry[]): DerivedScanResult {
  const hits: DerivedScanHit[] = [];
  let filesScanned = 0;
  // Build a single case-sensitive Map for cheap includes() — secrets are
  // user-defined, so substring-containment matches the worst-case leak shape
  // (e.g. the title appearing inside a longer rendered string).
  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        filesScanned += 1;
        let text: string;
        try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
        for (const s of secrets) {
          if (text.includes(s.name)) hits.push({ file: full, match: s });
        }
      }
    }
  }
  walk(dir);
  return { derivedCount: secrets.length, filesScanned, hits };
}

function resolveConfig(configHint?: string): string | null {
  if (configHint) return path.resolve(process.cwd(), configHint);
  for (const c of CONFIG_CANDIDATES) {
    const abs = path.resolve(process.cwd(), c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function parseArgs(): { target: string; config: string } | null {
  const args = process.argv.slice(2);
  let target: string | undefined;
  let configHint: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config") configHint = args[++i];
    else if (a.startsWith("--config=")) configHint = a.slice(9);
    else if (!target) target = a;
  }
  if (!target) return null;
  const config = resolveConfig(configHint);
  if (!config) return null;
  return { target, config };
}

export interface RunOpts { dir: string; config?: string }

export function run(opts: RunOpts): number {
  const configAbs = resolveConfig(opts.config);
  if (!configAbs) {
    console.error("atlas:check-derived-secrets: config not found (place atlas.config.json in cwd or pass --config)");
    return 1;
  }
  const targetAbs = path.resolve(process.cwd(), opts.dir);
  if (!fs.existsSync(targetAbs)) {
    console.log(`atlas:check-derived-secrets: target "${opts.dir}" does not exist, skipping`);
    return 0;
  }
  if (!fs.existsSync(configAbs)) {
    console.error(`atlas:check-derived-secrets: config "${configAbs}" does not exist`);
    return 1;
  }
  const secrets = deriveSecretsFromVault(configAbs);
  if (secrets.length === 0) {
    console.log("atlas:check-derived-secrets: vault has no hidden/dm entities — nothing to check");
    return 0;
  }
  const result = scanArtifactForSecrets(targetAbs, secrets);
  console.log(
    `atlas:check-derived-secrets: derived ${result.derivedCount} secret name(s); ` +
    `scanned ${result.filesScanned} file(s) in ${opts.dir}`,
  );
  if (result.hits.length === 0) {
    console.log("atlas:check-derived-secrets: clean");
    return 0;
  }
  for (const h of result.hits) {
    const rel = path.relative(process.cwd(), h.file);
    console.error(
      `  DERIVED LEAK ${rel}  :: "${h.match.name}" ` +
      `(${h.match.field} of ${h.match.source})`,
    );
  }
  return 12;
}

function main(): number {
  const args = parseArgs();
  if (!args) {
    console.error("Usage: tsx scripts/check-derived-secrets.ts <artifact-dir> [--config atlas.config.json]");
    return 1;
  }
  return run({ dir: args.target, config: args.config });
}

const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("check-derived-secrets.ts") || arg1.endsWith("check-derived-secrets.js");
})();
if (invokedAsScript) {
  process.exit(main());
}
