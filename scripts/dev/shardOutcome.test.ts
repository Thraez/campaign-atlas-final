import { describe, expect, it } from "vitest";
import {
  classifyRun,
  parseRunnerArgs,
  runWithRetry,
  SHARD_COUNT,
  vitestArgs,
  type VitestResult,
  type VitestTarget,
} from "./shardOutcome";

describe("vitestArgs", () => {
  it("runs shard N of the suite's four shards", () => {
    expect(SHARD_COUNT).toBe(4);
    expect(vitestArgs({ shard: 2 })).toEqual(["run", "--shard=2/4"]);
  });

  it("runs only the tests related to uncommitted changes for the pre-commit hook", () => {
    expect(vitestArgs("changed")).toEqual(["run", "--changed"]);
  });
});

describe("parseRunnerArgs", () => {
  it("runs every shard when given nothing (npm run test:ci)", () => {
    expect(parseRunnerArgs([])).toEqual({ kind: "all" });
  });

  it("runs one shard for a CI matrix job (npm run test:shard -- 3)", () => {
    expect(parseRunnerArgs(["--shard", "3"])).toEqual({ kind: "one", target: { shard: 3 } });
  });

  it("runs the changed tests for the hook (npm run test:changed)", () => {
    expect(parseRunnerArgs(["--changed"])).toEqual({ kind: "one", target: "changed" });
  });

  it("refuses a shard outside 1..SHARD_COUNT, so a stale CI matrix can't pass silently", () => {
    expect(() => parseRunnerArgs(["--shard", "5"])).toThrow(/1\.\.4/);
    expect(() => parseRunnerArgs(["--shard", "0"])).toThrow();
    expect(() => parseRunnerArgs(["--shard"])).toThrow();
    expect(() => parseRunnerArgs(["--shard", "two"])).toThrow();
  });

  it("refuses unknown arguments", () => {
    expect(() => parseRunnerArgs(["--watch"])).toThrow(/--watch/);
  });
});

const timeoutNoise =
  'Error: [vitest-worker]: Timeout calling "onTaskUpdate" with "[...]"\n' +
  " Test Files  62 passed (62)\n      Tests  786 passed (786)\n";
const shard3: VitestTarget = { shard: 3 };

describe("classifyRun", () => {
  it("passes a shard that exited 0", () => {
    expect(classifyRun(0, "Tests  786 passed (786)", shard3)).toBe("pass");
  });

  it("retries a non-zero shard whose only problem is the worker timeout", () => {
    expect(classifyRun(1, timeoutNoise, shard3)).toBe("retry");
  });

  it("sees through vitest's colour codes", () => {
    const coloured = timeoutNoise.replace("786 passed", "\u001b[32m786 passed\u001b[39m");
    expect(classifyRun(1, coloured, shard3)).toBe("retry");
  });

  it("fails a real test failure straight away, even with the timeout signature", () => {
    const out = timeoutNoise.replace(
      "Tests  786 passed (786)",
      "Tests  1 failed | 785 passed (786)",
    );
    expect(classifyRun(1, out, shard3)).toBe("fail");
  });

  it("fails a run whose summary shows failures even if it exited 0", () => {
    const out =
      " Test Files  1 failed | 61 passed (62)\n      Tests  \u001b[31m1 failed\u001b[39m | 785 passed (786)\n";
    expect(classifyRun(0, out, shard3)).toBe("fail");
  });

  it("fails a non-zero shard with no passing summary", () => {
    expect(classifyRun(1, 'Error: [vitest-worker]: Timeout calling "onTaskUpdate"', shard3)).toBe(
      "fail",
    );
  });

  it("fails a non-zero shard without the timeout signature", () => {
    expect(classifyRun(1, "Tests  786 passed (786)", shard3)).toBe("fail");
  });

  it("fails a shard that could not start", () => {
    expect(classifyRun(null, "", shard3)).toBe("fail");
  });

  const noTests =
    "No test files found, exiting with code 1\n\n" +
    "filter: changed\ninclude: src/**/*.{test,spec}.{ts,tsx}, scripts/**/*.test.ts\n";

  it("reports a --changed run that found no related tests (docs-only commit) as no-tests", () => {
    expect(classifyRun(1, noTests, "changed")).toBe("no-tests");
  });

  it("fails a shard that found no tests: the suite is never empty", () => {
    expect(classifyRun(1, noTests, shard3)).toBe("fail");
  });

  it("retries the worker timeout in a --changed run too", () => {
    expect(classifyRun(1, timeoutNoise, "changed")).toBe("retry");
  });
});

describe("runWithRetry", () => {
  const green: VitestResult = { status: 0, output: "Tests  786 passed (786)" };
  const noise: VitestResult = { status: 1, output: timeoutNoise };
  const red: VitestResult = { status: 1, output: "Tests  1 failed | 785 passed (786)" };

  // A fake vitest that hands back the given results in order and counts calls.
  function fakeVitest(...results: VitestResult[]) {
    const calls: VitestTarget[] = [];
    const run = async (target: VitestTarget) => {
      calls.push(target);
      const next = results[calls.length - 1];
      if (!next) throw new Error("ran vitest more often than expected");
      return next;
    };
    return { run, calls };
  }

  it("runs once when the first run passes", async () => {
    const vitest = fakeVitest(green);
    expect(await runWithRetry(shard3, vitest.run)).toBe("pass");
    expect(vitest.calls).toEqual([shard3]);
  });

  it("does not re-run a real failure", async () => {
    const vitest = fakeVitest(red);
    expect(await runWithRetry(shard3, vitest.run)).toBe("fail");
    expect(vitest.calls).toHaveLength(1);
  });

  it("re-runs the worker timeout once and lets the second run decide", async () => {
    expect(await runWithRetry(shard3, fakeVitest(noise, green).run)).toBe("pass");
    expect(await runWithRetry(shard3, fakeVitest(noise, red).run)).toBe("fail");
  });

  it("fails when the re-run hits the worker timeout again, without a third run", async () => {
    const vitest = fakeVitest(noise, noise);
    expect(await runWithRetry(shard3, vitest.run)).toBe("fail");
    expect(vitest.calls).toEqual([shard3, shard3]);
  });

  it("passes the hook's run through as no-tests when nothing relates to the changes", async () => {
    const none = { status: 1, output: "No test files found, exiting with code 1" };
    expect(await runWithRetry("changed", fakeVitest(none).run)).toBe("no-tests");
  });
});
