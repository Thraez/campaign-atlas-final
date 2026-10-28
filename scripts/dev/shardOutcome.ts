// The one place that says how the test suite is run and what a run's result
// means. scripts/dev/run-sharded-tests.ts is the only caller:
//   npm run test:ci          every shard in turn (publish workflow, `npm run verify`)
//   npm run test:shard -- N  one shard (the PR check's matrix jobs)
//   npm run test:changed     tests related to uncommitted changes (pre-commit hook)
//
// Shards: a whole-suite `vitest run` OOMs the coordinator (docs/CODEBASE_MAP.md,
// "Always shard"), so the suite runs as SHARD_COUNT shards. The pool and worker
// cap live in vitest.config.ts, not on the command line.
//
// Retry rule: a run can exit 1 on vitest's "Timeout calling onTaskUpdate" with
// every test green (worker noise); that run gets one re-run, and the re-run's
// result decides. Anything else non-zero is a real failure.
export type RunOutcome = "pass" | "no-tests" | "retry" | "fail";

export const SHARD_COUNT = 4;

// One shard of the whole suite, or ("changed") just the tests related to
// uncommitted changes, which is what the pre-commit hook runs.
export type VitestTarget = { shard: number } | "changed";

export type VitestResult = { status: number | null; output: string };

export function vitestArgs(target: VitestTarget): string[] {
  if (target === "changed") return ["run", "--changed"];
  return ["run", `--shard=${target.shard}/${SHARD_COUNT}`];
}

export type RunnerPlan = { kind: "all" } | { kind: "one"; target: VitestTarget };

// Reads run-sharded-tests.ts's arguments. A shard number outside 1..SHARD_COUNT
// throws, so a CI matrix that no longer matches SHARD_COUNT fails loudly.
export function parseRunnerArgs(args: string[]): RunnerPlan {
  if (args.length === 0) return { kind: "all" };
  if (args.length === 1 && args[0] === "--changed") return { kind: "one", target: "changed" };
  if (args.length === 2 && args[0] === "--shard") {
    const shard = Number(args[1]);
    if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) {
      throw new Error(`--shard needs a number in 1..${SHARD_COUNT}, got "${args[1]}"`);
    }
    return { kind: "one", target: { shard } };
  }
  if (args[0] === "--shard") throw new Error(`--shard needs a number in 1..${SHARD_COUNT}`);
  throw new Error(`unknown argument(s): ${args.join(" ")}`);
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

// `target` matters for one case: a --changed run that matches no test files
// (a docs- or config-only commit) exits 1 but has nothing to verify, so it is
// "no-tests", which counts as a pass. A shard with no tests means the suite is
// misconfigured, so it fails.
export function classifyRun(
  status: number | null,
  output: string,
  target: VitestTarget,
): RunOutcome {
  const clean = output.replace(ANSI, "");
  // A failure in the summary always fails, whatever the exit code says.
  if (/(?:Test Files|Tests) +\d+ failed\b/.test(clean)) return "fail";
  if (status === 0) return "pass";
  if (/\b\d+ failed\b/.test(clean)) return "fail";
  if (target === "changed" && clean.includes("No test files found")) return "no-tests";
  const workerTimeout = /\[vitest-worker\]: Timeout calling/.test(clean);
  const testsPassed = /Tests +\d+ passed/.test(clean);
  return workerTimeout && testsPassed ? "retry" : "fail";
}

// Runs one target through `run` (vitest, or a fake in tests), re-running it at
// most once on the worker-timeout noise. Never returns "retry".
export async function runWithRetry(
  target: VitestTarget,
  run: (target: VitestTarget) => Promise<VitestResult>,
  onRetry: () => void = () => {},
): Promise<Exclude<RunOutcome, "retry">> {
  const first = await run(target);
  const outcome = classifyRun(first.status, first.output, target);
  if (outcome !== "retry") return outcome;
  onRetry();
  const second = await run(target);
  const final = classifyRun(second.status, second.output, target);
  return final === "retry" ? "fail" : final;
}
