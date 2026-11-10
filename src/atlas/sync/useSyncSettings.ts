import { readSyncMapFile, type SyncMap, type SyncMapFile } from "@/atlas/import/syncMap";

export interface SyncSettings {
  vaultPath?: string;
  /** Top-level vault folders the DM draws from. Empty/absent = the whole vault. */
  candidateFolders?: string[];
  ignoreGlobs?: string[];
  lastSyncAt?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<void> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`POST ${url} failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
}

export async function loadSettings(): Promise<SyncSettings> {
  const data = await getJson<SyncSettings>("/__atlas/local/editor-settings.json");
  return data ?? {};
}

export async function saveSettings(settings: SyncSettings): Promise<void> {
  await postJson("/__atlas/local-write", {
    name: "editor-settings.json",
    contents: JSON.stringify(settings, null, 2),
  });
}

/**
 * The sync-map file, every world's map (R-14). The dev server serves it
 * already per world (an old flat map read as the default world's), so an old
 * shape here throws. A failed read throws too: Sync writes the file back, so
 * reading a broken map as empty would wipe every world's entries.
 */
export async function loadSyncMapFile(): Promise<SyncMapFile> {
  const resp = await fetch("/__atlas/local/sync-map.json");
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Could not read the sync map (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
  return readSyncMapFile(await resp.json(), null);
}

/**
 * Saves one world's sync map. The dev server merges it into the file under a
 * lock, keeping every other world, so saves for two worlds never lose one.
 */
export async function saveWorldSyncMap(worldId: string, map: SyncMap): Promise<void> {
  await postJson("/__atlas/local/sync-map/world", { worldId, map });
}
