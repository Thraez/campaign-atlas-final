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
 * Payload contract (Phase 1A unified Save):
 *   POST /__atlas/save  application/json
 *     {
 *       files: [
 *         { path, content, kind: "entity-md" | "world-yaml", baseHash: "sha256:<hex>" | null }
 *       ],
 *       rebuild?: boolean
 *     }
 *
 * For A4 this plugin parses but does not yet enforce baseHash; conflict
 * checking, backups, parse-back validation, and 207-status partial rebuilds
 * are layered in by subsequent sub-tasks (A5-A11).
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
import matter from "gray-matter";
import yaml from "js-yaml";
import { isWritableSourcePath } from "../src/atlas/save/sourcePathAllowlist";

const MAX_FILE_BYTES = 1024 * 1024;
const BUILD_TIMEOUT_MS = 60_000;
const BACKUP_DIR = ".atlas-backups";
const BACKUP_RETENTION = 3;

/**
 * Timestamp the way `.atlas-backups/<timestamp>/...` should look on disk:
 * sortable, filesystem-safe (no `:`), and unique enough for human review.
 * Example: `2026-05-15T04-30-12-345Z`.
 */
function backupTimestamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-");
}

/** Walk `.atlas-backups/` and return every existing backup of `relPath`. */
async function listBackupTimestamps(repoRoot: string, relPath: string): Promise<string[]> {
  const root = path.resolve(repoRoot, BACKUP_DIR);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.resolve(root, e.name, relPath);
    try {
      await fs.access(candidate);
      matches.push(e.name);
    } catch {
      /* not present in this timestamp's backup set */
    }
  }
  return matches.sort();
}

/**
 * Prune `.atlas-backups/<ts>/<relPath>` files older than the `BACKUP_RETENTION`-th
 * most recent. If a timestamp directory becomes empty after pruning, remove it.
 */
async function pruneBackups(repoRoot: string, relPath: string): Promise<void> {
  const timestamps = await listBackupTimestamps(repoRoot, relPath);
  if (timestamps.length <= BACKUP_RETENTION) return;
  const stale = timestamps.slice(0, timestamps.length - BACKUP_RETENTION);
  for (const ts of stale) {
    const target = path.resolve(repoRoot, BACKUP_DIR, ts, relPath);
    try {
      await fs.unlink(target);
    } catch {
      /* already gone */
    }
    // Best-effort: remove the timestamp directory if it's now empty.
    let dir = path.dirname(target);
    const stop = path.resolve(repoRoot, BACKUP_DIR, ts);
    while (true) {
      try {
        await fs.rmdir(dir);
      } catch {
        break;
      }
      if (dir === stop) break;
      dir = path.dirname(dir);
    }
  }
}

export type FileKind = "entity-md" | "world-yaml";

export interface FilePayload {
  path: string;
  content: string;
  kind: FileKind;
  baseHash: string | null;
}

export interface BuildResult {
  ok: boolean;
  durationMs: number;
  stderr?: string;
}

export interface SaveFileResult {
  path: string;
  hash: string;
}

export type ConflictReason = "stale-base" | "missing-base" | "already-exists";

export interface SaveSuccessPayload {
  saved: number;
  paths: string[];
  files: SaveFileResult[];
  /** Present when `rebuild: true` was requested AND the rebuild ran. */
  rebuilt?: boolean;
  /** ISO timestamp on the regenerated atlas.json; null when rebuild failed. */
  publishedAt?: string | null;
  /** Rebuild error tail when `rebuilt: false`. */
  rebuildError?: string;
  /**
   * Legacy build summary kept for backwards-compat with older clients. New
   * UI surfaces should prefer `rebuilt` + `publishedAt`.
   */
  build?: BuildResult;
}

export type HandlerResult =
  | { status: 200; payload: SaveSuccessPayload }
  | {
      status: 207;
      payload:
        | (SaveSuccessPayload & { rebuilt: false })
        | {
            error: "WriteFailed";
            partialWrite: true;
            saved: number;
            rolledBack: number;
            failedPath: string;
            writeError: string;
          };
    }
  | {
      status: 409;
      payload: {
        error: "Conflict";
        reason: ConflictReason;
        failedPath: string;
        currentHash?: string;
      };
    }
  | {
      status: 400 | 500;
      payload: { error: string; [k: string]: unknown };
    };

