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
 * overlay that serves the DM build) is gated by `rejectNonLoopback`, which
 * requires BOTH of:
 *
 *   1. `isLoopbackAddress(req.socket.remoteAddress)` — the connection itself
 *      came from this machine. Unforgeable, and the actual perimeter.
 *   2. `isAllowedDevRequest(headers)` — the `Host` header resolves to a
 *      loopback name, and for write methods (POST/DELETE/PUT/PATCH) the
 *      `Origin` header is present AND loopback. Forgeable by a scripted
 *      client, so it is not a perimeter; it is CSRF defense, because a page
 *      on another origin cannot lie about `Origin` in the DM's own browser.
 *
 * Check 1 exists because check 2 alone was not enough. `vite.config.ts` used
 * to bind `host: "::"` (every interface) while this header stating the
 * binding was loopback — so a LAN client could send `Host: localhost` plus a
 * matching `Origin` and reach file reads, saves, vault scans, character keys,
 * and publish-push. The binding is now `127.0.0.1` and the socket check backs
 * it up, so `npm run dev -- --host` (the LAN player-preview workflow) stays
 * safe: players get the player build, DM endpoints still refuse them.
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
 * (A10). The shared build lock rejects an overlapping save with 423 so two
 * near-simultaneous rebuilds don't race to clobber public/atlas/atlas.json.
 *
 * Routes: `DEV_ROUTES` near the end of this file is the one table of
 * endpoints; `createDevRouter` applies the loopback gate, the build lock, the
 * body-size cap and JSON parsing once for all of them.
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
import { resolveVaultImage, vaultImageTargetName } from "../src/atlas/import/resolveVaultImage";
import {
  normalizeFormat,
  shouldConvertToWebp,
  suffixedName,
  webpTargetName,
  REENCODE_QUALITY,
  WEBP_QUALITY,
  MAX_IMAGE_WIDTH,
  shouldConvertMapToWebp,
} from "../src/atlas/assets/imageEncoding";
import { encodeMapWebp } from "./atlas/mapWebp";
import { runBuild, type BuildResult as InProcessBuildResult } from "./build-atlas";
import { tryAcquireBuildLock, releaseBuildLock } from "./atlas/buildLock";
import { DEV_API_PATHS, DEV_API_PREFIX } from "./atlas/devRoutes";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_VAULT_AGGREGATE_BYTES = 25 * 1024 * 1024;
// Asset uploads arrive as base64 data URLs; this cap covers ~5.5 MB of binary
// after the base64 inflation (matches the build's per-asset audit cap).
const MAX_ASSET_DATAURL_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BINARY_BYTES = 6 * 1024 * 1024;
/**
 * Whether an uploaded asset targets a `.webp` name under `assets/<folder>/`.
 *
 * Under `images/` that name is the instruction to convert (lossy, clamped).
 * Under `maps/` it means a map that maps:optimize repointed to a WebP twin;
 * maps stay lossless — fog redaction and map labels both suffer under a lossy
 * re-encode, and `scripts/dev/optimize-maps.ts` owns their sizing instead.
 */
function isWebpTargetIn(relPath: string, folder: "images" | "maps"): boolean {
  const p = relPath.replace(/\\/g, "/").toLowerCase();
  return p.includes(`/assets/${folder}/`) && p.endsWith(".webp");
}

/**
 * A map upload that can't reach a `.webp` map target without loss (JPG, or a
 * PNG that wouldn't come out pixel-identical) or without flattening an
 * animation (GIF). Turned into a 400 with reason `map-format-refused`. Ticket
 * eval-2026-10/29 owns the editor's JPG-map path.
 */
class MapFormatRefusedError extends Error {}

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
 * Returns true if `addr` is the peer address of a loopback TCP connection.
 *
 * This is the ONLY unforgeable half of the dev-server gate. `Host` and
 * `Origin` are just strings the client sends, so a LAN client can set them to
 * `localhost` and satisfy every header check; the kernel-reported peer address
 * cannot be spoofed without controlling the routing path. Header checks stay
 * on as CSRF defense (a browser sets Origin honestly, and a page on another
 * origin cannot forge it) — but they are not the perimeter. This is.
 *
 * Node reports loopback as "127.0.0.1", "::1", or the IPv4-mapped
 * "::ffff:127.0.0.1" depending on the socket family. Fails closed on
 * undefined: a request with no peer address is not one we can vouch for.
 */
