#!/usr/bin/env tsx
/**
 * Parallel scan orchestrator for atlas:publish and CI (`npm run atlas:scan`).
 *
 * Runs every scan in `scanRegistry.ts` in one process (one tsx cold start
 * instead of one per scan), over every campaign's dirs (R-15). The editor's
 * Publish check reads the same list.
 *
 * Exit codes:
 *   0   all scans clean
 *   1   one or more scans failed (details printed by individual scanners)
 */
import fs from "node:fs";
import path from "node:path";
import { runAll, scanTasks } from "./scanRegistry.js";

interface Config {
  contentRoot: string;
}

async function main(): Promise<number> {
  const root = process.cwd();
  const configPath = path.resolve(root, "atlas.config.json");
  if (!fs.existsSync(configPath)) {
    console.error(`publish-orchestrator: atlas.config.json not found at ${configPath}`);
    return 1;
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
  const contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);
  let tasks: ReturnType<typeof scanTasks>;
  try {
    // The registry loads the campaign list from the content; it throws rather
    // than scan zero campaign dirs.
    tasks = scanTasks({ root, configPath, contentDir });
  } catch (e) {
    console.error(`publish-orchestrator: ${(e as Error).message}`);
    return 1;
  }
  return runAll(tasks);
}

main().then((code) => process.exit(code));
