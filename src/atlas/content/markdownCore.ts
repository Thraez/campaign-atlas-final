/**
 * The single owner of the `marked` instance and its extensions.
 *
 * Every surface (reading view, DM editing pane, player projection, published
 * build) renders markdown through this module so the SAME markdown produces
 * the SAME HTML everywhere — there is no second `marked` configuration.
 * Obsidian-parity extensions (callouts, etc.) are registered here once.
 *
 * Secrecy is NOT handled here: `stripDmBlocks`/`%%` runs in the caller BEFORE
 * this module sees the text, so DM-only content never reaches the renderer.
 */
import { Marked } from "marked";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

const marked = new Marked({ gfm: true, breaks: false });

/** Marked-only render. Callers that inject post-render tokens (wikilinks)
 *  use this and sanitize themselves AFTER their post-pass. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Marked + sanitize, for callers with no post-render injection. */
export function renderMarkdownBodyToSafeHtml(md: string): string {
  return sanitizeAtlasHtml(markdownToHtml(md));
}