function isFileKind(v: unknown): v is FileKind {
  return v === "entity-md" || v === "world-yaml";
}

function isFilePayload(v: unknown): v is FilePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<FilePayload>;
  if (typeof o.path !== "string") return false;
  if (typeof o.content !== "string") return false;
  if (!isFileKind(o.kind)) return false;
  if (o.baseHash !== null && (typeof o.baseHash !== "string" || !o.baseHash.startsWith("sha256:"))) return false;
  return true;
}

export interface HandleSaveOpts {
  /** Optional async hook that runs after files are written. Used for rebuild. */
  afterWrite?: () => Promise<BuildResult>;
  /**
   * Optional hook returning the post-rebuild `publishedAt` timestamp.
   * Reads `public/atlas/atlas.json#publishedAt` in the default plugin
   * wiring; injectable so tests can avoid hitting the filesystem.
   */
  readPublishedAt?: () => Promise<string | null>;
  /** Override hash function for tests (defaults to node:crypto sha256). */
  hashFn?: (content: string) => string;
}

function defaultHash(content: string): string {
  // Lazy require so the module loads cleanly in non-Node test environments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
  return "sha256:" + nodeCrypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export async function handleSaveRequest(
  body: unknown,
  repoRoot: string,
  opts?: HandleSaveOpts,
): Promise<HandlerResult> {
  if (!body || typeof body !== "object" || !Array.isArray((body as { files?: unknown }).files)) {
    return { status: 400, payload: { error: "InvalidBody", detail: "expected { files: FilePayload[] }" } };
  }
  const rawFiles = (body as { files: unknown[] }).files;
  if (rawFiles.length === 0) {
    return { status: 400, payload: { error: "InvalidBody", detail: "files array is empty" } };
  }
  for (const f of rawFiles) {
    if (!isFilePayload(f)) {
      return {
        status: 400,
        payload: { error: "InvalidBody", detail: "each file must be { path, content, kind, baseHash }" },
      };
    }
  }
  const list = rawFiles as FilePayload[];

  // Validate everything BEFORE writing anything.

  // A6: duplicate-path detection. Two files in one payload writing to the
  // same path is almost certainly a bug (two staging rows resolving to the
  // same target, two unrelated mutations of the same entity, etc.). Reject
  // the batch up front so the editor can surface it.
  const seenPaths = new Map<string, number>();
  for (const f of list) {
    seenPaths.set(f.path, (seenPaths.get(f.path) ?? 0) + 1);
  }
  const duplicates = [...seenPaths.entries()].filter(([, n]) => n > 1).map(([p]) => p);
  if (duplicates.length > 0) {
    return {
      status: 400,
      payload: { error: "InvalidBody", reason: "duplicate-path", paths: duplicates },
    };
  }

  for (const f of list) {
    if (!isWritableSourcePath(f.path)) {
      return { status: 400, payload: { error: "DisallowedPath", path: f.path } };
    }
  }
  for (const f of list) {
    const bytes = Buffer.byteLength(f.content, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      return { status: 400, payload: { error: "OversizedContent", path: f.path, bytes } };
    }
  }

  // A6: parse-back validation. Per kind, ensure the content the editor is
  // about to commit is well-formed before any disk write. A malformed YAML
  // patch must not reach `world.yaml` — that would break the next build.
  for (const f of list) {
    if (f.kind === "entity-md") {
      try {
        matter(f.content);
      } catch (e) {
        return {
          status: 400,
          payload: {
            error: "InvalidContent",
            reason: "entity-md-parse-failed",
            failedPath: f.path,
            detail: (e as Error).message,
          },
        };
      }
    } else if (f.kind === "world-yaml") {
      try {
        yaml.load(f.content);
      } catch (e) {
        return {
          status: 400,
          payload: {
            error: "InvalidContent",
            reason: "world-yaml-parse-failed",
            failedPath: f.path,
            detail: (e as Error).message,
          },
        };
      }
    }
  }

  const hash = opts?.hashFn ?? defaultHash;

  // ---------- Conflict check (A5: baseHash semantics) ----------
  // Before any write, verify that every file's on-disk state matches what
  // the editor loaded. This is what stops the editor from silently stomping
  // a change made in Obsidian, git pull, or another editor session. The
  // baseHash contract is:
  //   - baseHash === null  => create-only; the target file must NOT exist.
  //   - baseHash === "sha256:..."  => update; the file must exist AND its
  //     current sha256 must match baseHash.
  //
  // Side benefit: we capture each file's pre-write content here so the
  // backup pass (A7) can write it to `.atlas-backups/<ts>/...` without a
  // second read.
  const preWrite: Array<{ payload: FilePayload; existing: string | null }> = [];
  for (const f of list) {
    const abs = path.resolve(repoRoot, f.path);
    let currentContent: string | null = null;
    try {
      currentContent = await fs.readFile(abs, "utf8");
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        return {
          status: 500,
          payload: { error: "ReadFailed", path: f.path, detail: err.message },
        };
      }
      // file is absent; currentContent stays null
    }

    const exists = currentContent !== null;
    if (f.baseHash === null) {
      if (exists) {
        return {
          status: 409,
          payload: {
            error: "Conflict",
            reason: "already-exists",
            failedPath: f.path,
            currentHash: hash(currentContent as string),
          },
        };
      }
    } else {
      if (!exists) {
        return {
          status: 409,
          payload: { error: "Conflict", reason: "missing-base", failedPath: f.path },
        };
      }
      const currentHash = hash(currentContent as string);
      if (currentHash !== f.baseHash) {
        return {
          status: 409,
          payload: {
            error: "Conflict",
            reason: "stale-base",
            failedPath: f.path,
            currentHash,
          },
        };
      }
    }
    preWrite.push({ payload: f, existing: currentContent });
  }

  // ---------- Backup pass (A7) ----------
  // One timestamp per batch — keeps a rollback set coherent. Only files
  // that already exist get backed up; net-new creates have nothing to save.
  // If a backup write fails, abort BEFORE touching any source file so we
  // never end up with new content on disk but no rollback target.
  const ts = backupTimestamp();
  for (const { payload: f, existing } of preWrite) {
    if (existing === null) continue;
    const backupAbs = path.resolve(repoRoot, BACKUP_DIR, ts, f.path);
    try {
      await fs.mkdir(path.dirname(backupAbs), { recursive: true });
      await fs.writeFile(backupAbs, existing, "utf8");
    } catch (e) {
      return {
        status: 500,
        payload: { error: "BackupFailed", path: f.path, detail: (e as Error).message },
      };
    }
  }

  // ---------- Writes (A9: temp-file + rename with best-effort rollback) ----------
  // Per file: write to <path>.tmp, then `fs.rename` over the target. POSIX
  // makes per-file rename atomic; Windows uses `MoveFileExW` with REPLACE_EXISTING.
  // If any file's write or rename fails after earlier files in the batch have
  // already succeeded, we attempt to roll those back from `.atlas-backups/<ts>/`
  // (or by deleting outright if the entry was a fresh create with no backup).
  // We surface a 207 with `partialWrite: true` and a rollback count — the UI
  // can tell the DM exactly how much state is out of sync.
  const written: SaveFileResult[] = [];
  for (let i = 0; i < preWrite.length; i++) {
    const entry = preWrite[i];
    const f = entry.payload;
    const abs = path.resolve(repoRoot, f.path);
    const tmpAbs = abs + ".tmp";
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(tmpAbs, f.content, "utf8");
      await fs.rename(tmpAbs, abs);
      written.push({ path: f.path, hash: hash(f.content) });
    } catch (e) {
      // Try to clean the orphan tmp file, then roll back every previously
      // succeeded write in this batch.
      try {
        await fs.unlink(tmpAbs);
      } catch {
        /* tmp may not exist if writeFile failed before rename — fine */
      }
      let rolledBack = 0;
      for (let j = 0; j < i; j++) {
        const prior = preWrite[j];
        const priorAbs = path.resolve(repoRoot, prior.payload.path);
        try {
          if (prior.existing !== null) {
            // Existing file → restore its backed-up content.
            await fs.writeFile(priorAbs, prior.existing, "utf8");
          } else {
            // Net-new file → delete it.
            await fs.unlink(priorAbs);
          }
          rolledBack++;
        } catch {
          /* best-effort; backup tree still preserves the prior content */
        }
      }
      return {
        status: 207,
        payload: {
          error: "WriteFailed",
          partialWrite: true,
          saved: 0,
          rolledBack,
          failedPath: f.path,
          writeError: (e as Error).message,
        },
      };
    }
  }

  // ---------- Retention (A7) ----------
  // After writes succeed, prune so each backed-up path keeps only the most
  // recent BACKUP_RETENTION timestamps. Best-effort; failure here doesn't
  // fail the save.
  for (const { payload: f, existing } of preWrite) {
    if (existing === null) continue;
    try {
      await pruneBackups(repoRoot, f.path);
    } catch {
      /* don't surface — backups are not the user's primary concern at this point */
    }
  }

  // ---------- Rebuild (A10) ----------
  //
  // Phase 1A note: this still spawns `tsx scripts/build-atlas.ts` via a child
  // process. The Phase 1A plan called for a programmatic `runBuild()` import
  // here, but that requires a substantial refactor of the 882-line
  // build-atlas.ts (it currently calls `process.exit` from a dozen
  // validation branches and reads `process.argv`). The behavioural contract
  // the spec actually depends on — distinguishing "writes saved + rebuild
  // failed" from "everything fine" via HTTP status — is implemented below
  // regardless of whether the rebuild is in-process or out-of-process.
  // The in-process refactor is tracked for Phase 2.
  let build: BuildResult | undefined;
  if (opts?.afterWrite) {
    try {
      build = await opts.afterWrite();
    } catch (e) {
      build = { ok: false, durationMs: 0, stderr: (e as Error).message };
    }
  }

  if (build) {
    if (!build.ok) {
      // 207 Multi-Status: files are on disk and `.atlas-backups/` holds the
      // prior versions, but `atlas.json` was NOT regenerated. UI surfaces
      // this as "Saved files, but atlas rebuild failed."
      return {
        status: 207,
        payload: {
          saved: list.length,
          paths: list.map((f) => f.path),
          files: written,
          rebuilt: false,
          publishedAt: null,
          rebuildError: build.stderr,
          build,
        },
      };
    }
    const publishedAt = opts?.readPublishedAt ? await opts.readPublishedAt().catch(() => null) : null;
    return {
      status: 200,
      payload: {
        saved: list.length,
        paths: list.map((f) => f.path),
        files: written,
        rebuilt: true,
        publishedAt,
        build,
      },
    };
  }

  // No rebuild requested.
  return {
    status: 200,
    payload: {
      saved: list.length,
      paths: list.map((f) => f.path),
      files: written,
    },
  };
}

