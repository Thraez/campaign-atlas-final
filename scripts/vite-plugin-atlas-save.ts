/**
 * Vite dev-server plugin: POST /__atlas/save → write allowlisted source files
 * directly to disk in the local repository. GET /__atlas/read?path=... reads
 * the current on-disk contents of an allowlisted file so the editor can
 * merge frontmatter against the latest canon before writing back.
 *
 * apply: "serve" — physically excluded from production builds. No GitHub
 * API, no PAT, no auth.
 *
 * Access control: every `/__atlas/*` middleware (and the `.local-atlas`
 * overlay that serves the DM build) is gated by `isAllowedDevRequest`,
 * which requires:
 *   - the `Host` header to resolve to a loopback name (localhost,
 *     127.0.0.1, or [::1]), AND
 *   - for write methods (POST/DELETE/PUT/PATCH), the `Origin` header to
 *     also resolve to a loopback origin, AND
 *   - for the same write methods, the `Origin` header to be present at
 *     all (a missing Origin on a write = curl / non-browser context, and
 *     the editor never sends one).
 *
 * This is defense-in-depth for the case where the dev server is bound to
 * a non-loopback interface (`server.host` widened beyond default). It
 * does NOT replace careful binding: if you can't reach the port from the
 * network, an attacker on that network can't either, and that is the
 * primary control. The Vite default for this project is loopback.
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
 * invoking the in-process `runBuild()` exported from `scripts/build-atlas.ts`
 * (A10). A simple in-flight mutex coalesces concurrent saves so two
 * near-simultaneous rebuilds don't race to clobber public/atlas/atlas.json.
 */
import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import matter from "gray-matter";
import yaml from "js-yaml";
import sharp from "sharp";
import {
  isWritableAssetPath,
  isWritableSourcePath,
  isReadableVaultPath,
  isReadableLocalAtlasPath,
} from "../src/atlas/save/sourcePathAllowlist";
import { makeIgnore } from "../src/atlas/import/ignoreRules";
import { runBuild, type BuildResult as InProcessBuildResult } from "./build-atlas";
import { tryAcquireBuildLock, releaseBuildLock } from "./atlas/buildLock";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_VAULT_AGGREGATE_BYTES = 25 * 1024 * 1024;
// Asset uploads arrive as base64 data URLs; this cap covers ~5.5 MB of binary
// after the base64 inflation (matches the build's per-asset audit cap).
const MAX_ASSET_DATAURL_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BINARY_BYTES = 6 * 1024 * 1024;
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

/**
 * Returns true if `host` (the value of an HTTP `Host` header) names a
 * loopback address. Accepts an optional `:port` suffix and bracketed
 * IPv6 forms. Case-insensitive on hostname.
 *
 *   isLoopbackHostHeader("localhost:8080") === true
 *   isLoopbackHostHeader("127.0.0.1")      === true
 *   isLoopbackHostHeader("[::1]:8080")     === true
 *   isLoopbackHostHeader("192.168.1.1")    === false
 */
