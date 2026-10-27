/**
 * Publish safety outside the code paths (eval-2026-10/04): the deploy waits on
 * the safety scans, and the safety doc points at tests that exist.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = path.resolve(__dirname, "../..");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  "continue-on-error"?: unknown;
}
interface Job {
  needs?: string | string[];
  if?: string;
  "continue-on-error"?: unknown;
  steps?: Step[];
}

describe(".github/workflows/publish-atlas.yml", () => {
  const wf = yaml.load(
    fs.readFileSync(path.join(ROOT, ".github/workflows/publish-atlas.yml"), "utf8"),
  ) as { jobs: Record<string, Job> };
  const jobs = wf.jobs;

  const needsOf = (id: string): string[] => {
    const n = jobs[id]?.needs;
    return n === undefined ? [] : Array.isArray(n) ? n : [n];
  };
  /** Every job `id` waits on, directly or through another job. */
  const upstream = (id: string, seen = new Set<string>()): Set<string> => {
    for (const n of needsOf(id)) {
      if (!seen.has(n)) {
        seen.add(n);
        upstream(n, seen);
      }
    }
    return seen;
  };
  const findStep = (pred: (s: Step) => boolean) =>
    Object.entries(jobs).flatMap(([id, j]) =>
      (j.steps ?? []).map((s, i) => ({ job: id, index: i, step: s })).filter((x) => pred(x.step)),
    );

  it("the deploy waits on the safety scans, and a failed scan stops it", () => {
    const scans = findStep((s) => /\bnpm run atlas:scan\b/.test(s.run ?? ""));
    const deploys = findStep((s) => (s.uses ?? "").startsWith("actions/deploy-pages"));
    const uploads = findStep((s) => (s.uses ?? "").startsWith("actions/upload-pages-artifact"));
    expect(scans).toHaveLength(1);
    expect(deploys).toHaveLength(1);
    expect(uploads).toHaveLength(1);
    const [scan] = scans;
    const [deploy] = deploys;
    const [upload] = uploads;

    // A scan failure must fail its job: no soft-fail on the step or the job.
    expect(scan.step["continue-on-error"]).toBeUndefined();
    expect(jobs[scan.job]["continue-on-error"]).toBeUndefined();
    expect(scan.step.if ?? "").not.toMatch(/always\(\)|failure\(\)|cancelled\(\)/);

    // The artifact the deploy publishes is uploaded after the scan, in the same
    // job, and not on an `if:` that would run it past a failed scan.
    expect(upload.job).toBe(scan.job);
    expect(upload.index).toBeGreaterThan(scan.index);
    expect(upload.step.if ?? "").not.toMatch(/always\(\)|failure\(\)|cancelled\(\)/);

    // The deploy job needs the scanning job, and doesn't run regardless of it.
    expect(deploy.job).not.toBe(scan.job);
    expect(upstream(deploy.job).has(scan.job)).toBe(true);
    expect(jobs[deploy.job].if ?? "").not.toMatch(/always\(\)|failure\(\)|cancelled\(\)/);
  });

  it("atlas:scan runs the publish orchestrator", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["atlas:scan"]).toMatch(/scripts\/atlas\/publish-orchestrator\.ts/);
  });
});

describe("docs/VISIBILITY_AND_PLAYER_SAFETY.md", () => {
  function findTestFile(dir: string, name: string): boolean {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory() ? findTestFile(abs, name) : e.name === name) return true;
    }
    return false;
  }

  it("names only test files that exist under src/ or scripts/", () => {
    const doc = fs.readFileSync(path.join(ROOT, "docs/VISIBILITY_AND_PLAYER_SAFETY.md"), "utf8");
    const named = [...new Set(doc.match(/[\w.-]+\.test\.tsx?/g) ?? [])];
    expect(named.length).toBeGreaterThan(0);
    const missing = named.filter(
      (n) =>
        !findTestFile(path.join(ROOT, "src"), n) && !findTestFile(path.join(ROOT, "scripts"), n),
    );
    expect(missing).toEqual([]);
  });
});
