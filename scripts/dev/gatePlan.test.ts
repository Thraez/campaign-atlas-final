import { describe, expect, it } from "vitest";
import {
  GATE_STEPS,
  failureMessage,
  logFileName,
  parseGateArgs,
  runGate,
  type GateStep,
} from "./gatePlan";

describe("GATE_STEPS", () => {
  it("runs the full local gate from docs/agents/workflow.md in order", () => {
    expect(GATE_STEPS.map((s) => s.name)).toEqual([
      "typecheck:all",
      "lint",
      "format:check",
      "test:ci",
      "atlas:publish",
      "atlas:check-secrets",
      "atlas:check-derived",
    ]);
  });

  it("scans dist with both secret checks", () => {
    const secrets = GATE_STEPS.find((s) => s.name === "atlas:check-secrets");
    const derived = GATE_STEPS.find((s) => s.name === "atlas:check-derived");
    expect(secrets?.npmArgs).toEqual(["run", "atlas:check-secrets", "--", "dist"]);
    expect(derived?.npmArgs).toEqual(["run", "atlas:check-derived", "--", "dist"]);
  });
});

describe("parseGateArgs", () => {
  it("runs every step by default", () => {
    expect(parseGateArgs([])).toEqual({ steps: GATE_STEPS, dryRun: false });
  });

  it("keeps the gate's order for --only, whatever order it was given in", () => {
    const plan = parseGateArgs(["--only", "lint,typecheck:all"]);
    expect(plan.steps.map((s) => s.name)).toEqual(["typecheck:all", "lint"]);
  });

  it("accepts --only=a,b and --dry-run", () => {
    const plan = parseGateArgs(["--dry-run", "--only=format:check"]);
    expect(plan).toEqual({ steps: [GATE_STEPS[2]], dryRun: true });
  });

  it("refuses an unknown step or argument", () => {
    expect(() => parseGateArgs(["--only", "lint,tests"])).toThrow(/unknown step "tests"/);
    expect(() => parseGateArgs(["--only"])).toThrow(/--only needs/);
    expect(() => parseGateArgs(["--fast"])).toThrow(/unknown argument/);
  });
});

describe("logFileName", () => {
  it("numbers the log by step and makes the name path-safe", () => {
    expect(logFileName(0, GATE_STEPS[0])).toBe("1-typecheck-all.log");
    expect(logFileName(5, GATE_STEPS[5])).toBe("6-atlas-check-secrets.log");
  });
});

const steps: GateStep[] = GATE_STEPS.slice(0, 4);

function fakeDeps(exitCodes: Record<string, number | null>, restoreThrows = false) {
  const calls: string[] = [];
  let clock = 0;
  return {
    calls,
    deps: {
      runStep: async (step: GateStep) => {
        calls.push(`run ${step.name}`);
        clock += 1000;
        return { status: exitCodes[step.name] ?? 0, signal: null };
      },
      restore: async () => {
        calls.push("restore");
        if (restoreThrows) throw new Error("git checkout failed");
      },
      now: () => clock,
    },
  };
}

describe("runGate", () => {
  it("runs every step in order, then restores, and passes", async () => {
    const { calls, deps } = fakeDeps({});
    const result = await runGate(steps, deps);
    expect(calls).toEqual([
      "run typecheck:all",
      "run lint",
      "run format:check",
      "run test:ci",
      "restore",
    ]);
    expect(result.ok).toBe(true);
    expect(result.failed).toBeUndefined();
    expect(result.results.map((r) => r.durationMs)).toEqual([1000, 1000, 1000, 1000]);
  });

  it("stops at the first failure, names it, and still restores", async () => {
    const { calls, deps } = fakeDeps({ lint: 2 });
    const result = await runGate(steps, deps);
    expect(calls).toEqual(["run typecheck:all", "run lint", "restore"]);
    expect(result.ok).toBe(false);
    expect(result.failed?.step.name).toBe("lint");
    expect(result.failed?.status).toBe(2);
    expect(failureMessage(result.failed!, 1, steps.length)).toBe(
      "gate FAILED at step 2/4 lint (exit 2)",
    );
  });

  it("treats a step killed by a signal (Ctrl-C) as a failure and restores", async () => {
    const calls: string[] = [];
    const result = await runGate(steps, {
      runStep: async (step) => {
        calls.push(step.name);
        return { status: null, signal: "SIGINT" };
      },
      restore: async () => {
        calls.push("restore");
      },
      now: () => 0,
    });
    expect(calls).toEqual(["typecheck:all", "restore"]);
    expect(failureMessage(result.failed!, 0, steps.length)).toBe(
      "gate FAILED at step 1/4 typecheck:all (killed by SIGINT)",
    );
  });

  it("restores even when a step throws", async () => {
    const calls: string[] = [];
    const run = runGate(steps, {
      runStep: async () => {
        throw new Error("spawn npm ENOENT");
      },
      restore: async () => {
        calls.push("restore");
      },
      now: () => 0,
    });
    await expect(run).rejects.toThrow("ENOENT");
    expect(calls).toEqual(["restore"]);
  });

  it("fails the gate when restoring fails, even after every step passed", async () => {
    const { deps } = fakeDeps({}, true);
    const result = await runGate(steps, deps);
    expect(result.ok).toBe(false);
    expect(result.failed).toBeUndefined();
    expect(String(result.restoreError)).toMatch(/git checkout failed/);
  });

  it("reports each finished step as it goes", async () => {
    const { deps } = fakeDeps({ "format:check": 1 });
    const seen: string[] = [];
    await runGate(steps, {
      ...deps,
      onStepDone: (r, i) => seen.push(`${i}:${r.step.name}:${r.status}`),
    });
    expect(seen).toEqual(["0:typecheck:all:0", "1:lint:0", "2:format:check:1"]);
  });
});
