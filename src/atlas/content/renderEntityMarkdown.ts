import { marked } from "marked";
import { stripDmBlocks } from "@/atlas/content/stripDmBlocks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

export interface RenderOpts {
  showDmNotes: boolean;
  resolveAsset?: (name: string) => string;
}

const EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;
const WIKILINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

export function renderEntityMarkdown(body: string, opts: RenderOpts): string {
  const resolveAsset =
    opts.resolveAsset ?? ((n: string) => `/atlas/assets/images/${n}`);

  let text = opts.showDmNotes ? body : stripDmBlocks(body).text;

  // ![[image.ext]] → markdown image (resolved), before wikilink pass.
  text = text.replace(EMBED_RE, (_m, name: string) => {
    const clean = name.trim();
    return `![${clean}](${resolveAsset(clean)})`;
  });

  // [[target|alias]] → styled non-navigating reference (alias or target text).
  // data-link is in the sanitizer's ALLOWED_ATTR list; data-target is not.
  text = text.replace(WIKILINK_RE, (_m, target: string, alias?: string) => {
    const label = (alias ?? target).trim();
    return `<span class="atlas-wikilink" data-link="${target.trim()}">${label}</span>`;
  });

  const html = marked.parse(text, { async: false }) as string;
  return sanitizeAtlasHtml(html);
}
