import { describe, expect, it } from "vitest";
import { classifyShard, SHARD_COUNT, vitestArgs } from "./shardOutcome";

describe("vitestArgs", () => {
  it("runs shard N of the suite's four shards", () => {
    expect(SHARD_COUNT).toBe(4);
    expect(vitestArgs({ shard: 2 })).toEqual(["run", "--shard=2/4"]);
  });

  it("runs only the tests related to uncommitted changes for the pre-commit hook", () => {
    expect(vitestArgs("changed")).toEqual(["run", "--changed"]);
  });
});

const timeoutNoise =
  'Error: [vitest-worker]: Timeout calling "onTaskUpdate" with "[...]"\n' +
  " Test Files  62 passed (62)\n      Tests  786 passed (786)\n";

describe("classifyShard", () => {
  it("passes a shard that exited 0", () => {
    expect(classifyShard(0, "Tests  786 passed (786)")).toBe("pass");
  });

  it("retries a non-zero shard whose only problem is the worker timeout", () => {
    expect(classifyShard(1, timeoutNoise)).toBe("retry");
  });

  it("sees through vitest's colour codes", () => {
    const coloured = timeoutNoise.replace("786 passed", "\u001b[32m786 passed\u001b[39m");
    expect(classifyShard(1, coloured)).toBe("retry");
  });

  it("fails a real test failure straight away, even with the timeout signature", () => {
    const out = timeoutNoise.replace(
      "Tests  786 passed (786)",
      "Tests  1 failed | 785 passed (786)",
    );
    expect(classifyShard(1, out)).toBe("fail");
  });

  it("fails a run whose summary shows failures even if it exited 0", () => {
    const out =
      " Test Files  1 failed | 61 passed (62)\n      Tests  \u001b[31m1 failed\u001b[39m | 785 passed (786)\n";
    expect(classifyShard(0, out)).toBe("fail");
  });

  it("fails a non-zero shard with no passing summary", () => {
    expect(classifyShard(1, 'Error: [vitest-worker]: Timeout calling "onTaskUpdate"')).toBe("fail");
  });

  it("fails a non-zero shard without the timeout signature", () => {
    expect(classifyShard(1, "Tests  786 passed (786)")).toBe("fail");
  });

  it("fails a shard that could not start", () => {
    expect(classifyShard(null, "")).toBe("fail");
  });

  const noTests =
    "No test files found, exiting with code 1\n\n" +
    "filter: changed\ninclude: src/**/*.{test,spec}.{ts,tsx}, scripts/**/*.test.ts\n";

  it("passes a --changed run that found no related tests (docs-only commit)", () => {
    expect(classifyShard(1, noTests, "changed")).toBe("pass");
  });

  it("fails a shard that found no tests: the suite is never empty", () => {
    expect(classifyShard(1, noTests, { shard: 3 })).toBe("fail");
  });

  it("retries the worker timeout in a --changed run too", () => {
    expect(classifyShard(1, timeoutNoise, "changed")).toBe("retry");
  });
});
