/**
 * Orchestrates a publish-check: player build → site build → scans → diff.
 * Caller (the endpoint) owns the build lock.
 *
 * Imports runBuild directly from build-atlas to avoid a circular dependency
 * with vite-plugin-atlas-save (which will import this module).
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runBuild } from "../build-atlas";
import { runPublishScans } from "./publishScan";
import { computeAtlasDiff } from "../../src/atlas/publish/computeAtlasDiff";
import type { AtlasDiff } from "../../src/atlas/publish/computeAtlasDiff";
import type { PublishCheckResult } from "./publishTypes";

const execFileAsync = promisify(execFile);
const PLAYER_BUILD_TIMEOUT_MS = 60_000;
const SITE_BUILD_TIMEOUT_MS = 180_000;

const EMPTY_DIFF: AtlasDiff = {
  hasChanges: false,
  counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
  entities: [],
  placements: [],
  maps: [],
  overlays: [],
  meta: {},
};

function readAtlas(p: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function buildFailed(error: string): PublishCheckResult {
  return {
    verdict: "build-failed",
    reasons: [],
    diff: EMPTY_DIFF,
    builtAt: new Date().toISOString(),
    buildError: error.slice(-2000),
    repoIsPublic: true,
  };
}

async function runPlayerBuildWithTimeout(): Promise<{ ok: boolean; error?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; error: string }>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: `player build timed out after ${PLAYER_BUILD_TIMEOUT_MS}ms` }),
      PLAYER_BUILD_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([runBuild({ player: true, strict: true }), timeout]);
    if (timer) clearTimeout(timer);
    if (result.ok) return { ok: true };
    const errStr = "error" in result && result.error ? result.error : "";
    return { ok: false, error: errStr ? errStr.slice(-2000) : "player build failed" };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runPublishCheck(repoRoot: string): Promise<PublishCheckResult> {
  // 1. Player atlas build (in-process, player+strict → public/atlas/atlas.json)
  const playerBuild = await runPlayerBuildWithTimeout();
  if (!playerBuild.ok) return buildFailed(playerBuild.error ?? "player build failed");

  // 2. Site build (child process → dist/)
  try {
    await execFileAsync("npm", ["run", "build"], {
      cwd: repoRoot,
      timeout: SITE_BUILD_TIMEOUT_MS,
      // npm on Windows needs shell to find npm.cmd
      shell: process.platform === "win32",
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const errText = err.stderr || err.stdout || err.message || "site build failed";
    return buildFailed(errText);
  }

  // 3. Scans (in-process, structured)
  const reasons = await runPublishScans(repoRoot);

  // 4. Player-vs-player diff (server-side — the dev server shadows the player atlas,
  //    so clients cannot fetch it; we compute here and return it in the response).
  const baselinePath = path.resolve(repoRoot, "public/atlas/.last-published.json");
  const currentPath = path.resolve(repoRoot, "public/atlas/atlas.json");
  const baseline = readAtlas(baselinePath);
  const current = readAtlas(currentPath);

  // computeAtlasDiff accepts null for either side and returns EMPTY_DIFF.
  // The @/ imports in that module are all "import type" (erased at runtime).
  const diff = computeAtlasDiff(
    baseline as Parameters<typeof computeAtlasDiff>[0],
    current as Parameters<typeof computeAtlasDiff>[1],
  );

  return {
    verdict: reasons.length === 0 ? "safe" : "blocked",
    reasons,
    diff,
    builtAt: new Date().toISOString(),
    repoIsPublic: true,
  };
}