export function isLoopbackHostHeader(host: string | undefined): boolean {
  if (!host) return false;
  // Split off the port. IPv6 hosts are bracketed, so split on the LAST
  // colon outside brackets.
  const lower = host.toLowerCase();
  let hostname: string;
  if (lower.startsWith("[")) {
    const close = lower.indexOf("]");
    if (close < 0) return false;
    hostname = lower.slice(0, close + 1);
  } else {
    const colon = lower.indexOf(":");
    hostname = colon >= 0 ? lower.slice(0, colon) : lower;
  }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Returns true if `origin` (the value of an HTTP `Origin` header) is an
 * http(s) URL whose hostname is loopback. Anything non-parseable, any
 * non-http scheme, or any non-loopback host returns false.
 */
export function isLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  // Node's URL keeps the brackets on IPv6 hostnames ("[::1]"); some
  // implementations strip them ("::1"). Accept both forms.
  const h = u.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

export interface DevRequestHeaders {
  host?: string;
  origin?: string;
  method?: string;
}

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Access policy for every `/__atlas/*` endpoint and the `.local-atlas`
 * overlay. See the file-header comment for the full rationale.
 *
 *   - Host must always be loopback.
 *   - For write methods, Origin must be present AND loopback.
 *   - For GET/HEAD, missing Origin is acceptable (address-bar navigation,
 *     same-origin <img>/<script>); if Origin is present it must be loopback.
 */
export function isAllowedDevRequest(headers: DevRequestHeaders): boolean {
  if (!isLoopbackHostHeader(headers.host)) return false;
  const method = (headers.method ?? "GET").toUpperCase();
  if (WRITE_METHODS.has(method)) {
    // Browser fetch/XHR always sends Origin on writes. Missing Origin =
    // non-browser caller (curl, scripted request) = reject.
    if (headers.origin === undefined || headers.origin === "") return false;
    return isLoopbackOrigin(headers.origin);
  }
  // Safe methods: if Origin is supplied, it must still be loopback (defends
  // against cross-origin fetch where the browser DOES send Origin).
  if (headers.origin !== undefined && headers.origin !== "") {
    return isLoopbackOrigin(headers.origin);
  }
  return true;
}

export type FileKind = "entity-md" | "world-yaml" | "asset-binary";

export interface FilePayload {
  path: string;
  /** UTF-8 text body for text kinds; a `data:<mime>;base64,…` URL for asset-binary. */
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
  return v === "entity-md" || v === "world-yaml" || v === "asset-binary";
}

const DATA_URL_RE = /^data:[^;,]+;base64,([^]*)$/;

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
  return "sha256:" + createHash("sha256").update(content, "utf8").digest("hex");
}

