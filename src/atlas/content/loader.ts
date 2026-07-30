import type { AtlasProject } from "./schema";
import { parseAtlasProject, parseSearchIndex } from "./atlasGuard";

let cache: AtlasProject | null = null;

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
const url = (file: string) => `${BASE}atlas/${file}`;

export async function loadAtlasContent(force = false): Promise<AtlasProject> {
  if (cache && !force) return cache;
  const res = await fetch(url("atlas.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load atlas.json: ${res.status}`);
  // Validate at the boundary: a stale/corrupt artifact fails here with an
  // actionable message instead of crashing deep in a consumer.
  cache = parseAtlasProject(await res.json(), "atlas.json");
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
  body?: string;        // lowercased plain-text body for full-text search (derived from bodyText on load, not shipped)
  bodyText?: string;   // original-case plain-text body for display (snippets) — the shipped field
  dateRaw?: string;
  dateValue?: number;
  dateYear?: number;
}

export async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  const res = await fetch(url("search-index.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load search-index.json: ${res.status}`);
  const entries = parseSearchIndex(await res.json(), "search-index.json");
  // body (lowercased, for matching) is derived here rather than shipped — the
  // artifact only carries bodyText (original case, for snippets).
  return entries.map((e) => (e.bodyText ? { ...e, body: e.bodyText.toLowerCase() } : e));
}
