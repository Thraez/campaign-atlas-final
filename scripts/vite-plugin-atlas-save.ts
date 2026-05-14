/**
 * Vite dev-server plugin: POST /__atlas/save → write allowlisted source files
 * directly to disk in the local repository. GET /__atlas/read?path=... reads
 * the current on-disk contents of an allowlisted file so the editor can
 * merge frontmatter against the latest canon before writing back.
 *
 * apply: "serve" — physically excluded from production builds. No GitHub
 * API, no PAT, no auth. Vite's default localhost binding is the only access
 * control.
 *
 * The save endpoint optionally rebuilds the atlas (`rebuild: true`) by
 * spawning `tsx scripts/build-atlas.ts` after writes. A simple in-flight
 * mutex coalesces concurrent saves so two near-simultaneous rebuilds don't
 * race to clobber public/atlas/atlas.json.
 */
import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { isWritableSourcePath } from "../src/atlas/save/sourcePathAllowlist";

const MAX_FILE_BYTES = 1024 * 1024;
const BUILD_TIMEOUT_MS = 60_000;

export interface FileChange {
  path: string;
  contents: string;
}

export interface BuildResult {
  ok: boolean;
  durationMs: number;
  stderr?: string;
}

export type HandlerResult =
  | { status: 200; payload: { written: number; paths: string[]; build?: BuildResult } }
  | { status: 400 | 500; payload: { error: string; [k: string]: unknown } };

function isFileChange(v: unknown): v is FileChange {
  return (
    !!v && typeof v === "object" &&
    typeof (v as FileChange).path === "string" &&
    typeof (v as FileChange).contents === "string"
  );
}

export interface HandleSaveOpts {
  /** Optional async hook that runs after files are written. Used for rebuild. */
  afterWrite?: () => Promise<BuildResult>;
}

export async function handleSaveRequest(
  body: unknown,
  repoRoot: string,
  opts?: HandleSaveOpts,
): Promise<HandlerResult> {
  if (!body || typeof body !== "object" || !Array.isArray((body as { changes?: unknown }).changes)) {
    return { status: 400, payload: { error: "InvalidBody", detail: "expected { changes: FileChange[] }" } };
  }
  const changes = (body as { changes: unknown[] }).changes;
  if (changes.length === 0) {
    return { status: 400, payload: { error: "InvalidBody", detail: "changes array is empty" } };
  }
  for (const c of changes) {
    if (!isFileChange(c)) {
      return { status: 400, payload: { error: "InvalidBody", detail: "each change must be { path, contents }" } };
    }
  }
  const list = changes as FileChange[];

  // Validate everything BEFORE writing anything (atomicity).
  for (const c of list) {
    if (!isWritableSourcePath(c.path)) {
      return { status: 400, payload: { error: "DisallowedPath", path: c.path } };
    }
  }
  for (const c of list) {
    const bytes = Buffer.byteLength(c.contents, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      return { status: 400, payload: { error: "OversizedContent", path: c.path, bytes } };
    }
  }

  for (const c of list) {
    const abs = path.resolve(repoRoot, c.path);
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, c.contents, "utf8");
    } catch (e) {
      return {
        status: 500,
        payload: { error: "WriteFailed", path: c.path, detail: (e as Error).message },
      };
    }
  }

  let build: BuildResult | undefined;
  if (opts?.afterWrite) {
    try {
      build = await opts.afterWrite();
    } catch (e) {
      // Writes already succeeded; surface the build failure but don't fail the
      // save itself — the user has a saved file and a clear error to act on.
      build = { ok: false, durationMs: 0, stderr: (e as Error).message };
    }
  }

  return {
    status: 200,
    payload: {
      written: list.length,
      paths: list.map((c) => c.path),
      ...(build ? { build } : {}),
    },
  };
}

/** Run the atlas build script and return a structured result. */
function runAtlasBuild(repoRoot: string): Promise<BuildResult> {
  const started = Date.now();
  return new Promise<BuildResult>((resolve) => {
    const isWin = process.platform === "win32";
    const npx = isWin ? "npx.cmd" : "npx";
    const child = spawn(npx, ["tsx", "scripts/build-atlas.ts"], {
      cwd: repoRoot,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (b) => { stdout += String(b); });
    child.stderr?.on("data", (b) => { stderr += String(b); });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, BUILD_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      resolve({
        ok: code === 0,
        durationMs,
        // Surface a short tail of stderr/stdout so the UI can show a hint
        // without overwhelming. Truncate to avoid huge JSON responses.
        stderr: code === 0 ? undefined : (stderr || stdout).slice(-2000),
      });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, durationMs: Date.now() - started, stderr: e.message });
    });
  });
}

/** Allowlist-guarded reader for GET /__atlas/read?path=... */
async function readAllowlistedFile(repoRoot: string, relPath: string): Promise<
  | { ok: true; contents: string }
  | { ok: false; status: number; error: string }
> {
  if (!isWritableSourcePath(relPath)) {
    return { ok: false, status: 400, error: "DisallowedPath" };
  }
  const abs = path.resolve(repoRoot, relPath);
  try {
    const contents = await fs.readFile(abs, "utf8");
    return { ok: true, contents };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { ok: false, status: 404, error: "NotFound" };
    return { ok: false, status: 500, error: err.message };
  }
}

export function atlasSavePlugin(): Plugin {
  // Mutex: at most one rebuild in flight. A second save during an in-flight
  // build waits for it to settle before kicking off the next one — prevents
  // two builds writing public/atlas/atlas.json concurrently.
  let buildInFlight: Promise<BuildResult> | null = null;
  return {
    name: "atlas-save",
    apply: "serve",
    configureServer(server) {
      // GET /__atlas/read?path=content/...
      server.middlewares.use("/__atlas/read", (req, res, next) => {
        if (req.method !== "GET") return next();
        const url = new URL(req.url ?? "/", "http://localhost");
        const relPath = url.searchParams.get("path") ?? "";
        readAllowlistedFile(server.config.root, relPath).then((result) => {
          res.setHeader("Content-Type", "application/json");
          if (result.ok === true) {
            res.statusCode = 200;
            res.end(JSON.stringify({ path: relPath, contents: result.contents }));
          } else {
            res.statusCode = result.status;
            res.end(JSON.stringify({ error: result.error, path: relPath }));
          }
        });
      });

      // POST /__atlas/save  { changes, rebuild?: boolean }
      server.middlewares.use("/__atlas/save", (req, res, next) => {
        if (req.method !== "POST") return next();
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => { raw += chunk; });
        req.on("end", async () => {
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "InvalidBody", detail: "request body is not JSON" }));
            return;
          }
          const rebuild = !!(body as { rebuild?: boolean })?.rebuild;
          const result = await handleSaveRequest(body, server.config.root, {
            afterWrite: rebuild
              ? async () => {
                  // Coalesce: wait for any in-flight build to finish before
                  // starting a new one. This serialises concurrent saves.
                  if (buildInFlight) {
                    try { await buildInFlight; } catch { /* swallow — we run our own */ }
                  }
                  buildInFlight = runAtlasBuild(server.config.root);
                  try {
                    return await buildInFlight;
                  } finally {
                    buildInFlight = null;
                  }
                }
              : undefined,
          });
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.payload));
        });
      });
    },
  };
}
