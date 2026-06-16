import { dropOrphanFootnoteRefs, renderMarkdownBodyToSafeHtml } from "./markdownCore";
import { stripDmBlocks } from "./stripDmBlocks";

export interface RenderOpts {
  showDmNotes: boolean;
  resolveAsset?: (name: string) => string;
}

const EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;
const WIKILINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

export const DEFAULT_RESOLVE_ASSET = (n: string): string => `/atlas/assets/images/${n}`;

/** Convert Obsidian image embed syntax to standard markdown img before the wikilink pass. */
export function resolveImageEmbeds(
  md: string,
  resolveAsset: (name: string) => string = DEFAULT_RESOLVE_ASSET
): string {
  return md.replace(EMBED_RE, (_m, name: string) => {
    const clean = name.trim();
    return `![${clean}](${resolveAsset(clean)})`;
  });
}

export function renderEntityMarkdown(body: string, opts: RenderOpts): string {
  const resolveAsset = opts.resolveAsset ?? DEFAULT_RESOLVE_ASSET;

  let text = opts.showDmNotes
    ? body
    : dropOrphanFootnoteRefs(stripDmBlocks(body).text);

  // ![[image.ext]] → markdown image (resolved), before wikilink pass.
  text = resolveImageEmbeds(text, resolveAsset);

  // [[target#anchor|alias]] → styled non-navigating reference.
  // data-link holds the entity name only (no anchor) so navigation resolves the
  // entity regardless of whether the anchor exists in the rendered view.
  text = text.replace(WIKILINK_RE, (_m, target: string, alias?: string) => {
    const hashIdx = target.indexOf("#");
    const entityName = (hashIdx >= 0 ? target.slice(0, hashIdx) : target).trim();
    const label = (alias ?? target).trim();
    return `<span class="atlas-wikilink" data-link="${entityName}">${label}</span>`;
  });

  return renderMarkdownBodyToSafeHtml(text);
}
