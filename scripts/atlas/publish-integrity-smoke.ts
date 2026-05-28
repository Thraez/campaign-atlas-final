#!/usr/bin/env tsx
/**
 * Publish integrity smoke test.
 *
 * Safety net for the `atlas:publish` speedup work (see
 * docs/superpowers/specs/2026-05-28-atlas-publish-speedup.md). A speed
 * optimization could "win" the timing metric by quietly weakening or skipping
 * a leak scan. This smoke proves the opposite: each scan still REJECTS the
 * fault it exists to catch.
 *
 * For every fault class it runs a clean/dirty pair against a throwaway temp
 * dir built from the real player artifacts:
 *
 *   - clean copy  -> the scan must exit 0   (catches a scan gutted to always-fail)
 *   - dirty copy  -> the scan must exit !=0 (catches a scan gutted to always-pass)
 *
 * A variant only PASSES when both halves hold. Variants whose content does not
 * exist in the current vault (e.g. derived secrets when there are no hidden
 * entities) are SKIPPED — that is a legitimate no-op, not a failure. A harness
 * that cannot find the artifacts it needs is an ERROR and fails the smoke.
 *
 * This script must stay independent of HOW publish invokes the scans (inline
 * chain today, an orchestrator tomorrow). It calls each scan script directly,
 * so it keeps guarding the scans no matter how the publish chain is rearranged.
 *
 * Usage:
 *   tsx scripts/atlas/publish-integrity-smoke.ts
 *
 * Exit codes:
 *   0   every fault was caught (or legitimately skipped)
 *   1   a scan failed to reject its fault, or the harness could not run
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DM_CONTENT_SENTINELS } from "../check-no-secrets";
import { deriveSecretsFromVault } from "../check-derived-secrets";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(HERE, "..");
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "atlas.config.json");
const PLAYER_ATLAS = path.join(PROJECT_ROOT, "public", "atlas", "atlas.json");
// Stable committed fixture with hidden/dm entities. The derived-secret scan is
// driven from this rather than the live vault so the guard stays active even
// when the live vault happens to contain no hidden content.
const FIXTURE_CONFIG = path.join(
  PROJECT_ROOT, "src", "test", "fixtures", "atlas-build", "atlas.config.json",
);

type Outcome = "PASS" | "FAIL" | "SKIP" | "ERROR";

interface VariantResult {
  name: string;
  scan: string;
  outcome: Outcome;
  detail: string;
}

/** Run a scan script in a child tsx process. Returns its exit code (or -1). */
function runScan(scriptRel: string, args: string[]): { code: number; stderr: string } {
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(SCRIPTS_DIR, scriptRel), ...args],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );
  return { code: res.status ?? -1, stderr: (res.stderr ?? "") + (res.error ? String(res.error) : "") };
}

/** A clean run must exit 0 and a dirty run must exit non-zero, else FAIL. */
function assertCleanThenDirty(
  name: string,
  scan: string,
  clean: () => { code: number; stderr: string },
  dirty: () => { code: number; stderr: string },
): VariantResult {
  const c = clean();
  if (c.code !== 0) {
    return {
      name, scan, outcome: "FAIL",
      detail: `clean copy was rejected (exit ${c.code}) — scan may be broken or always-fail\n${c.stderr.trim()}`,
    };
  }
  const d = dirty();
  if (d.code === 0) {
    return {
      name, scan, outcome: "FAIL",
      detail: "planted fault was NOT caught (exit 0) — scan is weakened or skipped",
    };
  }
  if (d.code < 0) {
    return { name, scan, outcome: "ERROR", detail: `dirty run failed to spawn\n${d.stderr.trim()}` };
  }
  return { name, scan, outcome: "PASS", detail: `clean exit 0, dirty exit ${d.code}` };
}

function freshDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `atlas-smoke-${label}-`));
}

function readPlayerAtlas(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(PLAYER_ATLAS, "utf8")) as Record<string, unknown>;
}

// ---- Variant 1: sentinel DM secret (check-no-secrets) -----------------------
function variantSecret(): VariantResult {
  const sentinel = DM_CONTENT_SENTINELS[0];
  return assertCleanThenDirty(
    "DM sentinel secret",
    "check-no-secrets.ts",
    () => {
      const dir = freshDir("secret-clean");
      fs.writeFileSync(path.join(dir, "notes.json"), JSON.stringify({ ok: true }));
      return runScan("check-no-secrets.ts", [dir]);
    },
    () => {
      const dir = freshDir("secret-dirty");
      fs.writeFileSync(path.join(dir, "leak.json"), JSON.stringify({ body: `prefix ${sentinel} suffix` }));
      return runScan("check-no-secrets.ts", [dir]);
    },
  );
}

// ---- Variant 2: vault-derived secret name (check-derived-secrets) -----------
function variantDerived(): VariantResult {
  const secrets = deriveSecretsFromVault(FIXTURE_CONFIG);
  if (secrets.length === 0) {
    return {
      name: "Vault-derived secret", scan: "check-derived-secrets.ts", outcome: "ERROR",
      detail: `fixture ${path.relative(PROJECT_ROOT, FIXTURE_CONFIG)} yielded no derived ` +
        "secrets — its hidden/dm entities may have changed; the harness needs updating",
    };
  }
  const secretName = secrets[0].name;
  return assertCleanThenDirty(
    "Vault-derived secret",
    "check-derived-secrets.ts",
    () => {
      const dir = freshDir("derived-clean");
      fs.writeFileSync(path.join(dir, "page.txt"), "nothing secret here");
      return runScan("check-derived-secrets.ts", [dir, "--config", FIXTURE_CONFIG]);
    },
    () => {
      const dir = freshDir("derived-dirty");
      fs.writeFileSync(path.join(dir, "page.txt"), `leaked: ${secretName}`);
      return runScan("check-derived-secrets.ts", [dir, "--config", FIXTURE_CONFIG]);
    },
  );
}

