// The one place that says how the test suite is run and what a run's result
// means. scripts/dev/run-sharded-tests.ts (`npm run test:ci`, `npm run
// test:changed`) is the only caller; the PR check, the publish workflow and
// scripts/pre-commit.sh all go through it.
//
// Shards: a whole-suite `vitest run` OOMs the coordinator (docs/CODEBASE_MAP.md,
// "Always shard"), so the suite runs as SHARD_COUNT shards one after another.
// The pool and worker cap live in vitest.config.ts, not on the command line.
//
// Retry rule: a run can exit 1 on vitest's "Timeout calling onTaskUpdate" with
// every test green (worker noise); that run gets one re-run. Anything else
// non-zero is a real failure.
export type ShardOutcome = "pass" | "retry" | "fail";

export const SHARD_COUNT = 4;

// One shard of the whole suite, or ("changed") just the tests related to
// uncommitted changes, which is what the pre-commit hook runs.
export type VitestTarget = { shard: number } | "changed";

export function vitestArgs(target: VitestTarget): string[] {
  if (target === "changed") return ["run", "--changed"];
  return ["run", `--shard=${target.shard}/${SHARD_COUNT}`];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

// `target` matters for one case: a --changed run that matches no test files
// (a docs- or config-only commit) exits 1 but has nothing to verify, so it
// passes. A shard with no tests means the suite is misconfigured, so it fails.
export function classifyShard(
  status: number | null,
  output: string,
  target?: VitestTarget,
): ShardOutcome {
  const clean = output.replace(ANSI, "");
  // A failure in the summary always fails, whatever the exit code says.
  if (/(?:Test Files|Tests) +\d+ failed\b/.test(clean)) return "fail";
  if (status === 0) return "pass";
  if (/\b\d+ failed\b/.test(clean)) return "fail";
  if (target === "changed" && clean.includes("No test files found")) return "pass";
  const workerTimeout = /\[vitest-worker\]: Timeout calling/.test(clean);
  const testsPassed = /Tests +\d+ passed/.test(clean);
  return workerTimeout && testsPassed ? "retry" : "fail";
}
