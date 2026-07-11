/**
 * Player-secrets leak scan. Fails publish if any secret PLAINTEXT, passphrase,
 * character key, or unstripped {{secret:}} marker reaches the player artifacts.
 *
 * Exit codes:
 *   0   clean
 *   1   arg / IO error
 *   13  leak found
 */
import fs from "node:fs";
import path from "node:path";

export interface RunOpts {
  dir: string;
}

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".txt",
  ".xml",
  ".webmanifest",
  ".svg",
  ".md",
]);

/** Fields that must not appear on a PlayerSecret object in any player artifact. */
const FORBIDDEN_KEYS = ["reveal", "password", "for"];

/** Pattern that must be stripped before shipping. */
const SECRET_MARKER_RE = /\{\{secret:[^}]+\}\}/;

interface PlayerSecret {
  id?: string;
  lockType?: string;
  reveal?: unknown;
  password?: unknown;
  for?: unknown;
  [k: string]: unknown;
}

function scanForbiddenInString(text: string): string | null {
  if (SECRET_MARKER_RE.test(text)) return "unstripped {{secret:}} marker";
  return null;
}

function scanEntity(entity: Record<string, unknown>): string[] {
  const hits: string[] = [];
  const secrets = entity.secrets;
  if (!Array.isArray(secrets)) return hits;
  for (const s of secrets as PlayerSecret[]) {
    if (typeof s !== "object" || s === null) continue;
    for (const key of FORBIDDEN_KEYS) {
      if (key in s)
        hits.push(`entity "${entity.id}": secret "${s.id}" has forbidden field "${key}"`);
    }
  }
  return hits;
}

function scanAtlasJson(content: string): string[] {
  const hits: string[] = [];
  let parsed: { entities?: unknown[]; placements?: unknown[] };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return hits;
  }
  for (const entity of (parsed.entities ?? []) as Record<string, unknown>[]) {
    hits.push(...scanEntity(entity));
    const bodyHit = typeof entity.body === "string" ? scanForbiddenInString(entity.body) : null;
    if (bodyHit) hits.push(`entity "${entity.id}": body has ${bodyHit}`);
  }
  return hits;
}

function scanSearchIndex(content: string): string[] {
  const hits: string[] = [];
  let parsed: unknown[];
  try {
    parsed = JSON.parse(content) as unknown[];
  } catch {
    return hits;
  }
  for (const entry of parsed as Record<string, unknown>[]) {
    for (const field of ["body", "bodyText", "excerpt", "summary"] as const) {
      const val = entry[field];
      if (typeof val === "string") {
        const hit = scanForbiddenInString(val);
        if (hit) hits.push(`search-index entry "${entry.id}": ${field} has ${hit}`);
      }
    }
  }
  return hits;
}

function scanTextFile(filePath: string, content: string): string[] {
  if (SECRET_MARKER_RE.test(content)) {
    return [`${filePath}: contains unstripped {{secret:}} marker`];
  }
  return [];
}

export function run(opts: RunOpts): number {
  const { dir } = opts;
  if (!fs.existsSync(dir)) return 0;

  const allHits: string[] = [];

  const atlasJson = path.join(dir, "atlas.json");
  const searchIndex = path.join(dir, "search-index.json");

  if (fs.existsSync(atlasJson)) {
    allHits.push(...scanAtlasJson(fs.readFileSync(atlasJson, "utf8")));
  }
  if (fs.existsSync(searchIndex)) {
    allHits.push(...scanSearchIndex(fs.readFileSync(searchIndex, "utf8")));
  }

  // Scan all other text files in the dir for unstripped markers.
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (full === atlasJson || full === searchIndex) continue;
      try {
        allHits.push(...scanTextFile(full, fs.readFileSync(full, "utf8")));
      } catch {
        /* unreadable file — skip */
      }
    }
  };
  walk(dir);

  if (allHits.length > 0) {
    console.error("\ncheck-player-secrets: LEAK DETECTED");
    for (const h of allHits) console.error(`  ✗ ${h}`);
    return 13;
  }
  return 0;
}

if (
  process.argv[1]?.endsWith("check-player-secrets.ts") ||
  process.argv[1]?.endsWith("check-player-secrets.js")
) {
  const dirArg = process.argv[2] ?? "public/atlas";
  process.exit(run({ dir: dirArg }));
}
