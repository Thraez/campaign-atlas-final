// The full local gate a PR merges on (docs/agents/workflow.md, "Done"), as
// data plus a runner that takes its side effects as arguments so it can be
// tested without npm. scripts/dev/run-gate.ts (`npm run gate`) is the only
// caller; it spawns the steps, writes their logs and restores public/atlas/.
//
// test:ci already re-runs a shard once on worker-timeout noise
// (./shardOutcome.ts), so the gate never retries a step itself.

export type GateStep = {
  /** The npm script name; what `--only` matches. */
  name: string;
  /** Arguments after `npm`. */
  npmArgs: string[];
};

function npmStep(name: string, ...extra: string[]): GateStep {
  return { name, npmArgs: extra.length ? ["run", name, "--", ...extra] : ["run", name] };
}

export const GATE_STEPS: readonly GateStep[] = [
  npmStep("typecheck:all"),
  npmStep("lint"),
  npmStep("format:check"),
  npmStep("test:ci"),
  npmStep("atlas:publish"),
  npmStep("atlas:check-secrets", "dist"),
  npmStep("atlas:check-derived", "dist"),
];

export type GatePlan = { steps: GateStep[]; dryRun: boolean };

// Reads run-gate.ts's arguments: `--only a,b` (or `--only=a,b`) runs a subset,
// still in gate order; `--dry-run` prints the plan without running anything.
export function parseGateArgs(args: string[]): GatePlan {
  let only: string[] | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--only" || arg.startsWith("--only=")) {
      const value = arg === "--only" ? args[++i] : arg.slice("--only=".length);
      if (!value) throw new Error("--only needs a comma-separated list of step names");
      only = value.split(",").map((s) => s.trim());
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }
  if (!only) return { steps: [...GATE_STEPS], dryRun };
  const known = new Set(GATE_STEPS.map((s) => s.name));
  for (const name of only) {
    if (!known.has(name)) {
      throw new Error(
        `unknown step "${name}"; steps are ${GATE_STEPS.map((s) => s.name).join(", ")}`,
      );
    }
  }
  return { steps: GATE_STEPS.filter((s) => only.includes(s.name)), dryRun };
}

/** Log file for the step at `index` (0-based), e.g. "1-typecheck-all.log". */
export function logFileName(index: number, step: GateStep): string {
  return `${index + 1}-${step.name.replace(/[^a-zA-Z0-9]+/g, "-")}.log`;
}

export type StepExit = { status: number | null; signal: NodeJS.Signals | null };

export type StepResult = StepExit & { step: GateStep; durationMs: number };

export type GateResult = {
  ok: boolean;
  results: StepResult[];
  /** The step that stopped the gate, if any. */
  failed?: StepResult;
  /** Set when restoring public/atlas/ threw; the gate then fails. */
  restoreError?: unknown;
};

export type GateDeps = {
  runStep: (step: GateStep, index: number) => Promise<StepExit>;
  restore: () => Promise<void>;
  now: () => number;
  onStepStart?: (step: GateStep, index: number) => void;
  onStepDone?: (result: StepResult, index: number) => void;
};

// Runs the steps in order and stops at the first that doesn't exit 0.
// `restore` runs exactly once afterwards, whether the gate passed, failed, or
// a step threw (the throw is re-raised after restoring).
export async function runGate(steps: readonly GateStep[], deps: GateDeps): Promise<GateResult> {
  const results: StepResult[] = [];
  let failed: StepResult | undefined;
  let restoreError: unknown;
  try {
    for (const [index, step] of steps.entries()) {
      deps.onStepStart?.(step, index);
      const start = deps.now();
      const exit = await deps.runStep(step, index);
      const result: StepResult = { ...exit, step, durationMs: deps.now() - start };
      results.push(result);
      deps.onStepDone?.(result, index);
      if (exit.status !== 0) {
        failed = result;
        break;
      }
    }
  } finally {
    // A throw from runStep keeps propagating after this; a restore failure is
    // reported in the result instead.
    try {
      await deps.restore();
    } catch (err) {
      restoreError = err ?? new Error("restore failed");
    }
  }
  if (restoreError !== undefined) return { ok: false, results, failed, restoreError };
  return { ok: failed === undefined, results, failed };
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

function exitText(r: StepExit): string {
  return r.signal ? `killed by ${r.signal}` : `exit ${r.status}`;
}

export function stepSummary(r: StepResult, index: number, total: number): string {
  const verdict = r.status === 0 ? "ok" : `FAILED (${exitText(r)})`;
  return `[${index + 1}/${total}] ${r.step.name}: ${verdict} in ${formatDuration(r.durationMs)}`;
}

export function failureMessage(r: StepResult, index: number, total: number): string {
  return `gate FAILED at step ${index + 1}/${total} ${r.step.name} (${exitText(r)})`;
}
