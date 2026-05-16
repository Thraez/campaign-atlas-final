/**
 * Browser-side caller for the dev-only local FS save endpoint.
 *
 * Validates every change against the shared source-path allowlist and a hard
 * size cap BEFORE making any network call, then POSTs to /__atlas/save which
 * is served by the Vite dev plugin (scripts/vite-plugin-atlas-save.ts).
 *
 * Payload shape (Phase 1A unified Save):
 *   {
 *     files: [{ path, content, kind, baseHash }],
 *     rebuild?: boolean
 *   }
 *
 *   - `kind` is a discriminator ("entity-md" | "world-yaml") that lets the
 *     endpoint parse-back-validate the right way for each file.
 *   - `baseHash` is a SHA-256 (in `"sha256:<hex>"` form) of the file's
 *     contents at editor-load time. The endpoint compares it against the
 *     current on-disk hash and refuses to overwrite when they diverge —
 *     prevents the editor from silently stomping on edits made elsewhere
 *     (Obsidian, git pull, manual fix, etc.). Use `null` for create-only
 *     writes where the target file is not expected to exist yet.
 *
 * No authentication, no GitHub API. Dev-mode only — the plugin uses
 * apply: "serve" so the endpoint physically does not exist in production
 * builds.
 */
import { isWritableAssetPath, isWritableSourcePath } from "./sourcePathAllowlist";

export type FileKind = "entity-md" | "world-yaml" | "asset-binary";

export interface FileChange {
  path: string;
  /**
   * For `entity-md` and `world-yaml` this is the UTF-8 text body. For
   * `asset-binary` it's a `data:<mime>;base64,<payload>` URL — the server
   * decodes it before writing the raw bytes to disk.
   */
  content: string;
  kind: FileKind;
  /**
   * `"sha256:<hex>"` hash of the file's content as the editor loaded it,
   * or `null` for a create-only write (target must not exist).
   *
   * For `asset-binary`, the hash is over the **decoded bytes**, not the
   * data URL wrapper — keeps the hash stable across whitespace / quoting
   * changes in the dataUrl prefix.
   */
  baseHash: string | null;
}

const DATA_URL_PREFIX = /^data:[^;,]+;base64,/;

export interface LocalSaveBuildInfo {
  ok: boolean;
  durationMs: number;
  stderr?: string;
}

export interface LocalSaveFileResult {
  path: string;
  hash: string;
}

export interface LocalSaveResult {
  saved: number;
  paths: string[];
  files?: LocalSaveFileResult[];
  /** True on full success after a rebuild; false when writes succeeded but
   *  the rebuild failed (HTTP 207); undefined when no rebuild was requested. */
  rebuilt?: boolean;
  /** ISO timestamp on the regenerated atlas.json; null when rebuild failed. */
  publishedAt?: string | null;
  /** Rebuild error tail when `rebuilt === false`. */
  rebuildError?: string;
  /** Legacy build summary (kept for backwards-compat with older toast UI). */
  build?: LocalSaveBuildInfo;
}

export class DisallowedPathError extends Error {
  constructor(public readonly path: string) {
    super(`Path not in source allowlist: ${path}`);
    this.name = "DisallowedPathError";
  }
}

export type ConflictReason = "stale-base" | "missing-base" | "already-exists";

/**
 * Thrown when the Save endpoint refuses a write because the on-disk file
 * has diverged from what the editor loaded (stale-base / missing-base) or
 * because a create-only write hit an existing file (already-exists).
 * UI should surface `failedPath` and `reason`; for `stale-base` it should
 * offer a Reload button.
 */
export class ConflictError extends Error {
  constructor(
    public readonly reason: ConflictReason,
    public readonly failedPath: string,
    public readonly currentHash?: string,
  ) {
    super(`Save conflict (${reason}) on ${failedPath}`);
    this.name = "ConflictError";
  }
}

export class LocalSaveError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = "LocalSaveError";
  }
}

/**
 * Thrown when the Save endpoint reports another save is already in flight
 * (HTTP 423 Locked). The editor should disable the Save button visibly
 * during a save to make this rare, but two tabs / a force-click race can
 * still hit it. UI should toast "Already saving — try again in a moment."
 */
export class SaveBusyError extends Error {
  constructor() {
    super("Another save is already in flight");
    this.name = "SaveBusyError";
  }
}

