/**
 * Centralized HTML sanitizer for atlas-rendered markdown.
 *
 * Why this exists:
 *   - The build pipeline turns markdown into HTML and stores it on
 *     `entity.bodyHtml`. The viewer renders this with
 *     `dangerouslySetInnerHTML`. Even though the source is "trusted" content,
 *     a stray `<script>` or `onclick=` attribute would execute against
 *     readers' browsers — a strict-no for a public lore site.
 *   - This sanitizer is INDEPENDENT from the player-safe DM stripper.
 *     `sanitizeAtlasHtml` removes injection vectors (script, event handlers,
 *     javascript: URLs) — it does NOT remove DM-only lore. That stripping
 *     happens earlier in the build pipeline.
 *
 * Usage:
 *   - Run at BUILD time on `entity.bodyHtml` so the published `atlas.json`
 *     is already clean.
 *   - Run again at RENDER time as a defense-in-depth pass before any
 *     `dangerouslySetInnerHTML` call.
 */
import DOMPurify, { type Config } from "isomorphic-dompurify";

/** Tags allowed in atlas markdown output. */
const ALLOWED_TAGS = [
  // Block + headings
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "blockquote", "pre", "hr", "br",
  "details", "summary", "section",
  // Inline emphasis
  "em", "strong", "i", "b", "u", "s", "del", "ins", "small", "sub", "sup", "mark",
  // Links
  "a",
  // Code
  "code", "kbd", "samp", "var",
  // Lists
  "ul", "ol", "li",
  // Tables
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  // Images (atlas content includes obsidian image embeds)
  "img", "figure", "figcaption",
  // Internal-link tokens emitted by build-atlas (renderLinkTokens).
  // Allowed so wikilink rendering survives sanitization.
  "span",
] as const;

const ALLOWED_ATTR = [
  "href", "title", "name", "id",
  "src", "alt", "width", "height", "loading",
  "class", "data-link", "data-id", "data-broken", "data-display", "data-callout",
  "open",
  "colspan", "rowspan", "scope", "align",
  "target", "rel",
  "lang",
];

const PURIFY_CONFIG: Config = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR,
  // No iframes/embeds/objects/forms/svg-foreignobject etc.
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "noscript"],
  FORBID_ATTR: ["style"],
  // Block javascript:, vbscript:, data: (except images), file: schemes
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|#|\/)|(?!(?:\w+:)))/i,
  // Don't keep DOM contents of disallowed elements wholesale; drop them.
  KEEP_CONTENT: true,
  // Return string, not DOM node.
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  // We don't use SVG/MathML for body content.
  USE_PROFILES: { html: true },
};

/**
 * Sanitize an HTML string for safe rendering in the atlas viewer.
 * Removes <script>, on* handlers, javascript: URLs, iframes, inline styles.
 */
export function sanitizeAtlasHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
}