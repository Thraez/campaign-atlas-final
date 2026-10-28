/**
 * Small file helpers shared by the dev optimizers (optimize-images.ts,
 * optimize-maps.ts), so the walk and the regex escaping live in one place.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Escape a literal string for use inside a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every file under the given roots that `accept(dir, name)` keeps. A root that
 * does not exist or cannot be read is skipped, not an error.
 */
export function findFiles(
  rootDirs: string[],
  accept: (dir: string, name: string) => boolean,
): string[] {
  const found: string[] = [];
  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && accept(dir, e.name)) found.push(full);
    }
  }
  for (const root of rootDirs) walk(root);
  return found;
}
