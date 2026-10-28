/**
 * Runs `scripts/build-atlas.ts` in-process with CLI-style arguments, the way
 * `tsx scripts/build-atlas.ts <args>` would from `cwd`, and hands back what
 * the spawned CLI used to: exit status and console output (code-retro 08).
 * Only `src/test/build-atlas-cli.test.ts` still spawns the real CLI.
 *
 * Callers should mark their file `// @vitest-environment node`.
 */
import { vi } from "vitest";
import { parseFlags, runBuild } from "../../../scripts/build-atlas";

export interface InProcessRun {
  status: number;
  stdout: string;
  stderr: string;
}

export async function runBuildCli(args: string[], cwd: string): Promise<InProcessRun> {
  const out: string[] = [];
  const err: string[] = [];
  const fmt = (a: unknown[]) => a.map((x) => (typeof x === "string" ? x : String(x))).join(" ");
  const log = vi.spyOn(console, "log").mockImplementation((...a) => void out.push(fmt(a)));
  const warn = vi.spyOn(console, "warn").mockImplementation((...a) => void err.push(fmt(a)));
  const error = vi.spyOn(console, "error").mockImplementation((...a) => void err.push(fmt(a)));
  try {
    const result = await runBuild(parseFlags(args), cwd);
    if (!result.ok && result.error && !err.some((l) => l.includes(result.error!))) {
      err.push(result.error);
    }
    return { status: result.exitCode, stdout: out.join("\n") + "\n", stderr: err.join("\n") };
  } finally {
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  }
}