export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.toLowerCase().trim();
  const unmapped = a.startsWith("::ffff:") ? a.slice("::ffff:".length) : a;
  // The whole 127.0.0.0/8 block is loopback, not just 127.0.0.1.
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(unmapped)) return true;
  return unmapped === "::1" || unmapped === "[::1]";
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
  if (o.baseHash !== null && (typeof o.baseHash !== "string" || !o.baseHash.startsWith("sha256:")))
    return false;
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

/**
 * Re-encode an image so no EXIF/IPTC/XMP/ICC metadata (GPS included) survives:
 * sharp drops it all unless `withMetadata()` is called. Shared by the save
 * route and the vault image copy so both publish the same bytes.
 * `source` is the input's mime type or extension; `target` is the published
 * path, whose name (chosen by the shared policy) says WebP or not.
 */
async function cleanImageBytes(buf: Buffer, source: string, target: string): Promise<Buffer> {
  const format = normalizeFormat(source);
  if (isWebpTargetIn(target, "images") && shouldConvertToWebp(format))
    return (
      sharp(buf)
        // Bake in EXIF orientation before that metadata is dropped, or a phone
        // photo would be published sideways.
        .rotate()
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    );
  // A map named `.webp` (maps:optimize repoints world.yaml to a WebP twin)
  // is never lossy re-encoded and never resized: fog redaction and map labels
  // smear under a lossy encode.
  if (isWebpTargetIn(target, "maps")) {
    // PNG is lossless: encode it the way maps:optimize does, checked pixel for
    // pixel, and refuse rather than keep a WebP that isn't exact.
    if (shouldConvertMapToWebp(format)) {
      const encoded = await encodeMapWebp(buf);
      if (encoded.ok) return encoded.webp;
      throw new MapFormatRefusedError(
        `This PNG can't be saved as a WebP map without loss: ${encoded.reason}. ` +
          `Save it under a .png name instead.`,
      );
    }
    // Already WebP: keep the bytes. Any re-encode would either add loss (if it
    // was lossy) or flatten an animation.
    if (format === "webp") return buf;
    throw new MapFormatRefusedError(
      `A ${format || "unknown"} file can't be saved as a WebP map without loss or ` +
        `flattening; upload a PNG or WebP (JPG maps: ticket eval-2026-10/29).`,
    );
  }
  // `animated: true` keeps every frame of a GIF or WebP; without it sharp
  // reads only the first and republishes an animation as a still.
  const s = sharp(buf, { animated: true });
  if (format === "png") return s.png().toBuffer();
  if (format === "jpeg" || format === "jpg")
    return s.jpeg({ quality: REENCODE_QUALITY, mozjpeg: true }).toBuffer();
  if (format === "webp") return s.webp({ quality: REENCODE_QUALITY }).toBuffer();
  if (format === "gif") return s.gif().toBuffer();
  return s.toBuffer();
}