// ---- Variant 3: EXIF metadata on an image (check-image-privacy) -------------
async function variantExif(): Promise<VariantResult> {
  const base = sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } });
  const cleanBuf = await base.clone().jpeg().toBuffer();
  const dirtyBuf = await base
    .clone()
    .withExif({ IFD0: { Copyright: "SMOKE_TEST_EXIF_LEAK" } })
    .jpeg()
    .toBuffer();

  return assertCleanThenDirty(
    "Image EXIF leak",
    "check-image-privacy.ts",
    () => {
      const dir = freshDir("exif-clean");
      fs.writeFileSync(path.join(dir, "clean.jpg"), cleanBuf);
      return runScan("check-image-privacy.ts", [dir, "--config", CONFIG_PATH]);
    },
    () => {
      const dir = freshDir("exif-dirty");
      fs.writeFileSync(path.join(dir, "leak.jpg"), dirtyBuf);
      return runScan("check-image-privacy.ts", [dir, "--config", CONFIG_PATH]);
    },
  );
}

// ---- Variant 4: fog geometry not stripped (check-fog-safety) ----------------
function variantFog(): VariantResult {
  const atlas = readPlayerAtlas();
  const maps = Array.isArray(atlas.maps) ? (atlas.maps as Record<string, unknown>[]) : [];
  if (maps.length === 0) {
    return {
      name: "Fog geometry leak", scan: "check-fog-safety.ts", outcome: "SKIP",
      detail: "player atlas has no maps — fog scan has nothing to check",
    };
  }
  return assertCleanThenDirty(
    "Fog geometry leak",
    "check-fog-safety.ts",
    () => {
      const dir = freshDir("fog-clean");
      fs.writeFileSync(path.join(dir, "atlas.json"), JSON.stringify(atlas));
      return runScan("check-fog-safety.ts", [dir, "--config", CONFIG_PATH]);
    },
    () => {
      const dir = freshDir("fog-dirty");
      const dirty = readPlayerAtlas();
      const dmaps = dirty.maps as Record<string, unknown>[];
      // Enable fog on the first map and leave geometry in place — exactly the
      // strip-pipeline regression check-fog-safety exists to catch (code 14).
      dmaps[0].fog = { enabled: true, reveals: [[0, 0], [10, 0], [10, 10], [0, 10]] };
      fs.writeFileSync(path.join(dir, "atlas.json"), JSON.stringify(dirty));
      return runScan("check-fog-safety.ts", [dir, "--config", CONFIG_PATH]);
    },
  );
}

// ---- Variant 5: corrupted player atlas shape (check-artifact-shape) ---------
function variantShape(): VariantResult {
  const atlas = readPlayerAtlas();
  return assertCleanThenDirty(
    "Atlas shape violation",
    "check-artifact-shape.ts",
    () => {
      const dir = freshDir("shape-clean");
      const file = path.join(dir, "atlas.json");
      fs.writeFileSync(file, JSON.stringify(atlas));
      return runScan("check-artifact-shape.ts", [file]);
    },
    () => {
      const dir = freshDir("shape-dirty");
      const file = path.join(dir, "atlas.json");
      const dirty = readPlayerAtlas();
      const entities = Array.isArray(dirty.entities) ? (dirty.entities as unknown[]) : [];
      // A DM-only entity with a leaked source path: two independent violations
      // (visibility not player-visible, sourcePath present).
      entities.push({ id: "smoke-bad-entity", visibility: "dm", sourcePath: "content/secret.md" });
      dirty.entities = entities;
      fs.writeFileSync(file, JSON.stringify(dirty));
      return runScan("check-artifact-shape.ts", [file]);
    },
  );
}

async function main(): Promise<number> {
  if (!fs.existsSync(PLAYER_ATLAS)) {
    console.error(
      `publish-integrity-smoke: ${path.relative(PROJECT_ROOT, PLAYER_ATLAS)} not found.\n` +
      "Run `npm run atlas:build:player` (or `npm run atlas:publish`) first.",
    );
    return 1;
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`publish-integrity-smoke: atlas.config.json not found at ${CONFIG_PATH}`);
    return 1;
  }

  console.log("publish-integrity-smoke: planting faults and confirming every scan still rejects them\n");

  const results: VariantResult[] = [];
  results.push(variantSecret());
  results.push(variantDerived());
  results.push(await variantExif());
  results.push(variantFog());
  results.push(variantShape());

  const pad = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const tag = r.outcome === "PASS" ? "OK  " : r.outcome === "SKIP" ? "SKIP" : "FAIL";
    console.log(`  [${tag}] ${r.name.padEnd(pad)}  (${r.scan})`);
    if (r.outcome !== "PASS") console.log(`         ${r.detail.replace(/\n/g, "\n         ")}`);
  }

  const failed = results.filter((r) => r.outcome === "FAIL" || r.outcome === "ERROR");
  const skipped = results.filter((r) => r.outcome === "SKIP");
  console.log("");
  if (failed.length > 0) {
    console.error(
      `publish-integrity-smoke: ${failed.length} scan(s) failed to reject their fault — ` +
      "publish would ship a leak. NOT safe to optimize.",
    );
    return 1;
  }
  console.log(
    `publish-integrity-smoke: all ${results.length - skipped.length} active scan(s) caught their fault` +
    (skipped.length > 0 ? ` (${skipped.length} skipped — no such content in vault)` : "") +
    ". Safe.",
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("publish-integrity-smoke: crashed", e);
    process.exit(1);
  });
