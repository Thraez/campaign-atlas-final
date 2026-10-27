// Runs the OOM-avoiding sharded vitest invocation as one command instead of four
// copy-pasted lines. See docs/CODEBASE_MAP.md's "Always shard" trap: a whole-suite
// `vitest run` OOMs the coordinator on this repo's ~250 test files.
//
// Run with: npm run test:ci
import { spawn } from "node:child_process";
import path from "node:path";
import { classifyShard } from "./shardOutcome";

const SHARD_COUNT = 4;
const VITEST = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);

// Streams the shard's output as usual and keeps a copy for classifyShard.
function runShard(shard: number): Promise<{ status: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      VITEST,
      ["run", "--pool=forks", "--poolOptions.forks.maxForks=3", `--shard=${shard}/${SHARD_COUNT}`],
      { stdio: ["inherit", "pipe", "pipe"], shell: process.platform === "win32" },
    );
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

let anyShardFailed = false;

for (let shard = 1; shard <= SHARD_COUNT; shard++) {
  console.log(`\n--- shard ${shard}/${SHARD_COUNT} ---`);
  let { status, output } = await runShard(shard);
  if (classifyShard(status, output) === "retry") {
    console.warn(
      `\nshard ${shard}/${SHARD_COUNT}: worker timeout with all tests passed; re-running once`,
    );
    ({ status, output } = await runShard(shard));
  }
  if (classifyShard(status, output) !== "pass") {
    anyShardFailed = true;
    console.error(`\nshard ${shard}/${SHARD_COUNT} failed (exit code ${status})`);
  }
}

if (anyShardFailed) {
  console.error("\ntest:ci FAILED — one or more shards reported failures");
  process.exit(1);
}

console.log("\ntest:ci passed — all shards green");
