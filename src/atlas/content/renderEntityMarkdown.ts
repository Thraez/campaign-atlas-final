import { dropOrphanFootnoteRefs, renderMarkdownBodyToSafeHtml } from "./markdownCore";
import { stripDmBlocks } from "./stripDmBlocks";
import { replaceOutsideCode } from "./codeRegions";

export interface RenderOpts {
  showDmNotes: boolean;
  resolveAsset?: (name: string) => string;
}

const EMBED_RE = /!\[\[([^[\]\n]+?)\]\]/g;
const WIKILINK_RE = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export const DEFAULT_RESOLVE_ASSET = (n: string): string => `/atlas/assets/images/${n}`;

/** Convert Obsidian image embed syntax to standard markdown img before the wikilink pass.
 *  Handles the optional pipe-alias: ![[image.png|Alt text]] → ![Alt text](resolved/image.png)
 *  Non-image embeds (e.g. ![[Some Note]], ![[doc.pdf]]) are not transclusion — Obsidian note
 *  embedding is an explicit non-goal — so they render an inert placeholder instead of a
 *  broken <img> pointing at a note or document that was never an image asset.
 */
export function resolveImageEmbeds(
  md: string,
  resolveAsset: (name: string) => string = DEFAULT_RESOLVE_ASSET
): string {
  return replaceOutsideCode(md, EMBED_RE, (...args: unknown[]) => {
    const name = args[1] as string;
    const pipeIdx = name.indexOf("|");
    const filename = (pipeIdx >= 0 ? name.slice(0, pipeIdx) : name).trim();
    const alt = (pipeIdx >= 0 ? name.slice(pipeIdx + 1) : name).trim();
    if (!IMAGE_EXT_RE.test(filename)) {
      return `<span class="atlas-embed-missing">embedded note not shown</span>`;
    }
    return `![${alt}](${resolveAsset(filename)})`;
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
