import type { ResolvedLink } from "./schema";

const WIKILINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]/g;

export interface ResolveContext {
  // Map of normalized title/alias -> entity id
  resolveByName: (name: string) => string | undefined;
}

const TOKEN_OPEN = "⁣LINK[";
const TOKEN_CLOSE = "]⁣";

// First pass: replace wikilinks with placeholder tokens that survive markdown
// rendering. Returns links found.
export function tokenizeWikilinks(
  body: string,
  ctx: ResolveContext
): { tokenized: string; links: ResolvedLink[] } {
  const links: ResolvedLink[] = [];
  const tokenized = body.replace(WIKILINK, (_m, target: string, display?: string) => {
    const t = target.trim();
    // Heading (and block-ref) anchors: only the part before the first `#` is
    // used to resolve the note. `[[Note#Heading]]` resolves to Note (the
    // `#Heading`/`#^blockid` suffix is never used to scroll to a block —
    // explicit non-goal). `[[#Heading]]` (empty file part) is a same-note
    // anchor and is never resolved.
    const hashIdx = t.indexOf("#");
    const filePart = hashIdx === -1 ? t : t.slice(0, hashIdx).trim();
    const isAnchor = hashIdx === 0;
    const resolved = filePart ? ctx.resolveByName(filePart) : undefined;
    const d = (display ?? (filePart || t.slice(1))).trim();
    const link: ResolvedLink = {
      target: t,
      display: d,
      resolvedId: resolved,
      broken: !isAnchor && !resolved,
    };
    links.push(link);
    const idx = links.length - 1;
    return `${TOKEN_OPEN}${idx}${TOKEN_CLOSE}`;
  });
  return { tokenized, links };
}

// Second pass (after HTML render): replace tokens with anchor tags.
// In player builds, broken links must not leak the original target text — pass
// `{ hideBroken: true }` to render them as plain display text instead.
export function renderLinkTokens(
  html: string,
  links: ResolvedLink[],
  opts: { hideBroken?: boolean } = {}
): string {
  const re = new RegExp(
    `${TOKEN_OPEN.replace(/[⁣[\]]/g, (c) => "\\" + c)}(\\d+)${TOKEN_CLOSE.replace(/[⁣[\]]/g, (c) => "\\" + c)}`,
    "g"
  );
  return html.replace(re, (_m, idxStr) => {
    const link = links[Number(idxStr)];
    if (!link) return "";
    const text = escapeHtml(link.display);
    if (link.target.startsWith("#")) {
      return `<span class="atlas-wikilink-anchor">${text}</span>`;
    }
    if (link.broken || !link.resolvedId) {
      if (opts.hideBroken) return `<span class="atlas-planned-link-player">${text}</span>`;
      return `<span class="atlas-planned-link" title="Planned link: ${escapeHtml(link.target)}">${text}</span>`;
    }
    return `<a class="atlas-wikilink" data-entity-id="${escapeHtml(link.resolvedId)}" href="#/entity/${encodeURIComponent(link.resolvedId)}" aria-haspopup="dialog">${text}</a>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
