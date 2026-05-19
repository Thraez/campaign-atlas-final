/**
 * The single owner of the `marked` instance and its extensions.
 *
 * Every surface (reading view, DM editing pane, player projection, published
 * build) renders markdown through this module so the SAME markdown produces
 * the SAME HTML everywhere — there is no second `marked` configuration.
 * Obsidian-parity extensions (callouts, etc.) are registered here once.
 *
 * NOTE: Existing call sites in `renderEntityMarkdown.ts` and `EntityPanes.tsx`
 * are migrated to this module in Phase 0 Tasks 0.2–0.3 of the implementation plan.
 *
 * Secrecy is NOT handled here: `stripDmBlocks`/`%%` runs in the caller BEFORE
 * this module sees the text, so DM-only content never reaches the renderer.
 */
import { Marked, type Token } from "marked";
import { sanitizeAtlasHtml } from "../sanitizeHtml";

const CALLOUT_BLOCK =
  /^ {0,3}> ?\[!(\w+)\]([+-]?)(.*)(?:\n|$)((?:^ {0,3}> ?.*(?:\n|$))*)/m;

const CALLOUT_TITLES: Record<string, string> = {
  note: "Note", info: "Info", tip: "Tip", hint: "Tip", important: "Important",
  success: "Success", check: "Success", done: "Success",
  question: "Question", help: "Question", faq: "Question",
  warning: "Warning", caution: "Warning", attention: "Warning",
  failure: "Failure", fail: "Failure", missing: "Failure",
  danger: "Danger", error: "Error", bug: "Bug",
  example: "Example", quote: "Quote", cite: "Quote",
  abstract: "Abstract", summary: "Abstract", tldr: "Abstract", todo: "Todo",
};

function highlightExtension() {
  const HIGHLIGHT_RE = /^==([^=\n]+?)==/;
  return {
    name: "highlight",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("==");
    },
    tokenizer(this: { lexer: { inlineTokens: (s: string) => Token[] } }, src: string) {
      const m = HIGHLIGHT_RE.exec(src);
      if (!m) return undefined;
      return {
        type: "highlight",
        raw: m[0],
        text: m[1],
        tokens: this.lexer.inlineTokens(m[1]),
      };
    },
    renderer(
      this: { parser: { parseInline: (t: Token[]) => string } },
      token: { text: string; tokens: Token[] },
    ) {
      return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
    },
  };
}

