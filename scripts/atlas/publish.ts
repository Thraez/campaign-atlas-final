#!/usr/bin/env tsx
/**
 * `npm run atlas:publish [-- --config <file>]` (R-19): runs `publishPlan`.
 *
 *   npm run atlas:publish                                  v1: public/atlas, dist
 *   npm run atlas:publish -- --config atlas.next.config.json   v2: every campaign
 *
 * Fails closed: the first step that fails (a campaign's player build, its
 * site build, staging, any scan) stops the publish with a non-zero exit.
 * Local only: no workflow runs the v2 form (`publish-atlas.yml` runs the v1
 * steps itself and uploads `dist/`).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { parsePublishArgs, publishPlan, stageCampaignPublicDir } from "./publishPlan.js";

const require = createRequire(import.meta.url);

function argvFor(run: string[], root: string): string[] {
  const [tool, ...rest] = run;
  if (tool === "tsx") return ["--import", "tsx", path.join(root, rest[0]), ...rest.slice(1)];
  if (tool === "vite") {
    const pkg = require.resolve("vite/package.json");
    return [path.join(path.dirname(pkg), "bin", "vite.js"), ...rest];
  }
  throw new Error(`publish: unknown tool ${tool}`);
}

function main(): number {
  const root = process.cwd();
  let configPath: string;
  try {
    configPath = path.resolve(root, parsePublishArgs(process.argv.slice(2)).configPath);
  } catch (e) {
    console.error(`publish: ${(e as Error).message}`);
    return 1;
  }
  if (!fs.existsSync(configPath)) {
    console.error(`publish: config not found at ${configPath}`);
    return 1;
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-publish-"));
  try {
    const plan = publishPlan({ root, configPath, scratchDir: scratch });
    for (const step of plan) {
      console.log(`\npublish: ${step.label}`);
      if (step.clean) fs.rmSync(step.clean, { recursive: true, force: true });
      if (step.stage) stageCampaignPublicDir(step.stage);
      if (step.run) {
        const env = { ...process.env };
        for (const [k, v] of Object.entries(step.env ?? {})) {
          if (v === undefined) delete env[k];
          else env[k] = v;
        }
        const res = spawnSync(process.execPath, argvFor(step.run, root), {
          cwd: root,
          env,
          stdio: "inherit",
        });
        if (res.status !== 0) {
          console.error(`publish: ${step.label} failed (exit ${res.status ?? res.signal})`);
          return res.status || 1;
        }
      }
    }
    console.log(`\npublish: done (${path.relative(root, configPath)})`);
    return 0;
  } catch (e) {
    console.error(`publish: ${(e as Error).message}`);
    return 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

process.exit(main());
