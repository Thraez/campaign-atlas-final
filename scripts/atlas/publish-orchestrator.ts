#!/usr/bin/env tsx
/**
 * Parallel scan orchestrator for atlas:publish.
 *
 * Replaces the sequential per-scan tsx invocations in package.json with a
 * single-process Promise.all over all scan modules, eliminating the per-scan
 * tsx cold-start cost (~6–7 cold starts → 1).
 *
 * All scans are read-only: they share no mutable state, so parallel execution
 * is safe.
 *
 * Exit codes:
 *   0   all scans clean
 *   1   one or more scans failed (details printed by individual scanners)
 */
import fs from "node:fs";
import path from "node:path";

import { run as checkNoSecrets } from "../check-no-secrets.js";
import { run as checkDerivedSecrets } from "../check-derived-secrets.js";
import { run as checkImagePrivacy } from "../check-image-privacy.js";
import { run as checkFogSafety } from "../check-fog-safety.js";
import { run as checkArtifactShape } from "../check-artifact-shape.js";
import { run as auditAssets } from "./audit-assets.js";

interface Config { contentRoot: string }

function resolveContentDir(): string {
  const configPath = path.resolve(process.cwd(), "atlas.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`atlas.config.json not found at ${configPath}`);
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
  return path.resolve(path.dirname(configPath), cfg.contentRoot);
}

interface ScanTask {
  label: string;
  fn: () => number | Promise<number>;
}

async function main(): Promise<number> {
  let contentDir: string;
  try {
    contentDir = resolveContentDir();
  } catch (e) {
    console.error(`publish-orchestrator: ${(e as Error).message}`);
    return 1;
  }

  const tasks: ScanTask[] = [
    { label: "check-secrets dist",          fn: () => checkNoSecrets({ dir: "dist" }) },
    { label: "check-secrets public/atlas",   fn: () => checkNoSecrets({ dir: "public/atlas" }) },
    { label: "check-shape",                  fn: () => checkArtifactShape({ atlasJsonPath: "public/atlas/atlas.json" }) },
    { label: "check-derived dist",           fn: () => checkDerivedSecrets({ dir: "dist" }) },
    { label: "check-derived public/atlas",   fn: () => checkDerivedSecrets({ dir: "public/atlas" }) },
    { label: "check-image-privacy dist",     fn: () => checkImagePrivacy({ dir: "dist" }) },
    { label: "check-image-privacy public/atlas", fn: () => checkImagePrivacy({ dir: "public/atlas" }) },
    { label: "audit-assets",                 fn: () => auditAssets({ assetsDir: "public/atlas/assets", publicDir: "public", contentDir }) },
    { label: "check-fog public/atlas",       fn: () => checkFogSafety({ dir: "public/atlas" }) },
    { label: "check-fog dist",               fn: () => checkFogSafety({ dir: "dist" }) },
  ];

  const results = await Promise.all(
    tasks.map(async (t) => ({ label: t.label, code: await t.fn() }))
  );

  const failures = results.filter((r) => r.code !== 0);
  if (failures.length === 0) {
    console.log(`\npublish-orchestrator: all ${tasks.length} scans clean`);
    return 0;
  }

  console.error(`\npublish-orchestrator: ${failures.length} scan(s) failed:`);
  for (const f of failures) {
    console.error(`  [exit ${f.code}] ${f.label}`);
  }
  return 1;
}

main().then((code) => process.exit(code));
