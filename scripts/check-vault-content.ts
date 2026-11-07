/**
 * Vault-content scan (R-01). While `atlas.config.json` `hosting` is not
 * "private", fails if `content/` holds a file that came from the DM's vault:
 * the GitHub repo is public, and real vault content waits until hosting is
 * private (plan ticket H-04).
 *
 * A `.md` file counts as vault content on any of these signals
 * (`scripts/atlas/vaultContent.ts`, shared with the save endpoint):
 *   - it carries Sync's frontmatter marker `atlas.source: vault`
 *     (`src/atlas/import/vaultSourceMarker.ts`); this one travels with the
 *     file, so it works from any checkout (a fresh clone, the PC, CI);
 *   - its entity id (`readNote`, the build's rule) is an `id` in Sync's map
 *     (`.local-atlas/sync-map.json`, machine-local and gitignored), or its
 *     bytes hash to a map entry's `syncedFileHash` (exactly what Sync wrote);
 *   - its text matches a note in the vault this machine's editor knows
 *     (`.local-atlas/editor-settings.json` `vaultPath`): the same whole text or
 *     the same body, line endings normalized. Hash only, never titles. Without
 *     a readable vault path this signal is skipped, and the output says so.
 * A symlink anywhere under `content/` fails too: it can point into the vault.
 *
 * Maps, images and `world.yaml` aren't checked (see IMPORT_EXPORT.md,
 * "Hosting guard").
 *
 * Usage: tsx scripts/check-vault-content.ts [--root <repo>] [--config <atlas.config.json>]
 *
 * Exit codes:
 *   0   hosting is private, or nothing in content/ came from the vault
 *   19  vault content or a symlink in content/ while hosting is public, or a
 *       sync map that isn't valid JSON (fail closed: it can't be checked)
 */
import fs from "node:fs";
import path from "node:path";
import { readHosting } from "./atlas/hosting";
import {
  isVaultNote,
  noteFingerprints,
  readSyncMapSignals,
  readVaultFingerprints,
  SyncMapUnreadableError,
  type SyncMapSignals,
} from "./atlas/vaultContent";
import { hashContent } from "../src/atlas/save/localFsSave";

export interface RunOpts {
  /** The repo root: `.local-atlas/` is read from here. */
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

/** `.md` files and symlinks under `dir` (symlinks aren't followed). */
function walkContent(dir: string): { markdown: string[]; symlinks: string[] } {
  const markdown: string[] = [];
  const symlinks: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isSymbolicLink()) symlinks.push(abs);
      else if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) markdown.push(abs);
    }
  };
  if (fs.lstatSync(dir).isSymbolicLink()) symlinks.push(dir);
  else walk(dir);
  return { markdown: markdown.sort(), symlinks: symlinks.sort() };
}

export async function run(opts: RunOpts): Promise<number> {
  const root = path.resolve(opts.root);
  const configPath = opts.config ? path.resolve(opts.config) : path.join(root, "atlas.config.json");
  if (readHosting(root, configPath) === "private") {
    console.log('check-vault-content: hosting is "private", synced vault content allowed — clean');
    return 0;
  }

  let signals: SyncMapSignals;
  try {
    signals = readSyncMapSignals(root);
  } catch (e) {
    if (!(e instanceof SyncMapUnreadableError)) throw e;
    console.error(`check-vault-content: ${e.message}; can't tell synced files apart — failing`);
    return EXIT;
  }

  const contentDir = opts.contentDir ? path.resolve(opts.contentDir) : contentDirFrom(configPath);
  if (!fs.existsSync(contentDir) && !isDanglingLink(contentDir)) {
    console.log(`check-vault-content: no content dir at ${contentDir} — clean`);
    return 0;
  }

  const vault = readVaultFingerprints(root);
  if (vault.ok) {
    console.log(
      `check-vault-content: comparing against ${vault.notes} note(s) in the vault at ${vault.vaultRoot}`,
    );
  } else {
    console.log(`check-vault-content: vault comparison skipped (${vault.reason})`);
  }

  const { markdown, symlinks } = walkContent(contentDir);
  const rel = (abs: string) => path.relative(root, abs).split(path.sep).join("/");
  const bad: string[] = [];
  for (const abs of markdown) {
    const raw = fs.readFileSync(abs, "utf8");
    const r = rel(abs);
    const matchesVault = vault.ok && noteFingerprints(raw, r).some((p) => vault.prints.has(p));
    if (
      isVaultNote(raw, r, signals) ||
      signals.hashes.has(await hashContent(raw)) ||
      matchesVault
    ) {
      bad.push(r);
    }
  }
  if (bad.length === 0 && symlinks.length === 0) {
    console.log("check-vault-content: nothing in content/ came from the vault — clean");
    return 0;
  }
  if (bad.length > 0) {
    console.error(
      `\ncheck-vault-content: ${bad.length} file(s) in content/ came from the vault while "hosting" is "public"`,
    );
    for (const r of bad) console.error(`  ✗ ${r}`);
    console.error(
      "  The repo is public: real vault content waits until hosting is private (see H-04). Remove these files (and any sync-map entries) before publishing. A stale .local-atlas/sync-map.json naming sample notes: delete it.",
    );
  }
  if (symlinks.length > 0) {
    console.error(
      `\ncheck-vault-content: ${symlinks.length} symlink(s) in content/ while "hosting" is "public"`,
    );
    for (const abs of symlinks) console.error(`  ✗ ${rel(abs)}`);
    console.error(
      "  A symlink can point into the vault. Replace it with the file itself, or remove it.",
    );
  }
  return EXIT;
}

function isDanglingLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
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
