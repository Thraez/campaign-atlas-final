/**
 * publish-push: re-verify green, scoped commit, push to main, snapshot baseline.
 *
 * Refuses (`wrong-branch`) unless `main` is checked out; pushes `HEAD:main`.
 *
 * D10 — re-verifies safety (full rebuild + scans) before pushing; never trusts
 *        a client-supplied verdict.
 * D11 — snapshots the baseline AFTER a successful push, not before.
 * D12 — classifies git failures into plain-language reasons; never surfaces
 *        raw stderr.
 *
 * Caller owns the build lock.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runPublishCheck } from "./runPublishCheck";
import { snapshotBaseline } from "./snapshot-baseline";
import type { PublishPushResult, PublishCheckResult } from "./publishTypes";

const execFileAsync = promisify(execFile);

/** The only branch publish commits on and pushes to (publish-atlas.yml deploys it). */
const PUBLISH_BRANCH = "main";

// Scoped pathspec (§5.2): world source + built player atlas files.
// NOT a bare world.yaml (it lives under content/), NOT .last-published.json
// (git-ignored), NOT dist/ or .local-atlas/ (git-ignored), NOT src/ or scripts/.
const COMMIT_PATHSPEC = [
  "content",
  "atlas.config.json",
  "public/atlas/atlas.json",
  "public/atlas/search-index.json",
  "public/atlas/assets",
];

/** Classify a git push/commit failure from stderr into a plain-language reason.
 *  Never surfaces raw stderr text. */
export function classifyGitFailure(
  stderr: string,
): "offline" | "auth" | "behind" | "conflict" | "unknown" {
  const s = stderr.toLowerCase();
  if (
    s.includes("could not resolve host") ||
    s.includes("could not read from remote") ||
    s.includes("unable to access")
  )
    return "offline";
  if (
    s.includes("authentication failed") ||
    s.includes("could not read username") ||
    s.includes("permission denied")
  )
    return "auth";
  if (
    s.includes("non-fast-forward") ||
    s.includes("[rejected]") ||
    s.includes("fetch first") ||
    s.includes("behind")
  )
    return "behind";
  if (s.includes("conflict")) return "conflict";
  return "unknown";
}

async function git(
  repoRoot: string,
  args: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string }> {
  try {
    // git does NOT need shell:true on Windows — pass args as an array for safety.
    const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
    return { ok: true, stdout };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false, stderr: err.stderr || err.message || "git failed" };
  }
}

/** Injectable verify function (defaults to runPublishCheck) — allows tests to
 *  stub the re-verify step without a real build. */
export async function runPublishPush(
  repoRoot: string,
  options: {
    now?: string;
    verify?: (root: string) => Promise<PublishCheckResult>;
  } = {},
): Promise<PublishPushResult> {
  const now = options.now ?? new Date().toISOString();
  const verify = options.verify ?? runPublishCheck;

  // 0. Publish only from `main`: the deploy workflow runs on pushes to main, so a
  //    commit on any other branch would never reach players, and pushing a local
  //    `main` we didn't just commit to could ship unrelated work. Checked before
  //    the rebuild and before anything is staged.
  const head = await git(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const branch = head.ok ? head.stdout.trim() : ""; // "" = detached HEAD
  if (branch !== PUBLISH_BRANCH) return { status: "wrong-branch", branch };

  // 1. Re-verify safety (D10) — never trust a client-claimed verdict.
  const check = await verify(repoRoot);
  if (check.verdict !== "safe") return { status: "blocked", reasons: check.reasons };

  // 2. Stage the scoped pathspec (world source + built player atlas).
  //    Filter to paths that actually exist — git add errors on missing pathspecs.
  //    If none of the scoped paths exist yet, there is nothing to publish.
  const existingPaths = COMMIT_PATHSPEC.filter((p) => fs.existsSync(path.resolve(repoRoot, p)));
  if (!existingPaths.length) return { status: "nothing-to-publish" };

  const add = await git(repoRoot, ["add", "--", ...existingPaths]);
  if (!add.ok) return { status: "git-failed", reason: classifyGitFailure(add.stderr) };

  // 3. Check whether there is anything staged in scope.
  //    git diff --cached --quiet exits 0 when NO diff, 1 when there IS a diff.
  //    ok:true (exit 0) → nothing staged → nothing-to-publish.
  //    ok:false (exit 1) → changes staged → continue to commit.
  const staged = await git(repoRoot, ["diff", "--cached", "--quiet", "--", ...existingPaths]);
  if (staged.ok) return { status: "nothing-to-publish" };

  // 4. Commit with a generated message (DM is not asked to write one).
  //    Use existingPaths (the filtered set) — same reason as git add: passing
  //    non-existent paths to git commit errors on some git versions.
  const date = now.slice(0, 10);
  const commit = await git(repoRoot, [
    "commit",
    "-m",
    `publish: world update ${date}`,
    "--",
    ...existingPaths,
  ]);
  if (!commit.ok) return { status: "git-failed", reason: classifyGitFailure(commit.stderr) };

  // 5. Push the commit just made to main (uses the machine's ambient git
  //    credentials — D6). HEAD:main, so what ships is exactly this HEAD.
  const push = await git(repoRoot, ["push", "origin", `HEAD:${PUBLISH_BRANCH}`]);
  if (!push.ok) return { status: "git-failed", reason: classifyGitFailure(push.stderr) };

  // 6. Snapshot the just-pushed player atlas as the new diff baseline (D11).
  snapshotBaseline(repoRoot);

  const sha = await git(repoRoot, ["rev-parse", "--short", "HEAD"]);
  return {
    status: "published",
    pushedAt: now,
    commit: sha.ok ? sha.stdout.trim() : "",
  };
}
