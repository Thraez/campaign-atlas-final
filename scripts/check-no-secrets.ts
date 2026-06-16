/**
 * Sentinel-string scanner for built artifacts.
 *
 * Walks a directory tree (default: dist/) and scans every text file for two
 * classes of leak:
 *
 *   1. DM_CONTENT_SENTINELS — strings planted in DM-only fixture content. If
 *      these appear in a player build, the DM-strip pipeline is broken.
 *   2. EDITOR_CODE_FINGERPRINTS — substrings that prove the editor route or
 *      GitHub-save code leaked into a player bundle (tree-shake regression).
 *
 * Exit codes:
 *   0   clean
 *   1   bad invocation
 *   8   DM content leak
 *   9   editor code leak
 *   10  both
 *
 * Used by `npm run atlas:check-secrets <dir>` and by sentinel-scan.test.ts.
 */
import fs from "node:fs";
import path from "node:path";

export const DM_CONTENT_SENTINELS = [
  "SENTINEL_DM_BODY_001",
  "SENTINEL_DM_BODY_002",
  "SENTINEL_DM_SUMMARY_001",
  "SENTINEL_DM_BLOCK_001",
] as const;

export const EDITOR_CODE_FINGERPRINTS = [
  "/__atlas/save",
  "saveAtlasPatchToLocalFs",
  "AtlasPlacementEditor",
  "/atlas/edit",
] as const;

const TEXT_EXTENSIONS = new Set([
  ".html", ".js", ".mjs", ".cjs", ".css", ".json",
  ".txt", ".xml", ".webmanifest", ".svg", ".md",
]);

export interface ScanHit {
  file: string;
  pattern: string;
  kind: "dm" | "editor";
}

export interface ScanResult {
  files: number;
  dmHits: ScanHit[];
  editorHits: ScanHit[];
}

export function scanFile(file: string): ScanHit[] {
  const hits: ScanHit[] = [];
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return hits;
  }
  for (const s of DM_CONTENT_SENTINELS) {
    if (text.includes(s)) hits.push({ file, pattern: s, kind: "dm" });
  }
  for (const s of EDITOR_CODE_FINGERPRINTS) {
    if (text.includes(s)) hits.push({ file, pattern: s, kind: "editor" });
  }
  return hits;
}

export function scanDir(dir: string): ScanResult {
  const result: ScanResult = { files: 0, dmHits: [], editorHits: [] };
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
        result.files += 1;
        for (const h of scanFile(full)) {
          if (h.kind === "dm") result.dmHits.push(h);
          else result.editorHits.push(h);
        }
      }
    }
  }
  walk(dir);
  return result;
}

export interface RunOpts { dir: string }

export function run(opts: RunOpts): number {
  const abs = path.resolve(process.cwd(), opts.dir);
  if (!fs.existsSync(abs)) {
    console.log(`atlas:check-secrets: target "${opts.dir}" does not exist, skipping`);
    return 0;
  }
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) {
    console.error(`atlas:check-secrets: target "${opts.dir}" is not a directory`);
    return 1;
  }
  const res = scanDir(abs);
  console.log(`atlas:check-secrets: scanned ${res.files} text file(s) in ${opts.dir}`);
  for (const h of res.dmHits) {
    console.error(`  DM LEAK    ${path.relative(process.cwd(), h.file)}  :: ${h.pattern}`);
  }
  for (const h of res.editorHits) {
    console.error(`  EDITOR LEAK ${path.relative(process.cwd(), h.file)}  :: ${h.pattern}`);
  }
  const dm = res.dmHits.length > 0;
  const ed = res.editorHits.length > 0;
  if (dm && ed) return 10;
  if (dm) return 8;
  if (ed) return 9;
  console.log("atlas:check-secrets: clean");
  return 0;
}

function main(): number {
  return run({ dir: process.argv[2] ?? "dist" });
}

// Run only when invoked as a script (not when imported by tests).
const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("check-no-secrets.ts") || arg1.endsWith("check-no-secrets.js");
})();
if (invokedAsScript) {
  process.exit(main());
}