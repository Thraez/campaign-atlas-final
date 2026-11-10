/**
 * Node reader for `.local-atlas/sync-map.json` as a per-world file (R-14;
 * shape and rules in `src/atlas/import/syncMap.ts`). An old flat map reads as
 * `atlas.config.json` `defaultWorld`'s, the v1 world. Used by the CLI's port
 * (`fsVaultPort.ts`) and by the dev server's GET route for the editor.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { readSyncMapFile, type SyncMapFile } from "../../src/atlas/import/syncMap";

/** `defaultWorld` from `<repoRoot>/atlas.config.json`, or null when it can't be read. */
export async function readDefaultWorld(repoRoot: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(repoRoot, "atlas.config.json"), "utf8"),
    );
    const v = (parsed as { defaultWorld?: unknown } | null)?.defaultWorld;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/**
 * The repo's sync-map file. Missing reads as empty; a file that isn't valid
 * JSON, or an old map with no `defaultWorld` to read it as, throws, so a
 * corrupt map stops the caller instead of being read as empty and overwritten.
 */
export async function readRepoSyncMapFile(repoRoot: string): Promise<SyncMapFile> {
  let text: string;
  try {
    text = await fs.readFile(path.join(repoRoot, ".local-atlas", "sync-map.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { version: 2, worlds: {} };
    throw e;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`.local-atlas/sync-map.json is not valid JSON: ${(e as Error).message}`);
  }
  return readSyncMapFile(raw, await readDefaultWorld(repoRoot));
}
