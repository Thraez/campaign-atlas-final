/**
 * Folder-name → entity type inference.
 *
 * The DM's Obsidian vault is organized by folder; we use the folder name as
 * a strong hint when frontmatter is missing or imperfect. Always overridable
 * by an explicit `atlas.type` in the file's frontmatter.
 */

const FOLDER_TYPE_MAP: Record<string, string> = {
  settlements: "settlement",
  settlement: "settlement",
  regions: "region",
  region: "region",
  ruins: "ruin",
  ruin: "ruin",
  dungeons: "dungeon",
  dungeon: "dungeon",
  npcs: "npc",
  npc: "npc",
  characters: "npc",
  factions: "faction",
  faction: "faction",
  events: "event",
  event: "event",
  items: "item",
  item: "item",
  locations: "location",
  location: "location",
  maps: "map_note",
  map: "map_note",
};

/** Folders whose contents must be ignored entirely. */
export const IGNORED_FOLDERS = new Set([
  "_drafts",
  "_dm",
  "drafts",
  "archive",
  "archived",
  "deprecated",
  "templates",
  ".obsidian",
  ".trash",
]);

export function inferTypeFromPath(relPath: string): string {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  // Walk parents from closest-to-file outward — closer folders win.
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i].toLowerCase();
    if (FOLDER_TYPE_MAP[seg]) return FOLDER_TYPE_MAP[seg];
  }
  return "note";
}

export function isIgnoredPath(relPath: string): boolean {
  const segs = relPath.split(/[\\/]/).map((s) => s.toLowerCase());
  return segs.some((s) => IGNORED_FOLDERS.has(s));
}
