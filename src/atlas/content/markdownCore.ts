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
import { Marked } from "marked";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

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

function calloutExtension() {
  return {
    name: "callout",
    level: "block" as const,
    start(src: string) {
      const m = src.match(/^ {0,3}> ?\[!/m);
      return m ? m.index : undefined;
    },
    tokenizer(this: { lexer: { blockTokens: (s: string) => unknown[] } }, src: string) {
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
      this: { parser: { parse: (t: unknown[]) => string } },
      token: { calloutType: string; open: boolean; title: string; tokens: unknown[] },
    ) {
      const inner = this.parser.parse(token.tokens);
      const openAttr = token.open ? " open" : "";
      const t = token.calloutType.replace(/[^a-z0-9-]/g, "");
      return (
        `<details class="atlas-callout atlas-callout-${t}" data-callout="${t}"${openAttr}>` +
        `<summary>${token.title}</summary>${inner}</details>`
      );
    },
  };
}

const marked = new Marked({ async: false, gfm: true, breaks: false });
marked.use({ extensions: [calloutExtension()] });

/** Marked-only render. Callers that inject post-render tokens (wikilinks)
 *  use this and sanitize themselves AFTER their post-pass. */
export function markdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

/** Marked + sanitize, for callers with no post-render injection. */
export function renderMarkdownBodyToSafeHtml(md: string): string {
  return sanitizeAtlasHtml(markdownToHtml(md));
}
