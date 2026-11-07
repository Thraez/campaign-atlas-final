/**
 * Player-secrets leak scan. Fails publish when a player artifact still carries
 * what the secret pipeline must remove:
 *   - a forbidden field (`reveal`, `password`, `for`) on any entity's secret in
 *     the player atlas.json, which may hold only the locked (ciphertext) form;
 *   - an unstripped `{{secret:id}}` marker in any text file under the dir,
 *     the player JSON included.
 * It does not search for a secret's plaintext itself.
 *
 * The dir is the built site (`dist`, JSON in `dist/atlas/`) or the source store
 * (`public/atlas`); see `atlas/playerArtifact.ts`. The scan registry passes
 * which one; run by hand, the layout is inferred from where atlas.json sits.
 *
 * Exit codes:
 *   0   clean, or no `<dir>` at all
 *   13  leak found, or something that cannot be checked: atlas.json or
 *       search-index.json not valid JSON, a built site (`layout: "built-site"`)
 *       with no `atlas/atlas.json`, a file or dir that cannot be read
 */
import fs from "node:fs";
import path from "node:path";
import { hasSecretMarker } from "../src/atlas/content/dmMarkup";
import { listTextFiles, locatePlayerAtlas, type ArtifactLayout } from "./atlas/playerArtifact";

export interface RunOpts {
  dir: string;
  /** Where atlas.json must be; inferred when absent (a run by hand). */
  layout?: ArtifactLayout;
}

/** Fields that must not appear on a PlayerSecret object in any player artifact. */
const FORBIDDEN_KEYS = ["reveal", "password", "for"];

interface PlayerSecret {
  id?: string;
  lockType?: string;
  reveal?: unknown;
  password?: unknown;
  for?: unknown;
  [k: string]: unknown;
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

function scanAtlasJson(parsed: { entities?: unknown[] }): string[] {
  return ((parsed.entities ?? []) as Record<string, unknown>[]).flatMap(scanEntity);
}

/** Parse a player JSON file and scan it, or a hit naming the file when it is not valid JSON. */
function scanJson<T>(file: string, scan: (parsed: T) => string[]): string[] {
  let parsed: T;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    return [`${file}: not valid JSON, so it cannot be checked (${(err as Error).message})`];
  }
  return scan(parsed);
}

export function run(opts: RunOpts): number {
  const { dir } = opts;
  if (!fs.existsSync(dir)) return 0;

  const allHits: string[] = [];

  const located = locatePlayerAtlas(dir, opts.layout);
  if (located) {
    allHits.push(...scanJson(located.atlasJson, scanAtlasJson));
    const searchIndex = path.join(located.atlasDir, "search-index.json");
    // Parsed for validity only: its markers are found by the text scan below.
    if (fs.existsSync(searchIndex)) allHits.push(...scanJson(searchIndex, () => []));
  } else if (opts.layout === "built-site") {
    allHits.push(`${dir}: no atlas/atlas.json, so the built site cannot be checked`);
  }

  // Every text file, the player JSON included, for unstripped markers. What
  // cannot be read cannot be certified.
  const { files, unreadable } = listTextFiles(dir, "check-player-secrets");
  for (const d of unreadable) allHits.push(`${d}: dir could not be read`);
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (err) {
      allHits.push(`${file}: could not be read (${(err as Error).message})`);
      continue;
    }
    if (hasSecretMarker(text)) allHits.push(`${file}: contains unstripped {{secret:}} marker`);
  }

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