export interface LocalSaveDeps {
  fetchFn?: typeof fetch;
}

const MAX_FILE_BYTES = 1024 * 1024;
// Asset binaries are sent as base64 dataUrls — 8 MB of UTF-8 covers ~5.5 MB
// of decoded binary, comfortably above the build's per-asset audit cap.
const MAX_ASSET_DATAURL_BYTES = 8 * 1024 * 1024;
const ENDPOINT = "/__atlas/save";

function utf8ByteLength(s: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(s).length;
  }
  // Fallback (node test envs always have TextEncoder, but just in case).
  return Buffer.byteLength(s, "utf8");
}

export interface SaveOpts {
  /** Ask the dev plugin to run the atlas build after writes. Dev-only. */
  rebuild?: boolean;
}

export async function saveAtlasPatchToLocalFs(
  files: FileChange[],
  deps?: LocalSaveDeps,
  opts?: SaveOpts,
): Promise<LocalSaveResult> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new LocalSaveError("No changes to save");
  }
  for (const f of files) {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string") {
      throw new LocalSaveError("Invalid change entry");
    }
    if (f.kind !== "entity-md" && f.kind !== "world-yaml" && f.kind !== "asset-binary") {
      throw new LocalSaveError(`Invalid kind for ${f.path}: ${String(f.kind)}`);
    }
    if (f.baseHash !== null && (typeof f.baseHash !== "string" || !f.baseHash.startsWith("sha256:"))) {
      throw new LocalSaveError(`Invalid baseHash for ${f.path}`);
    }
    if (f.kind === "asset-binary") {
      if (!isWritableAssetPath(f.path)) {
        throw new DisallowedPathError(f.path);
      }
      if (!DATA_URL_PREFIX.test(f.content)) {
        throw new LocalSaveError(`Asset content must be a base64 data URL: ${f.path}`);
      }
      if (utf8ByteLength(f.content) > MAX_ASSET_DATAURL_BYTES) {
        throw new LocalSaveError(`Asset too large: ${f.path}`);
      }
    } else {
      if (!isWritableSourcePath(f.path)) {
        throw new DisallowedPathError(f.path);
      }
      if (utf8ByteLength(f.content) > MAX_FILE_BYTES) {
        throw new LocalSaveError(`File too large: ${f.path}`);
      }
    }
  }

  const fetchFn = deps?.fetchFn ?? fetch;
  const body: Record<string, unknown> = { files };
  if (opts?.rebuild) body.rebuild = true;
  const res = await fetchFn(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let parsed: unknown = undefined;
  try {
    parsed = await res.json();
  } catch {
    if (!res.ok) {
      throw new LocalSaveError(`Save failed with status ${res.status}`);
    }
    throw new LocalSaveError("Save response was not JSON");
  }

  if (!res.ok) {
    const body = parsed as {
      error?: string;
      path?: string;
      failedPath?: string;
      reason?: string;
      currentHash?: string;
      detail?: unknown;
    } | null;
    if (body && body.error === "DisallowedPath" && typeof body.path === "string") {
      throw new DisallowedPathError(body.path);
    }
    if (
      res.status === 409 &&
      body &&
      body.error === "Conflict" &&
      typeof body.failedPath === "string" &&
      (body.reason === "stale-base" || body.reason === "missing-base" || body.reason === "already-exists")
    ) {
      throw new ConflictError(body.reason, body.failedPath, body.currentHash);
    }
    if (res.status === 423) {
      throw new SaveBusyError();
    }
    throw new LocalSaveError(
      (body && typeof body.error === "string") ? body.error : `Save failed with status ${res.status}`,
      body ?? undefined,
    );
  }

  return parsed as LocalSaveResult;
}

/**
 * Compute the `sha256:<hex>` hash for a string. Uses `crypto.subtle` in the
 * browser; falls back to Node's `crypto` in test environments. Exported so
 * the editor can fingerprint a file at load time and again at save time.
 */
export async function hashContent(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256:${hex}`;
  }
  // Node test fallback (only reached when Web Crypto is unavailable, i.e.
  // older Node test envs). Dynamic ESM import so this stays bundler-safe in
  // the browser, where this branch is never taken.
  const { createHash } = await import("node:crypto");
  const hex = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${hex}`;
}
