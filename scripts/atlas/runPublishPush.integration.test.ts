/**
 * Integration test for runPublishPush against a throwaway local git repo.
 * No network — a second local bare repo acts as "origin".
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runPublishPush } from "./runPublishPush";
import type { PublishCheckResult } from "./publishTypes";

/** Synchronous git helper for test setup. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

const SAFE_CHECK: PublishCheckResult = {
  verdict: "safe",
  reasons: [],
  diff: {
    hasChanges: false,
    counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
    entities: [],
    placements: [],
    maps: [],
    overlays: [],
    meta: {},
  },
  builtAt: "2026-06-16T00:00:00.000Z",
  repoIsPublic: true,
};

const BLOCKED_CHECK: PublishCheckResult = {
  ...SAFE_CHECK,
  verdict: "blocked",
  reasons: [
    {
      scan: "check-derived-secrets",
      target: "dist",
      severity: "blocking",
      message: "The name of a hidden person or place would have leaked into the player site.",
    },
  ],
};

/** Set up a bare repo + a working repo with origin pointing at it. Returns
 *  [repoDir, bareDir] — caller must clean them up. */
function makeTestRepo(): [string, string] {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-repo-"));
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-bare-"));

  // Init repo with a main branch
  git(repoDir, "init");
  git(repoDir, "config", "user.email", "test@example.com");
  git(repoDir, "config", "user.name", "Test");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# test");
  git(repoDir, "add", "README.md");
  git(repoDir, "commit", "-m", "initial");
  git(repoDir, "branch", "-M", "main");

  // Init bare origin and connect
  execFileSync("git", ["init", "--bare", bareDir], { stdio: "pipe" });
  // Set bare HEAD to main so push works without --set-upstream
  execFileSync("git", ["-C", bareDir, "symbolic-ref", "HEAD", "refs/heads/main"], {
    stdio: "pipe",
  });
  git(repoDir, "remote", "add", "origin", bareDir);
  git(repoDir, "push", "origin", "main");

  return [repoDir, bareDir];
}

describe("runPublishPush (integration — no network)", () => {
  it("commits scoped paths, pushes, writes snapshot; second call = nothing-to-publish", async () => {
    const [repoDir, bareDir] = makeTestRepo();
    try {
      // Seed scoped files (not yet committed — runPublishPush will stage + commit)
      fs.mkdirSync(path.join(repoDir, "content"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, "content", "notes.md"), "# note");
      fs.mkdirSync(path.join(repoDir, "public", "atlas"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, "public", "atlas", "atlas.json"), '{"worlds":[]}');
      fs.writeFileSync(path.join(repoDir, "atlas.config.json"), '{"contentRoot":"content"}');

      // Seed out-of-scope file — must NOT appear in the commit
      fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, "src", "app.ts"), "// dirty code");

      const result = await runPublishPush(repoDir, {
        now: "2026-06-16T00:00:00.000Z",
        verify: async () => SAFE_CHECK,
      });

      // Published with the stubbed timestamp
      expect(result.status).toBe("published");
      if (result.status === "published") {
        expect(result.pushedAt).toBe("2026-06-16T00:00:00.000Z");
        expect(result.commit).toMatch(/^[0-9a-f]+$/);
      }

      // Snapshot was written after the push
      expect(
        fs.existsSync(path.join(repoDir, "public", "atlas", ".last-published.json")),
      ).toBe(true);

      // The commit staged only scoped paths
      const committed = git(repoDir, "show", "--name-only", "--format=", "HEAD");
      expect(committed).toContain("content/notes.md");
      expect(committed).toContain("public/atlas/atlas.json");
      expect(committed).toContain("atlas.config.json");
      // Out-of-scope files must not appear
      expect(committed).not.toContain("src/app.ts");
      // .last-published.json is written after the commit — must not be staged
      expect(committed).not.toContain(".last-published.json");

      // Second call → nothing-to-publish (all scoped paths are clean)
      const result2 = await runPublishPush(repoDir, {
        now: "2026-06-16T00:01:00.000Z",
        verify: async () => SAFE_CHECK,
      });
      expect(result2.status).toBe("nothing-to-publish");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("returns nothing-to-publish when the repo has no scoped changes", async () => {
    const [repoDir, bareDir] = makeTestRepo();
    try {
      // No content/ or public/atlas/ files — nothing in scope
      const result = await runPublishPush(repoDir, {
        verify: async () => SAFE_CHECK,
      });
      expect(result.status).toBe("nothing-to-publish");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("returns blocked when re-verify returns a non-safe verdict", async () => {
    const [repoDir, bareDir] = makeTestRepo();
    try {
      const result = await runPublishPush(repoDir, {
        verify: async () => BLOCKED_CHECK,
      });
      expect(result.status).toBe("blocked");
      if (result.status === "blocked") {
        expect(result.reasons).toHaveLength(1);
        expect(result.reasons[0].scan).toBe("check-derived-secrets");
      }
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  }, 10_000);
});
