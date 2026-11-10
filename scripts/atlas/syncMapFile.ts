/**
 * Node reader for `.local-atlas/sync-map.json` as a per-world file (R-14;
 * shape and rules in `src/atlas/import/syncMap.ts`). An old flat map belongs
 * to the DM build's world when `.local-atlas/atlas.json` has exactly one, and
 * is refused otherwise. Used by the CLI's port
 * (`fsVaultPort.ts`) and by the dev server's GET route for the editor.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isLegacySyncMap,
  legacySyncMapWorld,
  readSyncMapFile,
  withWorldSyncMap,
  type SyncMap,
  type SyncMapFile,
} from "../../src/atlas/import/syncMap";

/**
 * The world ids in the DM build (`.local-atlas/atlas.json`), or null when
 * there is no build or it can't be read.
 */
export async function readDmWorldIds(repoRoot: string): Promise<string[] | null> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(repoRoot, ".local-atlas", "atlas.json"), "utf8"),
    );
    const list = (parsed as { worlds?: unknown } | null)?.worlds;
    if (!Array.isArray(list)) return null;
    return list.flatMap((w: unknown) => {
      const id = (w as { id?: unknown } | null)?.id;
      return typeof id === "string" && id ? [id] : [];
    });
  } catch {
    return null;
  }
}

/**
 * The repo's sync-map file. Missing reads as empty; a file that isn't valid
 * JSON, or an old flat map when the DM build hasn't exactly one world, throws, so a
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
  // Only an old flat map needs the DM build, to learn which world it belongs to.
  const legacyWorld = isLegacySyncMap(raw)
    ? legacySyncMapWorld(await readDmWorldIds(repoRoot))
    : null;
  return readSyncMapFile(raw, legacyWorld);
}

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 25;

/** Serializes sync-map writes inside this process (the dev server, the CLI). */
let inProcess: Promise<unknown> = Promise.resolve();

/**
 * Removes a lock left behind by a dead process. It is moved aside first and
 * checked: if what was moved isn't the stale lock that was read (another
 * waiter cleared it and took a fresh one in between), it is put back, so a
 * live holder's lock is never deleted.
 */
async function clearStaleLock(lockPath: string): Promise<void> {
  const seen = await fs.readFile(lockPath, "utf8").catch(() => null);
  if (seen === null) return;
  const aside = `${lockPath}.${process.pid}.${randomUUID()}.stale`;
  try {
    await fs.rename(lockPath, aside);
  } catch {
    return; // someone else moved it first
  }
  const moved = await fs.readFile(aside, "utf8").catch(() => null);
  if (moved !== seen) await fs.link(aside, lockPath).catch(() => undefined);
  await fs.rm(aside, { force: true });
}

/**
 * Runs `fn` holding `.local-atlas/sync-map.json.lock`, an exclusive lock file,
 * so the dev server and `npm run atlas:sync` never interleave a
 * read-merge-write. A lock older than 30 s is taken as left behind by a dead
 * process. Gives up after 10 s. The lock holds a token (pid plus random), and
 * is removed only while it still holds ours, so a holder that ran past 30 s
 * never deletes a lock another process has since taken over.
 */
async function withSyncMapFileLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.join(repoRoot, ".local-atlas", "sync-map.json.lock");
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const token = `${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(token, "utf8");
      } finally {
        await handle.close();
      }
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const age = await fs
        .stat(lockPath)
        .then((s) => Date.now() - s.mtimeMs)
        .catch(() => 0);
      if (age > LOCK_STALE_MS) {
        await clearStaleLock(lockPath);
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
    const held = await fs.readFile(lockPath, "utf8").catch(() => null);
    if (held === token) await fs.rm(lockPath, { force: true });
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
