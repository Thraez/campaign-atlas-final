import type { AtlasProject } from "./schema";

let cache: AtlasProject | null = null;

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
const url = (file: string) => `${BASE}atlas/${file}`;

export async function loadAtlasContent(force = false): Promise<AtlasProject> {
  if (cache && !force) return cache;
  const res = await fetch(url("atlas.json"), { cache: "no-cache" });
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
  body?: string;        // lowercased plain-text body for full-text search
  bodyText?: string;   // original-case plain-text body for display (snippets)
  dateRaw?: string;
  dateValue?: number;
  dateYear?: number;
}

export async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  const res = await fetch(url("search-index.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load search-index.json: ${res.status}`);
  return res.json();
}
