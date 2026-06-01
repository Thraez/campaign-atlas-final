import * as fs from "node:fs";
import * as path from "node:path";
import { runBuild } from "./build-atlas.js";

const ROOT = process.cwd();
const LOCAL_ATLAS = path.resolve(ROOT, ".local-atlas", "atlas.json");

/**
 * Pure staleness test — null atlasMtimeMs means the atlas file doesn't exist.
 */
export function isAtlasStale(atlasMtimeMs: number | null, newestSourceMtimeMs: number): boolean {
  if (atlasMtimeMs === null) return true;
  return newestSourceMtimeMs > atlasMtimeMs;
}

function readContentRoot(): string {
  try {
    const raw = fs.readFileSync(path.resolve(ROOT, "atlas.config.json"), "utf8");
    const cfg = JSON.parse(raw) as { contentRoot?: string };
    return path.resolve(ROOT, cfg.contentRoot ?? "content");
  } catch {
    return path.resolve(ROOT, "content");
  }
}

function getAtlasMtime(): number | null {
  try {
    return fs.statSync(LOCAL_ATLAS).mtimeMs;
  } catch {
    return null;
  }
}

function getNewestSourceMtime(contentRoot: string): number {
  let newest = 0;

  // Check atlas.config.json itself
  try {
    const m = fs.statSync(path.resolve(ROOT, "atlas.config.json")).mtimeMs;
    if (m > newest) newest = m;
  } catch { /* ok */ }

  // Walk content dir for source files
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(md|yaml|yml|json)$/.test(entry.name)) {
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > newest) newest = m;
        } catch { /* ignore */ }
      }
    }
  }

  walk(contentRoot);
  return newest;
}

async function main(): Promise<void> {
  const contentRoot = readContentRoot();
  const atlasMtime = getAtlasMtime();
  const newestSource = getNewestSourceMtime(contentRoot);

  if (!isAtlasStale(atlasMtime, newestSource)) {
    return; // atlas is fresh, skip build
  }

  console.log("[ensure-dm-atlas] Building DM atlas...");

  try {
    const result = await runBuild({ player: false, strict: false });
    if (result.ok) {
      console.log(`[ensure-dm-atlas] DM atlas built in ${result.durationMs}ms.`);
    } else {
      console.warn(
        `[ensure-dm-atlas] Build finished with errors (${result.error ?? "unknown"}). Starting dev server anyway.`
      );
    }
  } catch (e) {
    console.warn(
      "[ensure-dm-atlas] Build failed. Starting dev server anyway.",
      e instanceof Error ? e.message : String(e)
    );
  }
}

main().catch((e) => {
  console.warn(
    "[ensure-dm-atlas] Unexpected error. Starting dev server anyway.",
    e instanceof Error ? e.message : String(e)
  );
});
