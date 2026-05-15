/**
 * Fetches the active world's `world.yaml` once at editor-load and pins the
 * baseline that the unified Save (A13) compares against.
 *
 * Why: the unified Save endpoint refuses writes when the on-disk hash has
 * diverged from `baseHash` (A5 conflict protection). It also needs the raw
 * existing content so `serializeWorldYaml` can re-prepend the leading
 * comment block byte-for-byte.
 *
 * Returned state:
 *   - `raw`     — current on-disk contents of world.yaml as the editor saw
 *                 them, or `null` when the file does not exist yet (fresh world).
 *   - `hash`    — `"sha256:<hex>"` of `raw`, or `null` when raw is null.
 *   - `loading` — true while the initial fetch is in flight.
 *   - `error`   — non-null when the fetch failed with a non-404 status.
 *
 * `refresh()` re-fetches and updates the baseline; call it after a
 * successful Save so the next dirty cycle uses the fresh hash.
 */
import { useCallback, useEffect, useState } from "react";
import { hashContent } from "./localFsSave";
import { isWritableSourcePath } from "./sourcePathAllowlist";

export interface WorldYamlBaseline {
  raw: string | null;
  hash: string | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch and recompute the baseline. */
  refresh: () => Promise<void>;
}

export function worldYamlPath(worldId: string): string {
  return `content/${worldId}/_atlas/world.yaml`;
}

export function useWorldYamlBaseline(
  worldId: string | null | undefined,
  deps?: { fetchFn?: typeof fetch },
): WorldYamlBaseline {
  const [raw, setRaw] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const relPath = worldYamlPath(id);
    if (!isWritableSourcePath(relPath)) {
      setError(`Path not in source allowlist: ${relPath}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetchFn = deps?.fetchFn ?? fetch;
      const res = await fetchFn(`/__atlas/read?path=${encodeURIComponent(relPath)}`, { method: "GET" });
      if (res.status === 404) {
        // New world: file doesn't exist yet. Treat as a create-only write target.
        setRaw(null);
        setHash(null);
        return;
      }
      if (!res.ok) {
        setError(`Failed to read ${relPath}: status ${res.status}`);
        return;
      }
      const body = (await res.json()) as { contents?: unknown };
      if (typeof body.contents !== "string") {
        setError(`Malformed read response for ${relPath}`);
        return;
      }
      const h = await hashContent(body.contents);
      setRaw(body.contents);
      setHash(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [deps?.fetchFn]);

  useEffect(() => {
    if (!worldId) {
      setRaw(null);
      setHash(null);
      setError(null);
      setLoading(false);
      return;
    }
    void load(worldId);
  }, [worldId, load]);

  const refresh = useCallback(async () => {
    if (worldId) await load(worldId);
  }, [worldId, load]);

  return { raw, hash, loading, error, refresh };
}
