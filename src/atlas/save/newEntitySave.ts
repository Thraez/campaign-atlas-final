// src/atlas/save/newEntitySave.ts
import type { FileChange } from "@/atlas/save/localFsSave";
import { stringifyFrontmatter } from "@/atlas/import/frontmatter";
import { CATEGORIES, type CategoryId } from "@/atlas/content/entityCategory";
import type { EntityVisibility } from "@/atlas/content/schema";

const DEFAULT_KIND: Record<CategoryId, string> = {
  characters: "npc",
  locations: "settlement",
  factions: "faction",
  events: "event",
  items: "item",
  lore: "lore",
};

export function slugify(title: string): string {
  return title.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface NewEntityInput {
  worldRoot: string;          // e.g. "content/astrath-deeprealm"
  category: CategoryId;
  title: string;
  summary?: string;
  visibility: EntityVisibility;
  kind?: string;              // granular type; defaults from category
}

export function buildNewEntityChange(input: NewEntityInput): FileChange {
  const meta = CATEGORIES.find((c) => c.id === input.category)!;
  const type = (input.kind ?? DEFAULT_KIND[input.category]).trim();
  const slug = slugify(input.title);
  const path = `${input.worldRoot}/${meta.folder}/${slug}.md`;
  const data: Record<string, unknown> = {
    title: input.title,
    type,
    visibility: input.visibility,
  };
  if (input.summary) data.summary = input.summary;
  const content = stringifyFrontmatter(`\n# ${input.title}\n\n`, data);
  return { path, content, kind: "entity-md", baseHash: null };
}
