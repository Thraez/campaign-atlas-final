// The one test runner. `npm run test:ci` runs every shard in turn (the PR check,
// the publish workflow and `npm run verify` all call it); `npm run test:changed`
// (`--changed`) runs only the tests related to uncommitted changes, for
// scripts/pre-commit.sh. Flags and the worker-timeout retry rule live in
// ./shardOutcome.ts. See docs/CODEBASE_MAP.md's "Always shard" trap: a
// whole-suite `vitest run` OOMs the coordinator on this repo's ~250 test files.
import { spawn } from "node:child_process";
import path from "node:path";
import { classifyShard, SHARD_COUNT, vitestArgs, type VitestTarget } from "./shardOutcome";

const VITEST = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);

// Streams the run's output as usual and keeps a copy for classifyShard.
function runVitest(target: VitestTarget): Promise<{ status: number | null; output: string }> {
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

// Runs one target, re-running it once on the worker-timeout noise. True if it passed.
async function runWithRetry(target: VitestTarget, label: string): Promise<boolean> {
  let { status, output } = await runVitest(target);
  if (classifyShard(status, output, target) === "retry") {
    console.warn(`\n${label}: worker timeout with all tests passed; re-running once`);
    ({ status, output } = await runVitest(target));
  }
  if (classifyShard(status, output, target) !== "pass") {
    console.error(`\n${label} failed (exit code ${status})`);
    return false;
  }
  return true;
}

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--changed");
if (unknown.length > 0) {
  console.error(`run-sharded-tests: unknown argument(s): ${unknown.join(" ")}`);
  process.exit(2);
}

if (args.includes("--changed")) {
  if (!(await runWithRetry("changed", "vitest --changed"))) {
    console.error("\ntest:changed FAILED");
    process.exit(1);
  }
  console.log("\ntest:changed passed");
  process.exit(0);
}

let anyShardFailed = false;

for (let shard = 1; shard <= SHARD_COUNT; shard++) {
  console.log(`\n--- shard ${shard}/${SHARD_COUNT} ---`);
  if (!(await runWithRetry({ shard }, `shard ${shard}/${SHARD_COUNT}`))) anyShardFailed = true;
}

if (anyShardFailed) {
  console.error("\ntest:ci FAILED — one or more shards reported failures");
  process.exit(1);
}

console.log("\ntest:ci passed — all shards green");
