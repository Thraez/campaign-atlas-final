import type { SyncMap } from "@/atlas/import/syncMap";

export interface SyncSettings {
  vaultPath?: string;
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
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export async function loadSyncMap(): Promise<SyncMap> {
  const data = await getJson<SyncMap>("/__atlas/local/sync-map.json");
  return data ?? {};
}

export async function saveSyncMap(syncMap: SyncMap): Promise<void> {
  await postJson("/__atlas/local-write", {
    name: "sync-map.json",
    contents: JSON.stringify(syncMap, null, 2),
  });
}
