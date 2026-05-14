/**
 * Detect DM-only content sitting in the source tree.
 *
 * The player build strips DM content from the published artifact, but if
 * the source repository itself is public, players can still read the raw
 * markdown via GitHub. This scanner runs at build time and reports:
 *
 *   - any `_dm/` folder under the content root that contains real files
 *   - any markdown file whose `atlas.visibility` is `dm` or `hidden`
 *
 * It does NOT call any network APIs. We deliberately do not try to detect
 * whether the repository is public — that is fragile and can lull authors
 * into a false sense of safety. Instead we force a human acknowledgement
 * via the `ATLAS_ACK_DM_IN_SOURCE=true` environment variable.
 */
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./parseFrontmatter";

export interface DmSourceScan {
  /** Directories named `_dm` that contain at least one non-`.gitkeep` file. */
  dmFolders: string[];
  /** Markdown files marked `visibility: dm`. */
  dmFiles: string[];
  /** Markdown files marked `visibility: hidden`. */
  hiddenFiles: string[];
}

/** True if the scan turned up any DM-sensitive material. */
export function hasDmInSource(scan: DmSourceScan): boolean {
  return scan.dmFolders.length + scan.dmFiles.length + scan.hiddenFiles.length > 0;
}

/** Recursively walk a directory, collecting absolute paths to every file. */
function walk(dir: string, out: { files: string[]; dirs: string[] }): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.dirs.push(full);
      walk(full, out);
    } else {
      out.files.push(full);
    }
  }
}

/** Scan a content root for DM-only material. Pure file IO, no network. */
export function scanDmContent(contentRoot: string): DmSourceScan {
  const result: DmSourceScan = { dmFolders: [], dmFiles: [], hiddenFiles: [] };
  if (!fs.existsSync(contentRoot)) return result;
  const acc = { files: [] as string[], dirs: [] as string[] };
  walk(contentRoot, acc);

  // _dm folders that contain real content (not just a .gitkeep placeholder).
  for (const d of acc.dirs) {
    if (path.basename(d) !== "_dm") continue;
    const inside = fs.readdirSync(d).filter((n) => n !== ".gitkeep");
    if (inside.length > 0) result.dmFolders.push(d);
  }

  // Markdown files with visibility: dm | hidden in their atlas frontmatter.
  for (const f of acc.files) {
    if (!f.endsWith(".md")) continue;
    let raw: string;
    try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
    let parsed: ReturnType<typeof parseFrontmatter>;
    try { parsed = parseFrontmatter(raw, f); } catch { continue; }
    const v = parsed.atlas.visibility;
    if (v === "dm") result.dmFiles.push(f);
    else if (v === "hidden") result.hiddenFiles.push(f);
  }
  return result;
}

/** Format a capped list of paths for the warning block. */
function capList(paths: string[], cap: number, root: string): string[] {
  const rel = paths.map((p) => path.relative(root, p).replace(/\\/g, "/"));
  if (rel.length <= cap) return rel;
  return [...rel.slice(0, cap), `… and ${rel.length - cap} more`];
}

export interface PrintOptions {
  /** If true, the warning is fatal unless ATLAS_ACK_DM_IN_SOURCE=true. */
  enforceAck: boolean;
  /** Repo root, used to render relative paths. */
  repoRoot: string;
  /** Override for the env var (mostly for tests). */
  ack?: boolean;
}

/**
 * Print the SOURCE-REPO WARNING block to stderr if DM content is present.
 * Returns `true` when the build should proceed, `false` when the caller
 * must abort (player build, no acknowledgement). Always pure: prints +
 * returns a verdict, never exits the process itself.
 */
export function reportDmInSource(scan: DmSourceScan, opts: PrintOptions): boolean {
  if (!hasDmInSource(scan)) return true;
  const ack =
    opts.ack ?? process.env.ATLAS_ACK_DM_IN_SOURCE === "true";
  const cap = 10;
  const lines: string[] = [];
  lines.push("");
  lines.push("============================================================");
  lines.push("⚠  SOURCE-REPO WARNING — DM content detected in source tree");
  lines.push("============================================================");
  if (scan.dmFolders.length > 0) {
    lines.push(`  ${scan.dmFolders.length} _dm folder(s) with content:`);
    for (const p of capList(scan.dmFolders, cap, opts.repoRoot)) lines.push(`    • ${p}`);
  }
  if (scan.dmFiles.length > 0) {
    lines.push(`  ${scan.dmFiles.length} file(s) with visibility: dm:`);
    for (const p of capList(scan.dmFiles, cap, opts.repoRoot)) lines.push(`    • ${p}`);
  }
  if (scan.hiddenFiles.length > 0) {
    lines.push(`  ${scan.hiddenFiles.length} file(s) with visibility: hidden:`);
    for (const p of capList(scan.hiddenFiles, cap, opts.repoRoot)) lines.push(`    • ${p}`);
  }
  lines.push("");
  lines.push("  The player BUILD ARTIFACT strips this content, but if your");
  lines.push("  source repository is PUBLIC, players can still read the raw");
  lines.push("  markdown on GitHub. The published atlas is only as private");
  lines.push("  as the repository that contains the source notes.");
  lines.push("");
  lines.push("  Recommended setups:");
  lines.push("    1. Keep the source repo PRIVATE; deploy the stripped artifact only.");
  lines.push("    2. Split into a private DM repo + public player-artifact repo.");
  lines.push("");
  lines.push("  To acknowledge this risk and continue, set:");
  lines.push("      ATLAS_ACK_DM_IN_SOURCE=true");
  lines.push("============================================================");
  lines.push("");
  const out = lines.join("\n");
  if (opts.enforceAck && !ack) {
    console.error(out);
    console.error(
      "Refusing to run the player build without acknowledgement. " +
      "Re-run with ATLAS_ACK_DM_IN_SOURCE=true once you have confirmed your " +
      "source repository's visibility is appropriate.\n"
    );
    return false;
  }
  console.warn(out);
  return true;
}