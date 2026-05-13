import type { ResolvedLink } from "../../src/atlas/content/schema";

const WIKILINK = /\[\[([^\[\]\|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

export interface ResolveContext {
  // Map of normalized title/alias -> entity id
  resolveByName: (name: string) => string | undefined;
}

const TOKEN_OPEN = "\u2063LINK[";
const TOKEN_CLOSE = "]\u2063";

// First pass: replace wikilinks with placeholder tokens that survive markdown
// rendering. Returns links found.
export function tokenizeWikilinks(
  body: string,
  ctx: ResolveContext
): { tokenized: string; links: ResolvedLink[] } {
  const links: ResolvedLink[] = [];
  const tokenized = body.replace(WIKILINK, (_m, target: string, display?: string) => {
    const t = target.trim();
    const d = (display ?? t).trim();
    const resolved = ctx.resolveByName(t);
    const link: ResolvedLink = {
      target: t,
      display: d,
      resolvedId: resolved,
      broken: !resolved,
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
    `${TOKEN_OPEN.replace(/[\u2063\[\]]/g, (c) => "\\" + c)}(\\d+)${TOKEN_CLOSE.replace(/[\u2063\[\]]/g, (c) => "\\" + c)}`,
    "g"
  );
  return html.replace(re, (_m, idxStr) => {
    const link = links[Number(idxStr)];
    if (!link) return "";
    const text = escapeHtml(link.display);
    if (link.broken || !link.resolvedId) {
      if (opts.hideBroken) return text;
      return `<span class="atlas-broken-link" title="Broken link: ${escapeHtml(link.target)}">${text}</span>`;
    }
    return `<a class="atlas-wikilink" data-entity-id="${escapeHtml(link.resolvedId)}" href="#/entity/${encodeURIComponent(link.resolvedId)}">${text}</a>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
