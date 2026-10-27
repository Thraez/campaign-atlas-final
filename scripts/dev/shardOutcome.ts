// Decides what test:ci does with one shard's result. A shard can exit 1 on
// vitest's "Timeout calling onTaskUpdate" with every test green (worker
// noise, see docs/CODEBASE_MAP.md); that shard gets one re-run. Anything
// else non-zero is a real failure. Same signature scripts/pre-commit.sh
// tolerates.
export type ShardOutcome = "pass" | "retry" | "fail";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

export function classifyShard(status: number | null, output: string): ShardOutcome {
  if (status === 0) return "pass";
  const clean = output.replace(ANSI, "");
  if (/\b\d+ failed\b/.test(clean)) return "fail";
  const workerTimeout = /\[vitest-worker\]: Timeout calling/.test(clean);
  const testsPassed = /Tests +\d+ passed/.test(clean);
  return workerTimeout && testsPassed ? "retry" : "fail";
}
