import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";

export interface AtlasFieldPatch {
  id?: string;
  type?: string;
  visibility?: string;
  summary?: string;
  tagsAdd?: string[];
}

function normaliseTags(existing: unknown): string[] {
  if (Array.isArray(existing)) return existing.filter((t): t is string => typeof t === "string");
  if (typeof existing === "string" && existing.trim()) return [existing.trim()];
  return [];
}

export function rewriteFrontmatter(rawFile: string, patch: AtlasFieldPatch): string {
  const { data, content } = parseFrontmatter(rawFile);

  const atlas: Record<string, unknown> = {
    ...((data.atlas as Record<string, unknown>) ?? {}),
  };
  if (patch.id !== undefined) atlas.id = patch.id;
  if (patch.type !== undefined) atlas.type = patch.type;
  if (patch.visibility !== undefined) atlas.visibility = patch.visibility;
  if (patch.summary !== undefined) atlas.summary = patch.summary;

  const next: Record<string, unknown> = { ...data, atlas };

  if (patch.tagsAdd && patch.tagsAdd.length > 0) {
    const tags = normaliseTags(data.tags);
    for (const t of patch.tagsAdd) {
      if (typeof t === "string" && t && !tags.includes(t)) tags.push(t);
    }
    next.tags = tags;
  }

  return stringifyFrontmatter(content, next);
}