/**
 * Read `public/atlas/atlas.json#publishedAt` from disk. Returns null if the
 * file doesn't exist, can't be parsed, or doesn't include a `publishedAt`
 * field. Used as the default `readPublishedAt` hook in the Vite plugin so
 * the editor can stamp "atlas rebuilt at HH:MM:SS" on the Save toast.
 */
async function readAtlasPublishedAt(repoRoot: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.resolve(repoRoot, "public/atlas/atlas.json"), "utf8");
    const parsed = JSON.parse(raw) as { publishedAt?: unknown };
    if (typeof parsed.publishedAt === "string") return parsed.publishedAt;
    return null;
  } catch {
    return null;
  }
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
  // A11: a save is in flight or it isn't. Rather than coalescing concurrent
  // saves (the previous behaviour), reject overlapping requests with 423
  // Locked so the UI can lock its Save button + chip and the next click
  // either waits or surfaces a clear "already saving" toast. Two builds
  // racing to write public/atlas/atlas.json was previously prevented by
  // the coalesce; we still need that guarantee here.
  let saveInFlight = false;
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

      // POST /__atlas/save  { files, rebuild?: boolean }
      server.middlewares.use("/__atlas/save", (req, res, next) => {
        if (req.method !== "POST") return next();
        // A11: reject concurrent saves with 423 Locked.
        if (saveInFlight) {
          res.statusCode = 423;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Locked", detail: "another save is in flight" }));
          return;
        }
        saveInFlight = true;
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => { raw += chunk; });
        req.on("end", async () => {
          try {
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
                ? async () => runAtlasBuild(server.config.root)
                : undefined,
              readPublishedAt: rebuild ? () => readAtlasPublishedAt(server.config.root) : undefined,
            });
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result.payload));
          } finally {
            saveInFlight = false;
          }
        });
        req.on("error", () => {
          saveInFlight = false;
        });
      });
    },
  };
}
