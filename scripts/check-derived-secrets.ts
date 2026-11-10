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
 *   - any note the build reads and treats as secret (`readNote`'s `isSecret`:
 *     dm or hidden, no visibility at all (ADR-0001), or atlas.publish: false)
 *   - every note the build never reads (an excluded folder such as `_dm/` or
 *     `_drafts/`, or missed by `include`), whatever its tag, as the build's
 *     cross-reference check treats them: player notes can still name them
 *
 * Both lists come from the build's own scan (`scanContentFolder`). For each
 * such note, the title and id (exactly as the build works them out, via
 * `readNote`), the title with dashes read as spaces, and every alias are
 * added to the secret list. The target directory is then scanned for whole-word occurrences in
 * any letter case. Names that are too short or too generic to
 * meaningfully flag (single common words) are excluded to keep false
 * positives manageable — a DM who names a secret "Door" or "The North"
 * is on their own.
 *
 * A v2 campaign store (R-17) also has a must-not-ship file beside it, the
 * resolver's list of what that campaign hides: `--must-not-ship <file>` adds
 * its ids and names (same whole-word rule) and its image paths. A path is a
 * hit when it appears in a file's text, lower-cased with `\\` read as `/`,
 * whole (not inside a longer file name) and after start, a quote, a space or
 * a `/`; both sides compare through the resolver's `normalizePath`.
 *
 * Usage:
 *   tsx scripts/check-derived-secrets.ts <artifact-dir> [--must-not-ship <file>]
 *
 * Exit codes:
 *   0   clean
 *   1   bad invocation
 *   12  derived secret leak detected
 */
import fs from "node:fs";
import path from "node:path";
import { listTextFiles } from "./atlas/playerArtifact";
import { readContentFiles } from "./atlas/readContentFiles";
import { scanContentFolder } from "../src/atlas/content/scanContentFolder";
import { normalizePath } from "../src/atlas/content/resolveCampaign";
import { readMustNotShip } from "./atlas/build/campaignStore";

interface Config {
  contentRoot: string;
  outputDir: string;
  defaultWorld: string;
  include: string[];
  exclude: string[];
}

/** Names below this length are skipped to avoid noisy generic matches. */
const MIN_NAME_LENGTH = 4;

/** Common English words / very generic short strings that are not useful as
 *  secret names — if a DM uses one, the static sentinel test still applies. */
const GENERIC_NAMES = new Set([
  "the",
  "and",
  "for",
  "from",
  "into",
  "with",
  "this",
  "that",
  "north",
  "south",
  "east",
  "west",
  "city",
  "town",
  "lake",
  "river",
  "wood",
  "hill",
  "mountain",
  "road",
  "path",
  "door",
  "gate",
  "tower",
  "keep",
  "ruin",
  "ruins",
  "temple",
  "shrine",
  "cave",
  "caves",
  "draft",
  "dm",
  // eslint-disable-next-line no-restricted-syntax -- English words too common to flag, not a visibility list
  "hidden",
  "secret",
  "note",
  "notes",
]);

