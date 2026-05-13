import type { AtlasProject } from "./schema";

let cache: AtlasProject | null = null;

export async function loadAtlasContent(force = false): Promise<AtlasProject> {
  if (cache && !force) return cache;
  const res = await fetch("/atlas/atlas.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load atlas.json: ${res.status}`);
  cache = (await res.json()) as AtlasProject;
  return cache;
}

export interface SearchIndexEntry {
  id: string;
  title: string;
  type: string;
  aliases: string[];
  tags: string[];
  summary?: string;
  excerpt?: string;
}

export async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  const res = await fetch("/atlas/search-index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load search-index.json: ${res.status}`);
  return res.json();
}
