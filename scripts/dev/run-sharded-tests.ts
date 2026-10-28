// The one test runner. Entry points, shard flags and the worker-timeout retry
// rule are in ./shardOutcome.ts:
//   npm run test:ci          every shard in turn (publish workflow, `npm run verify`)
//   npm run test:shard -- N  shard N only (the PR check's matrix jobs)
//   npm run test:changed     tests related to uncommitted changes (scripts/pre-commit.sh)
// See docs/CODEBASE_MAP.md's "Always shard" trap: a whole-suite `vitest run`
// OOMs the coordinator on this repo's ~250 test files.
import { spawn } from "node:child_process";
import path from "node:path";
import {
  parseRunnerArgs,
  runWithRetry,
  SHARD_COUNT,
  vitestArgs,
  type RunnerPlan,
  type VitestResult,
  type VitestTarget,
} from "./shardOutcome";

const VITEST = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);

// Streams the run's output as usual and keeps a copy for classifyRun.
function runVitest(target: VitestTarget): Promise<VitestResult> {
  return new Promise((resolve) => {
    const child = spawn(VITEST, vitestArgs(target), {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (err) => resolve({ status: null, output: output + String(err) }));
    child.on("close", (status) => resolve({ status, output }));
  });
}

function label(target: VitestTarget): string {
  return target === "changed" ? "test:changed" : `shard ${target.shard}/${SHARD_COUNT}`;
}

// True if the target passed (or, for the hook, had no related tests).
async function runTarget(target: VitestTarget): Promise<boolean> {
  const outcome = await runWithRetry(target, runVitest, () =>
    console.warn(`\n${label(target)}: worker timeout with all tests passed; re-running once`),
  );
  if (outcome === "no-tests") {
    console.log(`\n${label(target)}: no tests relate to these changes; nothing to run.`);
    return true;
  }
  if (outcome === "fail") {
    console.error(`\n${label(target)} FAILED`);
    return false;
  }
  console.log(`\n${label(target)} passed`);
  return true;
}

let plan: RunnerPlan;
try {
  plan = parseRunnerArgs(process.argv.slice(2));
} catch (err) {
  console.error(`run-sharded-tests: ${(err as Error).message}`);
  process.exit(2);
}

if (plan.kind === "one") {
  process.exit((await runTarget(plan.target)) ? 0 : 1);
}

let anyShardFailed = false;

for (let shard = 1; shard <= SHARD_COUNT; shard++) {
  console.log(`\n--- shard ${shard}/${SHARD_COUNT} ---`);
  if (!(await runTarget({ shard }))) anyShardFailed = true;
}

if (anyShardFailed) {
  console.error("\ntest:ci FAILED — one or more shards reported failures");
  process.exit(1);
}

console.log("\ntest:ci passed — all shards green");