export interface SecretEntry {
  /** The literal string that must not appear. */
  name: string;
  /** Source file that produced this entry. Used for the offender report. */
  source: string;
  /** Field that produced this entry (title/alias/id; path from a must-not-ship file). */
  field: "title" | "alias" | "id" | "path";
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
  // The build's own content-folder scan: every note it reads that is secret,
  // plus every note it never reads (folder-excluded), whatever its tag.
  const scan = scanContentFolder(readContentFiles(contentDir, path.dirname(configPath)), {
    include: cfg.include ?? [],
    exclude: cfg.exclude ?? [],
  });
  const secretNotes = [...scan.notes.filter((n) => n.isSecret), ...scan.excluded];
  const secrets: SecretEntry[] = [];
  for (const note of secretNotes) {
    const rel = note.relPath;
    const { title, id } = note;
    if (isReportableName(title)) {
      secrets.push({ name: title, source: rel, field: "title" });
    }
    // Also a frontmatter title with dashes and underscores read as spaces,
    // as prose often writes such a name ("Khal-Azum Rift" / "Khal Azum Rift").
    const spaced = title.replace(/[-_]+/g, " ").trim();
    if (spaced !== title && isReportableName(spaced)) {
      secrets.push({ name: spaced, source: rel, field: "title" });
    }
    if (isReportableName(id)) {
      secrets.push({ name: id, source: rel, field: "id" });
    }
    for (const alias of note.aliases) {
      if (isReportableName(alias)) {
        secrets.push({ name: alias, source: rel, field: "alias" });
      }
    }
  }
  // De-duplicate ignoring case (the scan does); keep the first source for the report.
  const seen = new Set<string>();
  return secrets.filter((s) => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * What a campaign's must-not-ship file adds (R-17): its ids and names, as the
 * vault's secret names are filtered, and every image path. Throws when the
 * file is missing or malformed.
 */
export function secretsFromMustNotShip(file: string): SecretEntry[] {
  const m = readMustNotShip(file);
  const source = path.basename(file);
  const out: SecretEntry[] = [
    ...m.ids.filter(isReportableName).map((name) => ({ name, source, field: "id" as const })),
    ...m.names.filter(isReportableName).map((name) => ({ name, source, field: "title" as const })),
    ...m.paths
      .map(normalizePath)
      .filter((p) => p.length > 0)
      .map((name) => ({ name, source, field: "path" as const })),
  ];
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = `${s.field === "path" ? "p" : "n"}:${s.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scanArtifactForSecrets(dir: string, secrets: SecretEntry[]): DerivedScanResult {
  const hits: DerivedScanHit[] = [];
  // Any letter case, but whole words only: "isle de marque" is a hit for
  // "Isle De Marque", while a name inside a longer word ("Mira" in
  // "miracle") is not. Paths match on the text read as a path (pathPattern).
  const patterns = secrets.map((s) => ({
    s,
    re: s.field === "path" ? pathPattern(s.name) : wholeWordPattern(s.name),
  }));
  const files = listTextFiles(dir, "check-derived-secrets").files;
  for (const full of files) {
    let text: string;
    try {
      text = fs.readFileSync(full, "utf8");
    } catch (err) {
      // utf8 reads substitute U+FFFD for undecodable bytes rather than
      // throwing, so this only fires on genuine OS-level I/O errors. Log the
      // skip instead of swallowing it; the exit code is unaffected.
      console.warn(
        `check-derived-secrets: skipped unreadable file ${full}: ${(err as Error).message}`,
      );
      continue;
    }
    // The text read as paths, as normalizePath reads one: `\` (JSON-escaped
    // or not) as `/`, `//` collapsed, lower case.
    const asPath = text
      .replace(/\\\\/g, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .toLowerCase();
    for (const { s, re } of patterns) {
      if (re.test(s.field === "path" ? asPath : text)) hits.push({ file: full, match: s });
    }
  }
  return { derivedCount: secrets.length, filesScanned: files.length, hits };
}

function wholeWordPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

/** A normalised path, whole, after start, a quote, a space or a `/` (so a longer path ending in it is a hit). */
function pathPattern(normalized: string): RegExp {
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![^\\s"'/])${escaped}(?![\\p{L}\\p{N}._-])`, "u");
}

function resolveConfig(configHint?: string): string | null {
  if (configHint) return path.resolve(process.cwd(), configHint);
  for (const c of CONFIG_CANDIDATES) {
    const abs = path.resolve(process.cwd(), c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function parseArgs(): { target: string; config: string; mustNotShip?: string } | null {
  const args = process.argv.slice(2);
  let target: string | undefined;
  let configHint: string | undefined;
  let mustNotShip: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--config") configHint = args[++i];
    else if (a.startsWith("--config=")) configHint = a.slice(9);
    else if (a === "--must-not-ship") mustNotShip = args[++i];
    else if (a.startsWith("--must-not-ship=")) mustNotShip = a.slice(16);
    else if (!target) target = a;
  }
  if (!target) return null;
  const config = resolveConfig(configHint);
  if (!config) return null;
  return { target, config, ...(mustNotShip ? { mustNotShip } : {}) };
}

export interface RunOpts {
  dir: string;
  config?: string;
  /** A v2 campaign store's must-not-ship file (R-17): its ids, names and paths are scanned for too. */
  mustNotShip?: string;
}

export function run(opts: RunOpts): number {
  const configAbs = resolveConfig(opts.config);
  if (!configAbs) {
    console.error(
      "atlas:check-derived-secrets: config not found (place atlas.config.json in cwd or pass --config)",
    );
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
  if (opts.mustNotShip) {
    // Fail closed: a store whose must-not-ship file can't be read isn't checked.
    try {
      secrets.push(...secretsFromMustNotShip(path.resolve(process.cwd(), opts.mustNotShip)));
    } catch (err) {
      console.error(`atlas:check-derived-secrets: ${(err as Error).message}`);
      return 1;
    }
  }
  if (secrets.length === 0) {
    console.log("atlas:check-derived-secrets: vault has no dm/hidden notes — nothing to check");
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
      `  DERIVED LEAK ${rel}  :: "${h.match.name}" ` + `(${h.match.field} of ${h.match.source})`,
    );
  }
  return 12;
}

function main(): number {
  const args = parseArgs();
  if (!args) {
    console.error(
      "Usage: tsx scripts/check-derived-secrets.ts <artifact-dir> [--config atlas.config.json] [--must-not-ship <file>]",
    );
    return 1;
  }
  return run(
    args.mustNotShip
      ? { dir: args.target, config: args.config, mustNotShip: args.mustNotShip }
      : { dir: args.target, config: args.config },
  );
}

const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("check-derived-secrets.ts") || arg1.endsWith("check-derived-secrets.js");
})();
if (invokedAsScript) {
  process.exit(main());
}
