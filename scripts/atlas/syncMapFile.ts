/**
 * Node reader for `.local-atlas/sync-map.json` as a per-world file (R-14;
 * shape and rules in `src/atlas/import/syncMap.ts`). An old flat map reads as
 * the v1 world named in `atlas.config.json`. Used by the CLI's port
 * (`fsVaultPort.ts`) and by the dev server's GET route for the editor.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  legacySyncMapWorld,
  readSyncMapFile,
  withWorldSyncMap,
  type SyncMap,
  type SyncMapFile,
} from "../../src/atlas/import/syncMap";

/** The v1 world named in `<repoRoot>/atlas.config.json`, or null when it can't be read. */
export async function readDefaultWorld(repoRoot: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(repoRoot, "atlas.config.json"), "utf8"),
    );
    return legacySyncMapWorld(parsed);
  } catch {
    return null;
  }
}

/**
 * The repo's sync-map file. Missing reads as empty; a file that isn't valid
 * JSON, or an old map with no v1 world to read it as, throws, so a
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

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 25;

/** Serializes sync-map writes inside this process (the dev server, the CLI). */
let inProcess: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` holding `.local-atlas/sync-map.json.lock`, an exclusive lock file,
 * so the dev server and `npm run atlas:sync` never interleave a
 * read-merge-write. A lock older than 30 s is taken as left behind by a dead
 * process. Gives up after 10 s.
 */
async function withSyncMapFileLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.join(repoRoot, ".local-atlas", "sync-map.json.lock");
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await (await fs.open(lockPath, "wx")).close();
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const age = await fs
        .stat(lockPath)
        .then((s) => Date.now() - s.mtimeMs)
        .catch(() => 0);
      if (age > LOCK_STALE_MS) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(".local-atlas/sync-map.json is locked by another sync; try again");
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

/**
 * Replaces one world's map in the repo's sync-map file and writes it back,
 * keeping every other world and top-level field (R-14). The whole
 * read-merge-write runs under a lock, so two saves for different worlds,
 * at once or from two processes, both land. Written to a temp file and
 * renamed, so a reader never sees half a file.
 */
export async function saveWorldSyncMap(
  repoRoot: string,
  worldId: string,
  map: SyncMap,
): Promise<void> {
  const run = async () =>
    withSyncMapFileLock(repoRoot, async () => {
      const next = withWorldSyncMap(await readRepoSyncMapFile(repoRoot), worldId, map);
      const target = path.join(repoRoot, ".local-atlas", "sync-map.json");
      const tmp = `${target}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
      await fs.rename(tmp, target);
    });
  const result = inProcess.then(run, run);
  inProcess = result.catch(() => undefined);
  return result;
}