function calloutExtension() {
  return {
    name: "callout",
    level: "block" as const,
    start(src: string) {
      const m = src.match(/^ {0,3}> ?\[!/m);
      return m ? m.index : undefined;
    },
    tokenizer(this: { lexer: { blockTokens: (s: string) => Token[] } }, src: string) {
      const m = CALLOUT_BLOCK.exec(src);
      if (!m || m.index !== 0) return undefined;
      const [raw, typeRaw, fold, titleRaw, bodyRaw] = m;
      const type = typeRaw.toLowerCase();
      const title =
        titleRaw.trim() || CALLOUT_TITLES[type] ||
        type.charAt(0).toUpperCase() + type.slice(1);
      // Strip the leading "> " from each body line.
      const body = (bodyRaw ?? "")
        .split("\n")
        .map((l) => l.replace(/^ {0,3}> ?/, ""))
        .join("\n")
        .trim();
      return {
        type: "callout",
        raw,
        calloutType: type,
        open: fold !== "-",
        title,
        tokens: this.lexer.blockTokens(body),
      };
    },
    renderer(
      this: { parser: { parse: (t: Token[]) => string } },
      token: { calloutType: string; open: boolean; title: string; tokens: Token[] },
    ) {
      const inner = this.parser.parse(token.tokens);
      const openAttr = token.open ? " open" : "";
      const t = token.calloutType.replace(/[^a-z0-9-]/g, "");
      const title = token.title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return (
        `<details class="atlas-callout atlas-callout-${t}" data-callout="${t}"${openAttr}>` +
        `<summary>${title}</summary>${inner}</details>`
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Footnote extension  [^id]: def  +  [^id] ref
//
// State is module-level and reset per parse via hooks.preprocess.
// Safe because marked runs synchronously (async: false).
// ---------------------------------------------------------------------------

let _fnRefOrder = new Map<string, number>();
let _fnDefs = new Map<string, string>();
let _fnCounter = 0;

const FN_DEF_RE = /^\[\^([^\]]+)\]: *(.*)/;
const FN_REF_RE = /^\[\^([^\]\s]+)\](?!:)/;

function footnoteDefExtension() {
  return {
    name: "footnote-def",
    level: "block" as const,
    start(src: string) {
      return src.match(/^\[\^[^\]]+\]:/m)?.index;
    },
    tokenizer(
      this: { lexer: { inlineTokens: (s: string) => Token[] } },
      src: string,
    ) {
      const m = src.match(FN_DEF_RE);
      if (!m || m.index !== 0) return undefined;
      return {
        type: "footnote-def",
        raw: m[0],
        id: m[1],
        tokens: this.lexer.inlineTokens(m[2].trim()),
      };
    },
    renderer(
      this: { parser: { parseInline: (t: Token[]) => string } },
      token: { id: string; tokens: Token[] },
    ) {
      _fnDefs.set(token.id, this.parser.parseInline(token.tokens));
      return "";
    },
  };
}

function footnoteRefExtension() {
  return {
    name: "footnote-ref",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("[^");
    },
    tokenizer(src: string) {
      const m = src.match(FN_REF_RE);
      if (!m) return undefined;
      return { type: "footnote-ref", raw: m[0], id: m[1] };
    },
    renderer(token: { id: string }) {
      const n = _fnRefOrder.get(token.id);
      if (n === undefined) return "";
      return `<sup><a id="fnref-${token.id}" href="#fn-${token.id}" class="footnote-ref">[${n}]</a></sup>`;
    },
  };
}

// ---------------------------------------------------------------------------
// Marked instance
// ---------------------------------------------------------------------------

// breaks:true — Obsidian reading view (default "Strict line breaks" OFF)
// renders a single newline as a hard line break. Parity requires the same.
const marked = new Marked({ async: false, gfm: true, breaks: true });
marked.use({ extensions: [calloutExtension(), highlightExtension()] });

marked.use({
  extensions: [footnoteDefExtension(), footnoteRefExtension()],

  walkTokens(token: Token) {
    if ((token as { type: string }).type === "footnote-ref") {
      const id = (token as unknown as { id: string }).id;
      if (!_fnRefOrder.has(id)) {
        _fnCounter++;
        _fnRefOrder.set(id, _fnCounter);
      }
    }
  },

  hooks: {
    preprocess(src: string) {
      _fnRefOrder = new Map();
      _fnDefs = new Map();
      _fnCounter = 0;
      return src;
    },
    postprocess(html: string) {
      if (_fnDefs.size === 0) return html;
      const orderedIds = [..._fnRefOrder.keys()].filter((id) => _fnDefs.has(id));
      const extraIds = [..._fnDefs.keys()].filter((id) => !_fnRefOrder.has(id));
      const items = [...orderedIds, ...extraIds]
        .map((id) => {
          const content = _fnDefs.get(id)!;
          const backref = `<a href="#fnref-${id}" class="footnote-backref">↩</a>`;
          return `<li id="fn-${id}"><p>${content} ${backref}</p></li>`;
        })
        .join("\n");
      return `${html}<section class="footnotes"><ol>\n${items}\n</ol></section>\n`;
    },
  },
});

// Task-list: class-based rendering instead of <input type="checkbox">.
// marked v18 emits a "checkbox" token inside each task listitem.
// Suppress it here; CSS ::before provides the visual indicator.
marked.use({
  renderer: {
    checkbox(): string {
      return "";
    },
    listitem(
      this: { parser: { parse: (t: Token[], top?: boolean) => string } },
      token: { task: boolean; checked?: boolean; loose: boolean; tokens: Token[] },
    ): string | false {
      if (!token.task) return false;
      const cls = token.checked
        ? "atlas-task-item atlas-task-done"
        : "atlas-task-item";
      const body = this.parser.parse(token.tokens, !!token.loose);
      return `<li class="${cls}">${body}</li>\n`;
    },
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Remove [^id] references whose definitions are absent from the text.
 * Call after DM-block strip on player-path text so footnote defs stripped
 * with their %% block don't leave dangling superscripts in player output.
 */
export function dropOrphanFootnoteRefs(md: string): string {
  const defined = new Set<string>();
  for (const m of md.matchAll(/^\[\^([^\]]+)\]:/gm)) {
    defined.add(m[1]);
  }
  return md.replace(/\[\^([^\]\s]+)\](?!:)/g, (match, id) =>
    defined.has(id) ? match : "",
  );
}

/** Marked-only render. Callers that inject post-render tokens (wikilinks)
 *  use this and sanitize themselves AFTER their post-pass. */
export function markdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

/** Marked + sanitize, for callers with no post-render injection. */
export function renderMarkdownBodyToSafeHtml(md: string): string {
  return sanitizeAtlasHtml(markdownToHtml(md));
}
