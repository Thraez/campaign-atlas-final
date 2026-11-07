/**
 * Vault-content scan (R-01). While `atlas.config.json` `hosting` is not
 * "private", fails if `content/` holds a file that a Sync from Obsidian wrote:
 * the GitHub repo is public, and real vault content waits until hosting is
 * private (plan ticket H-04).
 *
 * A file counts as synced when Sync's map (`.local-atlas/sync-map.json`,
 * vault path → entity) names it, by either signal:
 *   - its entity id (`readNote`, the build's rule) is an entry's `id`;
 *   - its bytes hash to an entry's `syncedFileHash` (exactly what Sync wrote).
 * Sync stamps no marker of its own into frontmatter, so the map is the only
 * record. It is machine-local and gitignored: on a checkout with no map (CI,
 * a fresh clone) this scan has nothing to compare and passes.
 *
 * Usage: tsx scripts/check-vault-content.ts [--root <repo>] [--config <atlas.config.json>]
 *
 * Exit codes:
 *   0   hosting is private, or no content file came from the vault
 *   19  a synced file in content/ while hosting is public, or a sync map that
 *       isn't valid JSON (fail closed: it can't be checked)
 */
import fs from "node:fs";
import path from "node:path";
import { readHosting } from "./atlas/hosting";
import { readNote } from "../src/atlas/content/readNote";
import { hashContent } from "../src/atlas/save/localFsSave";
import type { SyncMap } from "../src/atlas/import/syncMap";

export interface RunOpts {
  /** The repo root: `.local-atlas/sync-map.json` is read from here. */
  root: string;
  /** Defaults to `<root>/atlas.config.json`. */
  config?: string;
  /** Defaults to the config's `contentRoot` (else `content`) under the config's folder. */
  contentDir?: string;
}

const EXIT = 19;

function contentDirFrom(configPath: string): string {
  let contentRoot = "content";
  try {
    const c = JSON.parse(fs.readFileSync(configPath, "utf8")) as { contentRoot?: unknown };
    if (typeof c.contentRoot === "string") contentRoot = c.contentRoot;
  } catch {
    // No or unreadable config: the default folder.
  }
  return path.resolve(path.dirname(configPath), contentRoot);
}

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(abs);
    }
  };
  walk(dir);
  return out.sort();
}

export async function run(opts: RunOpts): Promise<number> {
  const root = path.resolve(opts.root);
  const configPath = opts.config ? path.resolve(opts.config) : path.join(root, "atlas.config.json");
  if (readHosting(root, configPath) === "private") {
    console.log('check-vault-content: hosting is "private", synced vault content allowed — clean');
    return 0;
  }

  const mapPath = path.join(root, ".local-atlas", "sync-map.json");
  let map: SyncMap = {};
  if (fs.existsSync(mapPath)) {
    try {
      map = JSON.parse(fs.readFileSync(mapPath, "utf8")) as SyncMap;
    } catch (e) {
      console.error(
        `check-vault-content: .local-atlas/sync-map.json is not valid JSON (${(e as Error).message}); can't tell synced files apart — failing`,
      );
      return EXIT;
    }
  }
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of Object.values(map ?? {})) {
    if (typeof entry?.id === "string" && entry.id) ids.add(entry.id);
    if (typeof entry?.syncedFileHash === "string") hashes.add(entry.syncedFileHash);
  }

  const contentDir = opts.contentDir ? path.resolve(opts.contentDir) : contentDirFrom(configPath);
  if (ids.size === 0 && hashes.size === 0) {
    console.log("check-vault-content: no sync map entries — clean");
    return 0;
  }
  if (!fs.existsSync(contentDir)) {
    console.log(`check-vault-content: no content dir at ${contentDir} — clean`);
    return 0;
  }

  const bad: string[] = [];
  for (const abs of markdownFiles(contentDir)) {
    const raw = fs.readFileSync(abs, "utf8");
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const note = readNote(raw, rel);
    if (ids.has(note.id) || hashes.has(await hashContent(raw))) bad.push(rel);
  }
  if (bad.length === 0) {
    console.log("check-vault-content: no content file came from the vault — clean");
    return 0;
  }
  console.error(
    `\ncheck-vault-content: ${bad.length} file(s) in content/ came from Sync from Obsidian while "hosting" is "public"`,
  );
  for (const rel of bad) console.error(`  ✗ ${rel}`);
  console.error(
    "  The repo is public: real vault content waits until hosting is private (see H-04). Remove these files (and their sync-map entries) before publishing.",
  );
  return EXIT;
}

if (
  process.argv[1]?.endsWith("check-vault-content.ts") ||
  process.argv[1]?.endsWith("check-vault-content.js")
) {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  run({ root: flag("--root") ?? process.cwd(), config: flag("--config") })
    .then((code) => process.exit(code))
    .catch((e: unknown) => {
      console.error("check-vault-content: crashed", e);
      process.exit(EXIT);
    });
}