export async function handleSaveRequest(
  body: unknown,
  repoRoot: string,
  opts?: HandleSaveOpts,
): Promise<HandlerResult> {
  if (!body || typeof body !== "object" || !Array.isArray((body as { files?: unknown }).files)) {
    return {
      status: 400,
      payload: { error: "InvalidBody", detail: "expected { files: FilePayload[] }" },
    };
  }
  const rawFiles = (body as { files: unknown[] }).files;
  if (rawFiles.length === 0) {
    return { status: 400, payload: { error: "InvalidBody", detail: "files array is empty" } };
  }
  for (const f of rawFiles) {
    if (!isFilePayload(f)) {
      return {
        status: 400,
        payload: {
          error: "InvalidBody",
          detail: "each file must be { path, content, kind, baseHash }",
        },
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
  // public/atlas/assets/{maps,images}/<file>.<image-ext>; text kinds under content/.
  for (const f of list) {
    const allowed =
      f.kind === "asset-binary" ? isWritableAssetPath(f.path) : isWritableSourcePath(f.path);
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
        // The client already applied the shared encoding policy when it chose
        // the filename, so a `.webp` target under assets/images/ IS the
        // instruction to convert — one decider, and the name can never
        // disagree with the bytes. Maps keep their own extension
        // (src/atlas/assets/mapLayerTarget.ts) and never match:
        // fog redaction and map labels both want lossless.
        stripped = await cleanImageBytes(buf, mime, f.path);
      } catch (e) {
        if (e instanceof MapFormatRefusedError) {
          return {
            status: 400,
            payload: {
              error: "InvalidContent",
              reason: "map-format-refused",
              failedPath: f.path,
              detail: e.message,
            },
          };
        }
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
  const preWrite: Array<{
    payload: FilePayload;
    existing: Buffer | null;
    bytesToWrite: Buffer;
    skip?: boolean;
  }> = [];
  for (const f of list) {
    const abs = path.resolve(repoRoot, f.path);
    let existingBytes: Buffer | null = null;
    try {
      existingBytes = await fs.readFile(abs);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      // ENOTDIR: a parent on the path is a file. Windows reports that as
      // ENOENT, macOS/Linux don't; either way the target is absent, and the
      // write pass below reports the blocked path.
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") {
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
    const publishedAt = opts?.readPublishedAt
      ? await opts.readPublishedAt().catch(() => null)
      : null;
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
      resolve({
        ok: false,
        durationMs: timeoutMs,
        stderr: `atlas build timed out after ${timeoutMs}ms`,
      });
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
    const errStr =
      "error" in result && result.error
        ? result.error
        : "stderr" in result
          ? (result.stderr ?? "")
          : "";
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
      () =>
        resolve({
          ok: false,
          durationMs: timeoutMs,
          stderr: `player build timed out after ${timeoutMs}ms`,
        }),
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
export async function handleAssetsImagesRequest(
  repoRoot: string,
): Promise<{ status: 200; images: string[] } | { status: 500; error: string }> {
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
): Promise<
  | { status: 200; deleted: string }
  | { status: 400; error: string }
  | { status: 404; error: string }
  | { status: 500; error: string }
> {
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
  try {
    await pruneBackups(repoRoot, relPath);
  } catch {
    /* non-fatal */
  }
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
  includeFolders: string[] = [],
): Promise<
  { ok: true; files: Record<string, string> } | { ok: false; status: number; error: string }
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

  // Folder scoping: when the DM has picked folders, a note must sit inside one.
  // The pattern is built here, never typed by the DM — a bare folder name is not
  // a glob and would match nothing (see design §2).
  const inScope = (relPosix: string): boolean =>
    includeFolders.length === 0 ||
    includeFolders.some((f) => relPosix === f || relPosix.startsWith(`${f}/`));

  async function processFile(
    absPath: string,
  ): Promise<{ ok: false; status: number; error: string } | null> {
    const relPosix = path.relative(rootResolved, absPath).split(path.sep).join("/");
    if (!isReadableVaultPath(rootResolved, absPath)) return null;
    if (isIgnored(relPosix)) return null;
    if (!inScope(relPosix)) return null;
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
        try {
          real = await fs.realpath(abs);
        } catch {
          continue;
        }
        // Symlink escape guard: resolved path must still be within vault root
        if (!real.startsWith(rootResolved + path.sep)) continue;
        let realStat: Awaited<ReturnType<typeof fs.stat>>;
        try {
          realStat = await fs.stat(real);
        } catch {
          continue;
        }
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

export interface VaultFolderSummary {
  name: string;
  noteCount: number;
}

/**
 * Pure handler for GET /__atlas/vault-folders.
 * Returns each top-level folder with a recursive .md count. Never returns file
 * contents — this is the cheap listing that lets the DM pick folders before any
 * note is read. Read-only.
 */
export async function handleVaultFoldersRequest(
  vaultRoot: string,
): Promise<
  { ok: true; folders: VaultFolderSummary[] } | { ok: false; status: number; error: string }
> {
  try {
    const s = await fs.stat(vaultRoot);
    if (!s.isDirectory()) return { ok: false, status: 400, error: "VaultNotDirectory" };
  } catch {
    return { ok: false, status: 400, error: "VaultNotFound" };
  }

  const rootResolved = path.resolve(vaultRoot);

  async function countMd(dir: string): Promise<number> {
    let total = 0;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) total += await countMd(abs);
      else if (e.name.endsWith(".md") && isReadableVaultPath(rootResolved, abs)) total += 1;
    }
    return total;
  }

  const folders: VaultFolderSummary[] = [];
  for (const e of await fs.readdir(rootResolved, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const abs = path.join(rootResolved, e.name);
    folders.push({ name: e.name, noteCount: await countMd(abs) });
  }
  folders.sort((a, b) => b.noteCount - a.noteCount);
  return { ok: true, folders };
}

const VAULT_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_VAULT_IMAGE_BYTES = 6 * 1024 * 1024;

export interface VaultImageCopyArgs {
  vaultRoot: string;
  candidateFolders: string[];
  noteRelPath: string;
  rawSrc: string;
  entityId: string;
  index: number;
  /** Public dir to write into: the dev server's `<root>/public`, never from the request. */
  publicDir: string;
}

export type VaultImageCopyResult =
  | { ok: true; target: string }
  | {
      ok: false;
      reason:
        | "not-found"
        | "outside-candidates"
        | "too-large"
        | "unreadable"
        | "write-failed"
        | "bad-target";
    };

/** How many `-2`, `-3`… names a copy tries before giving up. */
const MAX_NAME_SUFFIX = 99;

/**
 * Plain root-containment check, unlike `isReadableVaultPath` which hard-requires
 * a `.md` suffix (that helper is for note files; images need the same boundary
 * without the extension requirement — same fix shape as `handleVaultFoldersRequest`'s
 * top-level folder listing).
 */
function isWithinVaultRoot(rootResolved: string, candidateAbs: string): boolean {
  const cand = path.resolve(candidateAbs);
  return cand === rootResolved || cand.startsWith(rootResolved + path.sep);
}

/** Build the vault-relative index of image files, honouring the read boundary. */
async function indexVaultImages(rootResolved: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      // A symlink can point anywhere, including outside the vault or into a
      // DM folder; vault images are plain files.
      if (e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (!isWithinVaultRoot(rootResolved, abs)) continue;
      if (e.isDirectory()) await walk(abs);
      else if (VAULT_IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
        out.push(path.relative(rootResolved, abs).split(path.sep).join("/"));
      }
    }
  }
  await walk(rootResolved);
  return out;
}

/**
 * Copy one vault image into public/atlas/assets/images, stripped of metadata.
 * Reads the vault, never writes to it. Refuses anything outside the DM's
 * chosen folders — an embed can name a DM-only image.
 */
export async function handleVaultImageCopyRequest(
  args: VaultImageCopyArgs,
): Promise<VaultImageCopyResult> {
  const rootResolved = path.resolve(args.vaultRoot);
  const index = await indexVaultImages(rootResolved);
  const resolved = resolveVaultImage(args.rawSrc, args.noteRelPath, index, args.candidateFolders);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  let bytes: Buffer;
  try {
    // The real path must be exactly where the index saw it: no symlinked
    // folder or file on the way can lead outside the vault or the DM's folders.
    const rootReal = await fs.realpath(rootResolved);
    const abs = await fs.realpath(path.join(rootResolved, resolved.relPath));
    if (abs !== path.join(rootReal, resolved.relPath)) return { ok: false, reason: "not-found" };
    const stat = await fs.stat(abs);
    if (stat.size > MAX_VAULT_IMAGE_BYTES) return { ok: false, reason: "too-large" };
    bytes = await fs.readFile(abs);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  // The format follows the shared policy, which `vaultImageTargetName` used to
  // pick the extension, so the bytes always match the filename.
  const name = vaultImageTargetName(args.entityId, args.index, resolved.relPath);
  const outDir = path.join(args.publicDir, "atlas", "assets", "images");
  // The name derives from a note's id: it must stay a plain file in outDir.
  if (path.dirname(path.resolve(outDir, name)) !== path.resolve(outDir)) {
    return { ok: false, reason: "bad-target" };
  }
  let cleaned: Buffer;
  try {
    cleaned = await cleanImageBytes(
      bytes,
      path.extname(resolved.relPath),
      `atlas/assets/images/${name}`,
    );
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  // Never overwrite: the same bytes reuse the file (a re-sync), different
  // bytes take the next free `-2`, `-3`… name.
  try {
    await fs.mkdir(outDir, { recursive: true });
    for (let n = 1; n <= MAX_NAME_SUFFIX; n++) {
      const candidate = suffixedName(name, n);
      const outPath = path.join(outDir, candidate);
      try {
        await fs.writeFile(outPath, cleaned, { flag: "wx" });
        return { ok: true, target: `/atlas/assets/images/${candidate}` };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      if (cleaned.equals(await fs.readFile(outPath)))
        return { ok: true, target: `/atlas/assets/images/${candidate}` };
    }
  } catch {
    // an fs error, or every name up to MAX_NAME_SUFFIX holds other bytes
  }
  return { ok: false, reason: "write-failed" };
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
async function readAllowlistedFile(
  repoRoot: string,
  relPath: string,
): Promise<{ ok: true; contents: string } | { ok: false; status: number; error: string }> {
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

type DevRequest = import("http").IncomingMessage;
type DevResponse = import("http").ServerResponse;

/**
 * Whether a request may reach a dev route: the peer dialed in over loopback
 * AND its headers are loopback-consistent. Two independent checks, both
 * required:
 *   1. the peer actually dialed in over loopback (unforgeable), and
 *   2. the headers it sent are loopback-consistent (forgeable by a script,
 *      but a cross-origin *browser* page cannot lie about Origin).
 * (1) stops a LAN client sending `Host: localhost`; (2) stops a malicious
 * web page in the DM's own browser driving these endpoints via CSRF.
 */
function isAllowedDevPeer(req: DevRequest): boolean {
  return (
    isLoopbackAddress(req.socket?.remoteAddress) &&
    isAllowedDevRequest({
      host: req.headers.host,
      origin: req.headers.origin,
      method: req.method,
    })
  );
}

/**
 * Shared loopback gate. If the request is not an allowed dev request, write a
 * 403 and return `true` — the caller must then `return` without handling it.
 * Returns `false` when the request may proceed. The route table
 * (`createDevRouter`) calls this once for every `/__atlas/*` request, so no
 * route can forget it.
 *
 * The DM overlays of player URLs (`/atlas/atlas.json`, `/atlas/search-index.json`)
 * don't 403 on a refused request: they fall through to Vite's static serving
 * (the *player* atlas), to keep the LAN player-preview workflow without
 * leaking DM canon.
 */
export function rejectNonLoopback(req: DevRequest, res: DevResponse): boolean {
  if (isAllowedDevPeer(req)) return false;
  res.statusCode = 403;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Forbidden", detail: "loopback-only" }));
  return true;
}

// ── Route table ─────────────────────────────────────────────────────────────

/**
 * Request-body caps. A body over its route's cap is drained, discarded and
 * answered 413.
 *
 * The save route is the big one, and nothing caps how many files one batch
 * holds, so its cap is a ceiling against runaway requests rather than a
 * computed fit. For scale: a vault sync scans at most MAX_VAULT_AGGREGATE_BYTES
 * (25 MB) of notes, JSON escaping can roughly double that, and each image is a
 * base64 data URL of up to MAX_ASSET_DATAURL_BYTES (8 MB). Vault images go
 * through vault-image-copy, not save, so a save of ~10 or more full-size
 * editor uploads at once is the case that would hit it.
 */
export const SAVE_BODY_LIMIT_BYTES = 128 * 1024 * 1024;
/** `.local-atlas` config (the sync map grows with the vault). */
export const LOCAL_WRITE_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
/** A vault-image-copy body is a couple of paths and a candidate-folder list. */
export const VAULT_IMAGE_COPY_BODY_LIMIT_BYTES = 1024 * 1024;

export interface DevRouteRequest {
  url: URL;
  /** Parsed JSON body; `undefined` for routes that don't read one. */
  body: unknown;
  /** Repo root (`server.config.root`). */
  root: string;
}

export type DevRouteReply =
  /** JSON-encode `json` and send it with `status`. */
  | { status: number; json: unknown }
  /** Send `text` as-is (already JSON) with `status` and extra headers. */
  | { status: number; text: string; headers?: Record<string, string> }
  /** Not handled here: hand the request on to Vite. */
  | { next: true };

export interface DevRoute {
  method: "GET" | "POST" | "DELETE";
  /** Exact URL pathname (query string ignored). */
  path: string;
  /** Hold the shared build lock (scripts/atlas/buildLock.ts) for the whole request; 423 if taken. */
  takesBuildLock: boolean;
  /**
   * Read and JSON-parse the body, capped at `maxBytes` (413 above it). A body
   * that isn't JSON gets 400 `{ error: "InvalidBody" }`, plus `detail` when
   * `invalidDetail` is set. `null`: the body is never read.
   */
  body: { maxBytes: number; invalidDetail?: string } | null;
  handle: (req: DevRouteRequest) => Promise<DevRouteReply>;
}

/**
 * How a route answers a refused (non-loopback or cross-origin) request:
 * everything under `/__atlas/` gets 403; a DM overlay of a player URL falls
 * through to the player file.
 */
export function refusalPolicy(path: string): "forbid" | "player-fallthrough" {
  return path.startsWith(DEV_API_PREFIX) ? "forbid" : "player-fallthrough";
}

/**
 * Serves `.local-atlas/<basename of urlPath>` (the DM build, or machine-local
 * editor config) when it exists. A missing file hands the request on to Vite,
 * which serves the player file for `/atlas/*`.
 */
function localAtlasOverlay(urlPath: string): DevRoute["handle"] {
  return async ({ root }) => {
    const localPath = path.resolve(root, ".local-atlas", path.posix.basename(urlPath));
    try {
      const text = await fs.readFile(localPath, "utf8");
      return { status: 200, text, headers: { "Cache-Control": "no-store" } };
    } catch {
      return { next: true };
    }
  };
}

function overlayRoute(urlPath: string): DevRoute {
  return {
    method: "GET",
    path: urlPath,
    takesBuildLock: false,
    body: null,
    handle: localAtlasOverlay(urlPath),
  };
}

/**
 * Every dev-server route. `createDevRouter` applies the loopback gate, the
 * build lock, body reading and JSON replies; a handler only maps a request to
 * a status and body.
 */
export const DEV_ROUTES: readonly DevRoute[] = [
  // In dev, serve the DM build (.local-atlas/atlas.json) at /atlas/atlas.json
  // when it exists. Without this, the editor fetches public/atlas/atlas.json
  // — the *player* build that strips DM/hidden entities, so any DM-only
  // entity the editor just imported is invisible to reloadCanon and to the
  // client-side conflict-detection pass in the staging modal. When the DM
  // file isn't there yet (fresh checkout), the request passes through to
  // Vite's default public/ serving so the player atlas still loads.
  overlayRoute("/atlas/atlas.json"),
  overlayRoute("/atlas/search-index.json"),

  // GET /__atlas/read?path=content/...
  {
    method: "GET",
    path: DEV_API_PATHS.read,
    takesBuildLock: false,
    body: null,
    handle: async ({ url, root }) => {
      const relPath = url.searchParams.get("path") ?? "";
      const result = await readAllowlistedFile(root, relPath);
      return result.ok === true
        ? { status: 200, json: { path: relPath, contents: result.contents } }
        : { status: result.status, json: { error: result.error, path: relPath } };
    },
  },

  // GET /__atlas/vault-scan?vaultRoot=<abs>&ignore=<glob>&ignore=<glob>
  // Read-only walk of the DM's Obsidian vault; no write ops ever reached.
  {
    method: "GET",
    path: DEV_API_PATHS.vaultScan,
    takesBuildLock: false,
    body: null,
    handle: async ({ url }) => {
      const vaultRoot = url.searchParams.get("vaultRoot") ?? "";
      if (!vaultRoot) return { status: 400, json: { error: "MissingVaultRoot" } };
      const ignoreGlobs = url.searchParams.getAll("ignore");
      const includeFolders = url.searchParams.getAll("folder");
      const result = await handleVaultScanRequest(vaultRoot, ignoreGlobs, includeFolders);
      return result.ok
        ? { status: 200, json: { files: result.files } }
        : { status: result.status, json: { error: result.error } };
    },
  },

  // GET /__atlas/vault-folders?vaultRoot=<abs>
  // Read-only folder-summary listing so the DM can pick folders before any note is read.
  {
    method: "GET",
    path: DEV_API_PATHS.vaultFolders,
    takesBuildLock: false,
    body: null,
    handle: async ({ url }) => {
      const vaultRoot = url.searchParams.get("vaultRoot") ?? "";
      if (!vaultRoot) return { status: 400, json: { error: "MissingVaultRoot" } };
      const result = await handleVaultFoldersRequest(vaultRoot);
      return result.ok
        ? { status: 200, json: { folders: result.folders } }
        : { status: result.status, json: { error: result.error } };
    },
  },

  // POST /__atlas/vault-image-copy
  // Copies one vault image into public/atlas/assets/images, metadata stripped.
  // Bytes never round-trip through the browser. `publicDir` is never accepted
  // from the request body — always server-derived — so a request can't redirect writes.
  {
    method: "POST",
    path: DEV_API_PATHS.vaultImageCopy,
    takesBuildLock: false,
    body: { maxBytes: VAULT_IMAGE_COPY_BODY_LIMIT_BYTES },
    handle: async ({ body, root }) => {
      const result = await handleVaultImageCopyRequest({
        ...(body as VaultImageCopyArgs),
        publicDir: path.join(root, "public"),
      });
      return { status: result.ok ? 200 : 400, json: result };
    },
  },

  // GET /__atlas/local/editor-settings.json — reads .local-atlas/editor-settings.json
  // GET /__atlas/local/sync-map.json — reads .local-atlas/sync-map.json
  overlayRoute(DEV_API_PATHS.localEditorSettings),
  overlayRoute(DEV_API_PATHS.localSyncMap),

  // POST /__atlas/local-write { name, contents }
  // Writes machine-local config (editor-settings.json or sync-map.json) only.
  {
    method: "POST",
    path: DEV_API_PATHS.localWrite,
    takesBuildLock: false,
    body: { maxBytes: LOCAL_WRITE_BODY_LIMIT_BYTES },
    handle: async ({ body, root }) => {
      const b = body as { name?: unknown; contents?: unknown };
      const name = typeof b.name === "string" ? b.name : "";
      const contents = typeof b.contents === "string" ? b.contents : "";
      const result = await handleLocalWriteRequest(name, contents, root);
      return { status: result.ok ? 200 : result.status, json: result };
    },
  },

  // GET /__atlas/assets/images — list of image filenames in public/atlas/assets/images/
  {
    method: "GET",
    path: DEV_API_PATHS.assetsImages,
    takesBuildLock: false,
    body: null,
    handle: async ({ root }) => {
      const result = await handleAssetsImagesRequest(root);
      return result.status === 200
        ? { status: 200, json: { images: result.images } }
        : { status: result.status, json: { error: result.error } };
    },
  },

  // DELETE /__atlas/assets/images?name=<filename> — remove an image from the library.
  // Deliberately not under the build lock: it would block the image picker
  // during long rebuilds, and racing a save of the same image is benign.
  {
    method: "DELETE",
    path: DEV_API_PATHS.assetsImages,
    takesBuildLock: false,
    body: null,
    handle: async ({ url, root }) => {
      const name = url.searchParams.get("name") ?? "";
      const result = await handleDeleteImageRequest(root, name);
      return { status: result.status, json: result };
    },
  },

  // POST /__atlas/save  { files, rebuild?: boolean }
  // A11: overlapping saves/builds are rejected with 423 Locked (D4: shared lock)
  // so two builds never race to write public/atlas/atlas.json.
  {
    method: "POST",
    path: DEV_API_PATHS.save,
    takesBuildLock: true,
    body: { maxBytes: SAVE_BODY_LIMIT_BYTES, invalidDetail: "request body is not JSON" },
    handle: async ({ body, root }) => {
      const rebuild = !!(body as { rebuild?: boolean } | null)?.rebuild;
      const result = await handleSaveRequest(body, root, {
        afterWrite: rebuild ? async () => runAtlasBuild(root) : undefined,
        readPublishedAt: rebuild ? () => readAtlasPublishedAt(root) : undefined,
      });
      return { status: result.status, json: result.payload };
    },
  },

  // POST /__atlas/publish-push — re-verify green → scoped commit → push → snapshot.
  // Returns PublishPushResult as JSON with statusCode 200; 500 for unexpected throws.
  // ⚠️ This endpoint pushes to main — never fire it against the real repo during tests.
  {
    method: "POST",
    path: DEV_API_PATHS.publishPush,
    takesBuildLock: true,
    body: null,
    handle: async ({ root }) => {
      try {
        const { runPublishPush } = await import("./atlas/runPublishPush");
        return { status: 200, json: await runPublishPush(root) };
      } catch (e) {
        return {
          status: 500,
          json: { error: "PublishPushFailed", detail: e instanceof Error ? e.message : String(e) },
        };
      }
    },
  },

  // POST /__atlas/publish-check — player build + site build + scans → verdict + diff (no git).
  {
    method: "POST",
    path: DEV_API_PATHS.publishCheck,
    takesBuildLock: true,
    body: null,
    handle: async ({ root }) => {
      try {
        // Dynamic import: breaks the static analysis chain so esbuild
        // doesn't try to bundle the scan scripts (which have shebangs)
        // when loading vite.config.ts for a player build.
        const { runPublishCheck } = await import("./atlas/runPublishCheck");
        return { status: 200, json: await runPublishCheck(root) };
      } catch (e) {
        return {
          status: 500,
          json: { error: "PublishCheckFailed", detail: e instanceof Error ? e.message : String(e) },
        };
      }
    },
  },
];

function sendJson(res: DevResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

type BodyRead = { kind: "ok"; text: string } | { kind: "too-large" } | { kind: "aborted" };

/**
 * Reads the request body up to `maxBytes`. Stops reading as soon as the
 * declared Content-Length or the bytes received pass the cap.
 */
function readBody(req: DevRequest, maxBytes: number): Promise<BodyRead> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Promise.resolve({ kind: "too-large" });
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const finish = (result: BodyRead) => {
      if (settled) return;
      settled = true;
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      resolve(result);
    };
    const onData = (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      received += buf.length;
      if (received > maxBytes) {
        req.pause();
        finish({ kind: "too-large" });
        return;
      }
      chunks.push(buf);
    };
    const onEnd = () => finish({ kind: "ok", text: Buffer.concat(chunks).toString("utf8") });
    const onError = () => finish({ kind: "aborted" });
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

async function runRoute(
  route: DevRoute,
  url: URL,
  root: string,
  req: DevRequest,
  res: DevResponse,
  next: () => void,
): Promise<void> {
  if (route.takesBuildLock && !tryAcquireBuildLock()) {
    sendJson(res, 423, { error: "Locked", detail: "another build is in flight" });
    return;
  }
  try {
    let body: unknown;
    if (route.body) {
      const read = await readBody(req, route.body.maxBytes);
      if (read.kind === "aborted") return; // client went away; nobody to answer
      if (read.kind === "too-large") {
        // Drain the rest of the upload before answering: a browser that is
        // still sending when the socket closes reports "Failed to fetch"
        // instead of the 413. The bytes are discarded, and it's loopback.
        if (!req.readableEnded) {
          await new Promise<void>((resolve) => {
            req.once("end", resolve);
            req.once("close", resolve);
            req.once("error", resolve);
            req.resume();
          });
        }
        res.setHeader("Connection", "close");
        sendJson(res, 413, {
          error: "PayloadTooLarge",
          detail: `request body exceeds ${route.body.maxBytes} bytes`,
        });
        return;
      }
      try {
        body = JSON.parse(read.text);
      } catch {
        const detail = route.body.invalidDetail;
        sendJson(res, 400, detail ? { error: "InvalidBody", detail } : { error: "InvalidBody" });
        return;
      }
    }
    const reply = await route.handle({ url, body, root });
    if ("next" in reply) {
      next();
      return;
    }
    res.statusCode = reply.status;
    res.setHeader("Content-Type", "application/json");
    if ("text" in reply) {
      for (const [k, v] of Object.entries(reply.headers ?? {})) res.setHeader(k, v);
      res.end(reply.text);
    } else {
      res.end(JSON.stringify(reply.json));
    }
  } catch (e) {
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: "InternalError",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  } finally {
    if (route.takesBuildLock) releaseBuildLock();
  }
}

/**
 * One connect middleware for a route table. For a request whose pathname is
 * under `/__atlas/` or matches a route:
 *   1. the loopback gate runs first, whatever the method (403, or fall-through
 *      for a DM overlay of a player URL);
 *   2. no route for this method → hand on to Vite;
 *   3. the build lock, body cap and JSON parse, then the handler.
 */
export function createDevRouter(
  routes: readonly DevRoute[],
  root: string,
): (req: DevRequest, res: DevResponse, next: () => void) => void {
  return (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const onPath = routes.filter((r) => r.path === url.pathname);
    const refusal = refusalPolicy(url.pathname);
    if (refusal === "player-fallthrough" && onPath.length === 0) return next();
    if (refusal === "player-fallthrough" && !isAllowedDevPeer(req)) return next(); // player file, not DM data
    if (rejectNonLoopback(req, res)) return;
    const route = onPath.find((r) => r.method === req.method);
    if (!route) return next();
    void runRoute(route, url, root, req, res, next);
  };
}

export function atlasSavePlugin(): Plugin {
  return {
    name: "atlas-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createDevRouter(DEV_ROUTES, server.config.root));
    },
  };
}
