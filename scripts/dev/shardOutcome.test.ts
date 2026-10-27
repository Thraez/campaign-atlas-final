import { describe, expect, it } from "vitest";
import { classifyShard } from "./shardOutcome";

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

  it("fails a non-zero shard with no passing summary", () => {
    expect(classifyShard(1, 'Error: [vitest-worker]: Timeout calling "onTaskUpdate"')).toBe("fail");
  });

  it("fails a non-zero shard without the timeout signature", () => {
    expect(classifyShard(1, "Tests  786 passed (786)")).toBe("fail");
  });

  it("fails a shard that could not start", () => {
    expect(classifyShard(null, "")).toBe("fail");
  });
});