function hashBytes(buf: Buffer): string {
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
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

  // Path allowlist — dispatch per kind. asset-binary lands under
  // public/atlas/assets/maps/<file>.<image-ext>; text kinds under content/.
  for (const f of list) {
    const allowed = f.kind === "asset-binary"
      ? isWritableAssetPath(f.path)
      : isWritableSourcePath(f.path);
    if (!allowed) {
      return { status: 400, payload: { error: "DisallowedPath", path: f.path } };
    }
  }

  // Size caps — asset-binary uses a larger cap to accommodate base64 inflation.
  for (const f of list) {
    const bytes = Buffer.byteLength(f.content, "utf8");
    const cap = f.kind === "asset-binary" ? MAX_ASSET_DATAURL_BYTES : MAX_FILE_BYTES;
    if (bytes > cap) {
      return { status: 400, payload: { error: "OversizedContent", path: f.path, bytes } };
    }
  }

  // A6 / asset-decode: parse-back validation. For text kinds, the content
  // must parse cleanly as its declared kind so the next build won't choke.
  // For asset-binary, decode the data URL up front — a malformed dataUrl
  // fails fast before any disk activity, and the decoded bytes are reused
  // below as the write payload.
  const decoded = new Map<string, Buffer>();
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
    } else if (f.kind === "asset-binary") {
      const m = DATA_URL_RE.exec(f.content);
      if (!m) {
        return {
          status: 400,
          payload: {
            error: "InvalidContent",
            reason: "asset-decode-failed",
            failedPath: f.path,
            detail: "content is not a base64 data URL",
          },
        };
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(m[1], "base64");
      } catch (e) {
        return {
          status: 400,
          payload: {
            error: "InvalidContent",
            reason: "asset-decode-failed",
            failedPath: f.path,
            detail: (e as Error).message,
          },
        };
      }
      if (buf.length > MAX_ASSET_BINARY_BYTES) {
        return {
          status: 400,
          payload: { error: "OversizedContent", path: f.path, bytes: buf.length },
        };
      }
      // Strip all EXIF/IPTC/XMP/ICC metadata via sharp re-encode.
      // No withMetadata() call → sharp drops all metadata by default.
      // { animated: true } preserves GIF/WebP animation frames.
      let stripped: Buffer;
      try {
        const mime = f.content.slice(5, f.content.indexOf(";base64,"));
        const s = sharp(buf, { animated: true });
        if (mime === "image/png") stripped = await s.png().toBuffer();
        else if (mime === "image/jpeg" || mime === "image/jpg") stripped = await s.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        else if (mime === "image/webp") stripped = await s.webp({ quality: 85 }).toBuffer();
        else if (mime === "image/gif") stripped = await s.gif().toBuffer();
        else stripped = await s.toBuffer();
      } catch (e) {
        return {
          status: 400,
          payload: {
            error: "InvalidContent",
            reason: "image-decode-failed",
            failedPath: f.path,
            detail: (e as Error).message,
          },
        };
      }
      if (stripped.length > MAX_ASSET_BINARY_BYTES) {
        return {
          status: 400,
          payload: { error: "OversizedContent", path: f.path, bytes: stripped.length },
        };
      }
      decoded.set(f.path, stripped);
    }
  }

  const hash = opts?.hashFn ?? defaultHash;
  // Hash dispatch: text kinds use the (injectable) text hash to keep the
  // existing test surface stable; asset-binary always uses the byte-level
  // sha256 since dataUrl wrappers shouldn't affect identity.
  const hashOf = (kind: FileKind, bytes: Buffer): string => {
    if (kind === "asset-binary") return hashBytes(bytes);
    return hash(bytes.toString("utf8"));
  };

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
  const preWrite: Array<{ payload: FilePayload; existing: Buffer | null; bytesToWrite: Buffer; skip?: boolean }> = [];
  for (const f of list) {
    const abs = path.resolve(repoRoot, f.path);
    let existingBytes: Buffer | null = null;
    try {
      existingBytes = await fs.readFile(abs);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        return {
          status: 500,
          payload: { error: "ReadFailed", path: f.path, detail: err.message },
        };
      }
      // file is absent; existingBytes stays null
    }

    const bytesToWrite = decoded.get(f.path) ?? Buffer.from(f.content, "utf8");

    const exists = existingBytes !== null;
    let skip = false;
    if (f.baseHash === null) {
      if (exists) {
        // For asset-binary, a "create-only" write that finds an existing file
        // with byte-identical content is treated as a no-op success rather
        // than a conflict. Uploads are restored from localStorage on every
        // editor reload (so the preview survives a refresh), so without this
        // every Save after the first one would 409 on its own assets and
        // roll back the entire atomic batch — taking world.yaml + entity-md
        // changes down with it. Text kinds keep the strict create-only
        // contract: an existing entity-md or world-yaml with no baseHash
        // really is a stale draft and the editor should reconcile.
        const currentHash = hashOf(f.kind, existingBytes as Buffer);
        if (f.kind === "asset-binary" && hashOf(f.kind, bytesToWrite) === currentHash) {
          skip = true;
        } else {
          return {
            status: 409,
            payload: {
              error: "Conflict",
              reason: "already-exists",
              failedPath: f.path,
              currentHash,
            },
          };
        }
      }
    } else {
      if (!exists) {
        return {
          status: 409,
          payload: { error: "Conflict", reason: "missing-base", failedPath: f.path },
        };
      }
      const currentHash = hashOf(f.kind, existingBytes as Buffer);
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
    preWrite.push({ payload: f, existing: existingBytes, bytesToWrite, skip });
  }

  // ---------- Backup pass (A7) ----------
  // One timestamp per batch — keeps a rollback set coherent. Only files
  // that already exist get backed up; net-new creates have nothing to save.
  // If a backup write fails, abort BEFORE touching any source file so we
  // never end up with new content on disk but no rollback target. Backups
  // are written as raw bytes so binary assets round-trip cleanly.
  const ts = backupTimestamp();
  for (const { payload: f, existing, skip } of preWrite) {
    if (existing === null || skip) continue;
    const backupAbs = path.resolve(repoRoot, BACKUP_DIR, ts, f.path);
    try {
      await fs.mkdir(path.dirname(backupAbs), { recursive: true });
      await fs.writeFile(backupAbs, existing);
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
    if (entry.skip) {
      // Asset bytes already on disk — record the hash for the response so the
      // client sees the path as "saved" but no disk activity occurred.
      written.push({ path: f.path, hash: hashOf(f.kind, entry.bytesToWrite) });
      continue;
    }
    const abs = path.resolve(repoRoot, f.path);
    const tmpAbs = abs + ".tmp";
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(tmpAbs, entry.bytesToWrite);
      await fs.rename(tmpAbs, abs);
      written.push({ path: f.path, hash: hashOf(f.kind, entry.bytesToWrite) });
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
        // Skipped entries never touched disk — nothing to roll back.
        if (prior.skip) continue;
        const priorAbs = path.resolve(repoRoot, prior.payload.path);
        try {
          if (prior.existing !== null) {
            // Existing file → restore its backed-up bytes (binary-safe).
            await fs.writeFile(priorAbs, prior.existing);
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
  for (const { payload: f, existing, skip } of preWrite) {
    if (existing === null || skip) continue;
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

/**
 * A10: programmatic atlas rebuild via the in-process `runBuild()` export.
 *
 * Replaces the previous `spawn("npx tsx scripts/build-atlas.ts")` path so
 * a save no longer pays process-spawn + tsx-startup cost on every write
 * (~600ms steady-state, 2-3s on cold cache). The trade-off is that
 * `runBuild()` runs inside the Vite dev server's process — it must not
 * call `process.exit`. The CLI shim still does, but `runBuild()` itself
 * throws `BuildError` instead, which we translate into the same BuildResult
 * shape the endpoint already returns.
 *
 * `repoRoot` is currently informational only — `build-atlas.ts` resolves
 * paths against `process.cwd()`. The Vite dev server's cwd is the repo
 * root, so this is fine in practice; if that ever changes, the build
 * script will need a cwd override.
 */
async function runAtlasBuild(repoRoot: string): Promise<BuildResult> {
  // Currently informational — see comment above.
  void repoRoot;
  const timeoutMs = BUILD_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BuildResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, durationMs: timeoutMs, stderr: `atlas build timed out after ${timeoutMs}ms` });
    }, timeoutMs);
  });
  try {
    // Default flags = dev rebuild (non-player, non-strict). Same as a bare
    // `npm run atlas:build` invocation, which is what the spawn version did.
    const result: BuildResult | InProcessBuildResult = await Promise.race([runBuild(), timeout]);
    if (timer) clearTimeout(timer);
    if (result.ok) {
      return { ok: true, durationMs: result.durationMs };
    }
    // Truncate just like the spawn path did so a huge build log doesn't
    // blow up the JSON response body. The two shapes have different error
    // field names — `error` for runBuild, `stderr` for the local timeout.
    const errStr = "error" in result && result.error
      ? result.error
      : "stderr" in result ? result.stderr ?? "" : "";
    return {
      ok: false,
      durationMs: result.durationMs,
      stderr: errStr ? errStr.slice(-2000) : undefined,
    };
  } catch (e) {
    if (timer) clearTimeout(timer);
    // runBuild() catches BuildError internally, so reaching here is unusual
    // — surface it as a generic failure rather than letting the endpoint
    // 500 with an unhandled rejection.
    return {
      ok: false,
      durationMs: 0,
      stderr: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Player atlas build (player+strict → public/atlas/atlas.json) with the same
 * timeout race as the DM rebuild. Used by publish-check. Returns a simplified
 * result compatible with the endpoint's build-failed path.
 */
export async function runPlayerBuildWithTimeout(): Promise<{ ok: boolean; error?: string }> {
  const timeoutMs = BUILD_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BuildResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, durationMs: timeoutMs, stderr: `player build timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );
  });
  try {
    const result: BuildResult | import("./build-atlas").BuildResult = await Promise.race([
      runBuild({ player: true, strict: true }),
      timeout,
    ]);
    if (timer) clearTimeout(timer);
    if (result.ok) return { ok: true };
    const errStr =
      "error" in result && result.error
        ? result.error
        : "stderr" in result
          ? (result.stderr ?? "")
          : "";
    return { ok: false, error: errStr ? errStr.slice(-2000) : "player build failed" };
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lists image files in `public/atlas/assets/images/`.
 * Returns filenames only (not full paths), sorted alphabetically.
 * Returns an empty array if the directory doesn't exist yet.
 * Dev-server only (apply: "serve") — never reaches the player build.
 *
 * Security note: images in this directory are public static assets.
 * There is no per-image DM/player visibility distinction, and none is
 * added here. Do not add a secret-image scan for this path.
 */
export async function handleAssetsImagesRequest(repoRoot: string): Promise<
  | { status: 200; images: string[] }
  | { status: 500; error: string }
> {
  const dir = path.resolve(repoRoot, "public", "atlas", "assets", "images");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const images = entries
      .filter((e) => e.isFile() && /\.(png|jpg|jpeg|webp|gif)$/.test(e.name))
      .map((e) => e.name)
      .sort();
    return { status: 200, images };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { status: 200, images: [] };
    return { status: 500, error: err.message };
  }
}

/**
 * Deletes a single image file from `public/atlas/assets/images/`.
 * `name` must be a bare filename (no path separators). Validated against the
 * existing asset allowlist before deletion.
 * Dev-server only — never reaches the player build.
 */
export async function handleDeleteImageRequest(
  repoRoot: string,
  name: string,
): Promise<{ status: 200; deleted: string } | { status: 400; error: string } | { status: 404; error: string } | { status: 500; error: string }> {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return { status: 400, error: "Invalid image name" };
  }
  const relPath = `public/atlas/assets/images/${name}`;
  if (!isWritableAssetPath(relPath)) {
    return { status: 400, error: "Path not allowed" };
  }
  const fullPath = path.resolve(repoRoot, relPath);
  let existing: Buffer;
  try {
    existing = await fs.readFile(fullPath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { status: 404, error: "Not found" };
    return { status: 500, error: err.message };
  }
  const ts = backupTimestamp();
  const backupAbs = path.resolve(repoRoot, BACKUP_DIR, ts, relPath);
  try {
    await fs.mkdir(path.dirname(backupAbs), { recursive: true });
    await fs.writeFile(backupAbs, existing);
  } catch (e) {
    return { status: 500, error: (e as Error).message };
  }
  try {
    await fs.unlink(fullPath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { status: 404, error: "Not found" };
    return { status: 500, error: err.message };
  }
  try { await pruneBackups(repoRoot, relPath); } catch { /* non-fatal */ }
  return { status: 200, deleted: name };
}

/**
 * Pure handler for GET /__atlas/vault-scan.
 * Recursively walks vaultRoot, returning all .md files (vault-relative POSIX
 * paths → UTF-8 contents). Files outside the root (via symlink) are skipped.
 * Returns 413-style error if the aggregate size of valid files exceeds 25 MB.
 * No write operations are performed — read-only.
 */
export async function handleVaultScanRequest(
  vaultRoot: string,
  ignoreGlobs: string[],
): Promise<
  | { ok: true; files: Record<string, string> }
  | { ok: false; status: number; error: string }
> {
  try {
    const s = await fs.stat(vaultRoot);
    if (!s.isDirectory()) return { ok: false, status: 400, error: "VaultNotDirectory" };
  } catch {
    return { ok: false, status: 400, error: "VaultNotFound" };
  }

  const isIgnored = makeIgnore(ignoreGlobs);
  const rootResolved = path.resolve(vaultRoot);
  const files: Record<string, string> = {};
  let aggregateBytes = 0;

  async function processFile(absPath: string): Promise<{ ok: false; status: number; error: string } | null> {
    const relPosix = path.relative(rootResolved, absPath).split(path.sep).join("/");
    if (!isReadableVaultPath(rootResolved, absPath)) return null;
    if (isIgnored(relPosix)) return null;
    let size: number;
    try {
      size = (await fs.stat(absPath)).size;
    } catch {
      return null;
    }
    if (size > MAX_FILE_BYTES) return null; // skip individual oversized files silently
    aggregateBytes += size;
    if (aggregateBytes > MAX_VAULT_AGGREGATE_BYTES) {
      return { ok: false, status: 413, error: "VaultTooLarge" };
    }
    try {
      files[relPosix] = await fs.readFile(absPath, "utf8");
    } catch {
      // unreadable file — skip silently
    }
    return null;
  }

  async function walk(dir: string): Promise<{ ok: false; status: number; error: string } | null> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        let real: string;
        try { real = await fs.realpath(abs); } catch { continue; }
        // Symlink escape guard: resolved path must still be within vault root
        if (!real.startsWith(rootResolved + path.sep)) continue;
        let realStat: Awaited<ReturnType<typeof fs.stat>>;
        try { realStat = await fs.stat(real); } catch { continue; }
        if (realStat.isDirectory()) {
          const r = await walk(real);
          if (r) return r;
        } else if (realStat.isFile()) {
          const r = await processFile(real);
          if (r) return r;
        }
        continue;
      }
      if (entry.isDirectory()) {
        const r = await walk(abs);
        if (r) return r;
        continue;
      }
      if (entry.isFile()) {
        const r = await processFile(abs);
        if (r) return r;
      }
    }
    return null;
  }

  const err = await walk(rootResolved);
  if (err) return err;
  return { ok: true, files };
}

/**
 * Pure handler for POST /__atlas/local-write.
 * Writes `contents` to `.local-atlas/<name>`, where `name` must be one of the
 * two allowed filenames (editor-settings.json or sync-map.json).
 * This is the only write that targets `.local-atlas/` — never `content/`, never
 * the vault. Validated by `isReadableLocalAtlasPath`.
 */
export async function handleLocalWriteRequest(
  name: string,
  contents: string,
  repoRoot: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const relPath = `.local-atlas/${name}`;
  if (!isReadableLocalAtlasPath(relPath)) {
    return { ok: false, status: 400, error: "DisallowedPath" };
  }
  const targetPath = path.resolve(repoRoot, ".local-atlas", name);
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, contents, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }
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
  //
  // Scope: this mutex covers POST /__atlas/save only. A DELETE /__atlas/assets/images
  // racing a save of the same image is theoretically possible but benign in
  // practice — both ops succeed or the later one wins. The mutex is not
  // extended to DELETE to avoid blocking the image picker during long rebuilds.
  return {
    name: "atlas-save",
    apply: "serve",
    configureServer(server) {
      // In dev, serve the DM build (.local-atlas/atlas.json) at /atlas/atlas.json
      // when it exists. Without this, the editor fetches public/atlas/atlas.json
      // — the *player* build that strips DM/hidden entities, so any DM-only
      // entity the editor just imported is invisible to reloadCanon and to the
      // client-side conflict-detection pass in the staging modal. When the DM
      // file isn't there yet (fresh checkout), the middleware passes the
      // request through to Vite's default public/ serving so the player atlas
      // still loads.
      const repoRoot = server.config.root;
      const serveLocalAtlas = (publicRelPath: string) =>
        (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => {
          if (req.method !== "GET") return next();
          const url = new URL(req.url ?? "/", "http://localhost");
          if (url.pathname !== publicRelPath) return next();
          // .local-atlas/atlas.json holds the DM build (hidden entities
          // visible). Gate it the same way as /__atlas/* so a LAN attacker
          // or cross-origin fetch can't pull DM canon by hitting this URL.
          if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
            // Fall through to Vite's static serving (public/atlas/atlas.json,
            // the *player* build) rather than 403 — preserves the player
            // preview workflow over LAN without leaking DM canon.
            return next();
          }
          const localPath = path.resolve(repoRoot, ".local-atlas", path.posix.basename(publicRelPath));
          fs.readFile(localPath, "utf8").then(
            (body) => {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(body);
            },
            () => next(),
          );
        };
      server.middlewares.use(serveLocalAtlas("/atlas/atlas.json"));
      server.middlewares.use(serveLocalAtlas("/atlas/search-index.json"));

      // GET /__atlas/read?path=content/...
      server.middlewares.use("/__atlas/read", (req, res, next) => {
        if (req.method !== "GET") return next();
        if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
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

      // GET /__atlas/vault-scan?vaultRoot=<abs>&ignore=<glob>&ignore=<glob>
      // Read-only walk of the DM's Obsidian vault; no write ops ever reached.
      server.middlewares.use("/__atlas/vault-scan", (req, res, next) => {
        if (req.method !== "GET") return next();
        if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const vaultRoot = url.searchParams.get("vaultRoot") ?? "";
        const ignoreGlobs = url.searchParams.getAll("ignore");
        if (!vaultRoot) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "MissingVaultRoot" }));
          return;
        }
        handleVaultScanRequest(vaultRoot, ignoreGlobs).then((result) => {
          res.setHeader("Content-Type", "application/json");
          if (result.ok) {
            res.statusCode = 200;
            res.end(JSON.stringify({ files: result.files }));
          } else {
            res.statusCode = result.status;
            res.end(JSON.stringify({ error: result.error }));
          }
        });
      });

      // GET /__atlas/local/editor-settings.json — reads .local-atlas/editor-settings.json
      // GET /__atlas/local/sync-map.json — reads .local-atlas/sync-map.json
      server.middlewares.use(serveLocalAtlas("/__atlas/local/editor-settings.json"));
      server.middlewares.use(serveLocalAtlas("/__atlas/local/sync-map.json"));

      // POST /__atlas/local-write { name, contents }
      // Writes machine-local config (editor-settings.json or sync-map.json) only.
      server.middlewares.use("/__atlas/local-write", (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => { raw += chunk; });
        req.on("end", async () => {
          let body: { name?: unknown; contents?: unknown };
          try {
            body = JSON.parse(raw) as { name?: unknown; contents?: unknown };
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "InvalidBody" }));
            return;
          }
          const name = typeof body.name === "string" ? body.name : "";
          const contents = typeof body.contents === "string" ? body.contents : "";
          const result = await handleLocalWriteRequest(name, contents, server.config.root);
          res.statusCode = result.ok ? 200 : (result as { ok: false; status: number }).status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        });
      });

      // GET /__atlas/assets/images — list of image filenames in public/atlas/assets/images/
      // DELETE /__atlas/assets/images?name=<filename> — remove an image from the library
      server.middlewares.use("/__atlas/assets/images", (req, res, next) => {
        if (req.method !== "GET" && req.method !== "DELETE") return next();
        if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
        if (req.method === "GET") {
          handleAssetsImagesRequest(server.config.root).then((result) => {
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            if (result.status === 200) {
              res.end(JSON.stringify({ images: (result as { status: 200; images: string[] }).images }));
            } else {
              res.end(JSON.stringify({ error: (result as { status: 500; error: string }).error }));
            }
          });
          return;
        }
        if (req.method === "DELETE") {
          const url = new URL(req.url ?? "", "http://localhost");
          const name = url.searchParams.get("name") ?? "";
          handleDeleteImageRequest(server.config.root, name).then((result) => {
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          });
          return;
        }
        next();
      });

      // POST /__atlas/save  { files, rebuild?: boolean }
      server.middlewares.use("/__atlas/save", (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!isAllowedDevRequest({ host: req.headers.host, origin: req.headers.origin, method: req.method })) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
        // A11: reject concurrent saves/builds with 423 Locked (D4: shared lock).
        if (!tryAcquireBuildLock()) {
          res.statusCode = 423;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Locked", detail: "another build is in flight" }));
          return;
        }
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
            releaseBuildLock();
          }
        });
        req.on("error", () => {
          releaseBuildLock();
        });
      });

      // POST /__atlas/publish-push — re-verify green → scoped commit → push → snapshot.
      // Uses the same loopback gate and shared build lock as publish-check (D5, D4).
      // Returns PublishPushResult as JSON with statusCode 200; 500 for unexpected throws.
      // ⚠️ This endpoint pushes to main — never fire it against the real repo during tests.
      server.middlewares.use("/__atlas/publish-push", (req, res, next) => {
        if (req.method !== "POST") return next();
        if (
          !isAllowedDevRequest({
            host: req.headers.host,
            origin: req.headers.origin,
            method: req.method,
          })
        ) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
        if (!tryAcquireBuildLock()) {
          res.statusCode = 423;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Locked", detail: "another build is in flight" }));
          return;
        }
        void (async () => {
          try {
            const { runPublishPush } = await import("./atlas/runPublishPush");
            const result = await runPublishPush(server.config.root);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "PublishPushFailed",
                detail: e instanceof Error ? e.message : String(e),
              }),
            );
          } finally {
            releaseBuildLock();
          }
        })();
      });

      // POST /__atlas/publish-check — player build + site build + scans → verdict + diff (no git).
      server.middlewares.use("/__atlas/publish-check", (req, res, next) => {
        if (req.method !== "POST") return next();
        if (
          !isAllowedDevRequest({
            host: req.headers.host,
            origin: req.headers.origin,
            method: req.method,
          })
        ) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
          return;
        }
        if (!tryAcquireBuildLock()) {
          res.statusCode = 423;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Locked", detail: "another build is in flight" }));
          return;
        }
        void (async () => {
          try {
            // Dynamic import: breaks the static analysis chain so esbuild
            // doesn't try to bundle the scan scripts (which have shebangs)
            // when loading vite.config.ts for a player build.
            const { runPublishCheck } = await import("./atlas/runPublishCheck");
            const result = await runPublishCheck(server.config.root);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "PublishCheckFailed",
                detail: e instanceof Error ? e.message : String(e),
              }),
            );
          } finally {
            releaseBuildLock();
          }
        })();
      });
    },
  };
}
