/**
 * Node side of the content-folder scan: lists and reads every `.md` under the
 * content root, depth-first in directory order, for
 * `src/atlas/content/scanContentFolder.ts` to sort into read and excluded.
 * The build and the derived-secrets scan both use it.
 */
import fs from "node:fs";
import path from "node:path";
import type { ContentFile } from "../../src/atlas/content/scanContentFolder";

/**
 * @param contentDir  the content root (globs match paths relative to it)
 * @param relativeTo  base for each file's `relPath` (titles and warnings)
 */
export function readContentFiles(contentDir: string, relativeTo: string): ContentFile[] {
  const out: ContentFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        out.push({
          contentPath: posix(path.relative(contentDir, full)),
          relPath: posix(path.relative(relativeTo, full)),
          raw: fs.readFileSync(full, "utf8"),
        });
      }
    }
  };
  if (fs.existsSync(contentDir)) walk(contentDir);
  return out;
}

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}
