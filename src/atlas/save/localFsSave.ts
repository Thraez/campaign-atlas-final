/**
 * Browser-side caller for the dev-only local FS save endpoint.
 *
 * Validates every change against the shared source-path allowlist and a hard
 * size cap BEFORE making any network call, then POSTs to /__atlas/save which
 * is served by the Vite dev plugin (scripts/vite-plugin-atlas-save.ts).
 *
 * No authentication, no GitHub API. Dev-mode only — the plugin uses
 * apply: "serve" so the endpoint physically does not exist in production
 * builds.
 */
import { isWritableSourcePath } from "./sourcePathAllowlist";

export interface FileChange {
  path: string;
  contents: string;
}

export interface LocalSaveBuildInfo {
  ok: boolean;
  durationMs: number;
  stderr?: string;
}

export interface LocalSaveResult {
  written: number;
  paths: string[];
  /** Present when the save endpoint was asked to rebuild the atlas. */
  build?: LocalSaveBuildInfo;
}

export class DisallowedPathError extends Error {
  constructor(public readonly path: string) {
    super(`Path not in source allowlist: ${path}`);
    this.name = "DisallowedPathError";
  }
}

export class LocalSaveError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = "LocalSaveError";
  }
}

export interface LocalSaveDeps {
  fetchFn?: typeof fetch;
}

const MAX_FILE_BYTES = 1024 * 1024;
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
  changes: FileChange[],
  deps?: LocalSaveDeps,
  opts?: SaveOpts,
): Promise<LocalSaveResult> {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new LocalSaveError("No changes to save");
  }
  for (const c of changes) {
    if (!c || typeof c.path !== "string" || typeof c.contents !== "string") {
      throw new LocalSaveError("Invalid change entry");
    }
    if (!isWritableSourcePath(c.path)) {
      throw new DisallowedPathError(c.path);
    }
    if (utf8ByteLength(c.contents) > MAX_FILE_BYTES) {
      throw new LocalSaveError(`File too large: ${c.path}`);
    }
  }

  const fetchFn = deps?.fetchFn ?? fetch;
  const body: Record<string, unknown> = { changes };
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
    const body = parsed as { error?: string; path?: string; detail?: unknown } | null;
    if (body && body.error === "DisallowedPath" && typeof body.path === "string") {
      throw new DisallowedPathError(body.path);
    }
    throw new LocalSaveError(
      (body && typeof body.error === "string") ? body.error : `Save failed with status ${res.status}`,
      body?.detail ?? body,
    );
  }

  return parsed as LocalSaveResult;
}