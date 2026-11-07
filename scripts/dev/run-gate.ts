// `npm run gate`: the full local gate a PR merges on (docs/agents/workflow.md,
// "Done"). Steps and the stop-at-first-failure rule are in ./gatePlan.ts.
//
//   npm run gate                                  every step
//   npm run gate -- --only typecheck:all,lint     a subset, in gate order
//   npm run gate -- --dry-run                     print the plan only
//
// Each step's output goes to .gate-logs/<n>-<step>.log (gitignored, cleared at
// the start of each run); the console gets one line per step and, on failure,
// the end of the failing step's log. atlas:publish rebuilds public/atlas/, so
// afterwards (pass, fail, Ctrl-C, SIGTERM or SIGHUP) the gate puts it back: tracked files from
// git, files the build added removed, and the editor's ignored diff baseline
// (.last-published.json, rewritten by atlas:snapshot) restored byte for byte.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  failureMessage,
  formatDuration,
  gateExitCode,
  logFileName,
  parseGateArgs,
  runGate,
  STOP_SIGNALS,
  stepSummary,
  type GatePlan,
  type GateStep,
  type StepExit,
  type StopSignal,
} from "./gatePlan";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, ".gate-logs");
const ATLAS_DIR = "public/atlas";
const BASELINE = path.join(ROOT, ATLAS_DIR, ".last-published.json");
const TAIL_LINES = 40;

function git(...args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${r.status}): ${r.stderr.trim()}`);
  }
  return r.stdout;
}

let plan: GatePlan;
try {
  plan = parseGateArgs(process.argv.slice(2));
} catch (err) {
  console.error(`gate: ${(err as Error).message}`);
  process.exit(2);
}

if (plan.dryRun) {
  plan.steps.forEach((s, i) =>
    console.log(`[${i + 1}/${plan.steps.length}] npm ${s.npmArgs.join(" ")}`),
  );
  console.log(`then restore ${ATLAS_DIR}/; logs in ${path.relative(ROOT, LOG_DIR)}/`);
  process.exit(0);
}

// Restoring means discarding changes under public/atlas/, so refuse to start
// if there are any the gate didn't make.
const dirtyAtlas = git("status", "--porcelain", "--untracked-files=all", "--", ATLAS_DIR).trim();
if (dirtyAtlas) {
  console.error(
    `gate: ${ATLAS_DIR}/ has uncommitted changes, which the restore step would discard:\n` +
      `${dirtyAtlas}\nCommit or stash them, then rerun.`,
  );
  process.exit(2);
}

const statusBefore = git("status", "--porcelain");
const baselineBefore = fs.existsSync(BASELINE) ? fs.readFileSync(BASELINE) : null;

fs.mkdirSync(LOG_DIR, { recursive: true });
for (const f of fs.readdirSync(LOG_DIR)) {
  if (f.endsWith(".log")) fs.rmSync(path.join(LOG_DIR, f));
}

let child: ChildProcess | null = null;
let stoppedBy: StopSignal | null = null;
// Ctrl-C reaches the step's npm process directly (same process group); a tool
// timeout (SIGTERM) or a closed terminal (SIGHUP) may only reach the gate. Either
// way, stop the step and keep the gate alive long enough to restore public/atlas/.
for (const sig of STOP_SIGNALS) {
  process.on(sig, () => {
    stoppedBy ??= sig;
    child?.kill(sig);
  });
}

function runStep(step: GateStep, index: number): Promise<StepExit> {
  if (stoppedBy) return Promise.resolve({ status: null, signal: stoppedBy });
  const logFd = fs.openSync(path.join(LOG_DIR, logFileName(index, step)), "w");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exit: StepExit) => {
      if (settled) return;
      settled = true;
      child = null;
      fs.closeSync(logFd);
      resolve(exit);
    };
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    child = spawn(npm, step.npmArgs, {
      cwd: ROOT,
      stdio: ["ignore", logFd, logFd],
      shell: process.platform === "win32",
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    // A failed spawn may never emit "close".
    child.on("error", (err) => {
      fs.writeSync(logFd, `\ngate: could not start npm: ${String(err)}\n`);
      finish({ status: 127, signal: null });
    });
    child.on("close", (status, signal) => {
      finish({ status, signal: signal ?? stoppedBy });
    });
  });
}

async function restore(): Promise<void> {
  git("checkout", "--", ATLAS_DIR);
  git("clean", "-fdq", "--", ATLAS_DIR); // untracked only; ignored files stay
  if (baselineBefore) fs.writeFileSync(BASELINE, baselineBefore);
  else fs.rmSync(BASELINE, { force: true });
}

const total = plan.steps.length;
const started = Date.now();
const result = await runGate(plan.steps, {
  runStep,
  restore,
  now: () => Date.now(),
  distExists: () => fs.existsSync(path.join(ROOT, "dist")),
  onStepStart: (step, i) =>
    console.log(
      `[${i + 1}/${total}] ${step.name} ... (log: ${path.relative(ROOT, LOG_DIR)}/${logFileName(i, step)})`,
    ),
  onStepDone: (r, i) => console.log(stepSummary(r, i, total)),
});

if (result.failed) {
  const i = result.results.length - 1;
  const logPath = path.join(LOG_DIR, logFileName(i, result.failed.step));
  // No log when the step never ran (stopped between steps, or dist/ missing).
  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, "utf8").trimEnd().split("\n");
    console.error(
      `\n--- last ${Math.min(TAIL_LINES, lines.length)} lines of ${path.relative(ROOT, logPath)} ---`,
    );
    console.error(lines.slice(-TAIL_LINES).join("\n"));
  }
  console.error(`\n${failureMessage(result.failed, i, total)}`);
}

if (result.restoreError !== undefined) {
  console.error(`\ngate: restoring ${ATLAS_DIR}/ FAILED: ${String(result.restoreError)}`);
} else {
  console.log(`${ATLAS_DIR}/ restored.`);
  const statusAfter = git("status", "--porcelain");
  if (statusAfter !== statusBefore) {
    console.warn(
      `gate: warning: git status differs from before the gate ran:\n--- before\n${statusBefore}--- after\n${statusAfter}`,
    );
  }
}

if (result.ok)
  console.log(`\ngate passed: ${total} step(s) in ${formatDuration(Date.now() - started)}`);
process.exit(gateExitCode(result.ok, stoppedBy));
