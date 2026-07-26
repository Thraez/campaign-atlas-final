// Runs the OOM-avoiding sharded vitest invocation as one command instead of four
// copy-pasted lines. See docs/CODEBASE_MAP.md's "Always shard" trap: a whole-suite
// `vitest run` OOMs the coordinator on this repo's ~250 test files.
//
// Run with: npm run test:ci
import { spawnSync } from "node:child_process";

const SHARD_COUNT = 4;
let anyShardFailed = false;

for (let shard = 1; shard <= SHARD_COUNT; shard++) {
  console.log(`\n--- shard ${shard}/${SHARD_COUNT} ---`);
  const result = spawnSync(
    "npx",
    ["vitest", "run", "--pool=forks", "--poolOptions.forks.maxForks=3", `--shard=${shard}/${SHARD_COUNT}`],
    { stdio: "inherit", shell: true },
  );
  if (result.status !== 0) {
    anyShardFailed = true;
    console.error(`\nshard ${shard}/${SHARD_COUNT} failed (exit code ${result.status})`);
  }
}

if (anyShardFailed) {
  console.error("\ntest:ci FAILED — one or more shards reported failures");
  process.exit(1);
}

console.log("\ntest:ci passed — all shards green");
