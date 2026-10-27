/**
 * Which images the player site actually shows. An image counts as shown when
 * the player JSON names it, by path or as a bare `![[name]]` embed. The player
 * build prunes everything else, and the image-privacy scan uses the same rule
 * on the source asset store.
 */
import fs from "node:fs";
import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export function isReferenced(fileName: string, playerJson: string): boolean {
  return playerJson.includes(fileName) || playerJson.includes(encodeURIComponent(fileName));
}

/** The text of every `.json` file directly in `dir` (atlas.json, search-index.json). */
export function readPlayerJson(dir: string): string {
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => fs.readFileSync(path.join(dir, n), "utf8"))
    .join("\n");
}
