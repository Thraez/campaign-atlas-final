import type { ResolvedLink } from "./schema";
import { findCodeRanges, isInsideCodeRange } from "./codeRegions";

// `[[target]]` or `[[target|alias]]`. Target and alias may hold a single `[`
// or `]` (`[[Note|[the] keep]]`), never `[[`, `]]` or a line break. An empty
// alias (`[[Note|]]`) reads as no alias, and `\|` (the escaped pipe Obsidian
// writes inside tables) as a pipe: its backslash is dropped from the target.
const LINK_CHAR = String.raw`[^[\]|\n]|\[(?!\[)|\](?!\])`;
const ALIAS_CHAR = String.raw`[^[\]\n]|\[(?!\[)|\](?!\])`;
const WIKILINK = new RegExp(
  String.raw`\[\[((?:${LINK_CHAR})+?)(?:\|((?:${ALIAS_CHAR})*?))?\]\]`,
  "g"
);

export interface ResolveContext {
  // Map of normalized title/alias -> entity id
  resolveByName: (name: string) => string | undefined;
  // Fallback used only for folder-path targets (`Folder/Note`) whose full
  // string didn't resolve: resolves the trailing path segment (basename)
  // against the title/alias index, but must return undefined when that name
  // is ambiguous (owned by more than one entity) rather than guessing.
  resolveByBasename?: (basename: string) => string | undefined;
  // Player projection only: when a malformed link could name several notes,
  // a secret one wins so the link is redacted (fail closed).
  isSecret?: (id: string) => boolean;
}

const TOKEN_OPEN = "⁣LINK[";
const TOKEN_CLOSE = "]⁣";

/** Where one link sits in the string it was found in: `[start, end)`. */
export interface WikilinkSpan {
  start: number;
  end: number;
}

/** One wikilink found in a string, resolved, with its span. */
export interface FoundWikilink {
  link: ResolvedLink;
  span: WikilinkSpan;
  /** Inside a fenced code block or inline code span: shown literally, never tokenized. */
  inCode: boolean;
}

function resolveWikilink(rawTarget: string, rawDisplay: string | undefined, ctx: ResolveContext): ResolvedLink {
  const display = rawDisplay?.trim() || undefined;
  const t = rawTarget.replace(/\\$/, "").trim();
  // Heading (and block-ref) anchors: only the part before the first `#` is
  // used to resolve the note. `[[Note#Heading]]` resolves to Note (the
  // `#Heading`/`#^blockid` suffix is never used to scroll to a block —
  // explicit non-goal). `[[#Heading]]` (empty file part) is a same-note
  // anchor and is never resolved. A file name (`[[Note.md]]`) is the note.
  const hashIdx = t.indexOf("#");
  const filePart = (hashIdx === -1 ? t : t.slice(0, hashIdx)).replace(/\.md$/i, "").trim();
  const isAnchor = hashIdx === 0;
  let resolved = filePart ? ctx.resolveByName(filePart) : undefined;
  // Brackets fallback: `[[[Note]]]`, `[[Note [old]]]` and a link starting in
  // a code span (`` `[[Note` ]] ``) resolve to Note, so a link the player
  // view can't open still redacts when Note is secret. Candidates: brackets
  // and backticks dropped, then bracketed parts dropped. Fail closed: a
  // candidate that resolves to a secret note wins over the rest.
  if (/[[\]`]/.test(filePart)) {
    const squash = (s: string) => s.replace(/\s+/g, " ").trim();
    const candidates = [
      squash(filePart.replace(/[[\]`]/g, " ")),
      squash(filePart.replace(/\[[^\]]*\]?|\]|`/g, " ")),
    ].filter(Boolean);
    const ids = [resolved, ...candidates.map((c) => ctx.resolveByName(c))].filter(
      (id): id is string => !!id
    );
    resolved = ids.find((id) => ctx.isSecret?.(id)) ?? ids[0];
  }
  // Folder-path fallback: `[[Folder/Note]]` whose full string didn't
  // resolve rescues to Note via its basename, but only when unambiguous.
  if (!resolved && filePart.includes("/")) {
    const basename = filePart.slice(filePart.lastIndexOf("/") + 1).trim();
    if (basename) resolved = ctx.resolveByBasename?.(basename);
  }
  // Display text with no explicit `|alias`: a folder-path target shows only
  // its trailing segment, never the DM's private folder names — an unresolved
  // `[[02_Regions/Tidemarrow]]` must read as "Tidemarrow", not the path.
  // `link.target` still carries the full string so the player leak-scan
  // redaction regexes keep matching.
  let defaultDisplay = filePart || t.slice(1);
  if (filePart.includes("/")) {
    const trimmed = filePart.replace(/\/+$/, "");
    const seg = trimmed.slice(trimmed.lastIndexOf("/") + 1).trim();
    if (seg) defaultDisplay = seg;
  }
  return {
    target: t,
    display: (display ?? defaultDisplay).trim(),
    resolvedId: resolved,
    broken: !isAnchor && !resolved,
  };
}

/**
 * Every wikilink in `text`, in order, code included (`inCode` says which):
 * the player projection redacts links to secret notes wherever they sit.
 */
export function findWikilinks(text: string, ctx: ResolveContext): FoundWikilink[] {
  const ranges = findCodeRanges(text);
  const found: FoundWikilink[] = [];
  for (const m of text.matchAll(WIKILINK)) {
    const start = m.index ?? 0;
    found.push({
      link: resolveWikilink(m[1], m[2], ctx),
      span: { start, end: start + m[0].length },
      inCode: isInsideCodeRange(start, ranges),
    });
  }
  return found;
}

// First pass: replace wikilinks outside code with placeholder tokens that
// survive markdown rendering. Returns the links found and, at the same index,
// each link's span in `body`.
export function tokenizeWikilinks(
  body: string,
  ctx: ResolveContext
): { tokenized: string; links: ResolvedLink[]; spans: WikilinkSpan[] } {
  const links: ResolvedLink[] = [];
  const spans: WikilinkSpan[] = [];
  let tokenized = "";
  let from = 0;
  for (const f of findWikilinks(body, ctx)) {
    if (f.inCode) continue;
    tokenized += `${body.slice(from, f.span.start)}${TOKEN_OPEN}${links.length}${TOKEN_CLOSE}`;
    from = f.span.end;
    links.push(f.link);
    spans.push(f.span);
  }
  return { tokenized: tokenized + body.slice(from), links, spans };
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
      // Player output: plain text, indistinguishable from the surrounding prose.
      if (opts.hideBroken) return text;
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
