import { wrapInline, prefixLines, insertBlock, type InsertResult } from "./textareaInsert";

/**
 * Pure mapping from a toolbar action to a text/selection transform.
 * Built entirely on the textareaInsert primitives so every action is
 * deterministic and unit-testable with no DOM. The React toolbar is a thin
 * shell over this — see FormatToolbar.tsx / EntityEditPanel wiring.
 */
export type ToolbarActionId =
  | "bold"
  | "italic"
  | "highlight"
  | "wikilink"
  | "footnote"
  | "codeblock"
  | "heading"
  | "list"
  | "quote"
  | "task"
  | "callout"
  | "table"
  | "template:npc"
  | "template:location"
  | "template:secrets"
  | "template:readaloud";

const TABLE_SKELETON = "| Column | Column |\n| --- | --- |\n| Cell | Cell |";

// Entry templates — plain Obsidian markdown so they round-trip to a vault.
// Shapes follow Lazy Dungeon Master / WotC published-adventure structure.
const TEMPLATE_NPC = [
  "## NPC Name",
  "",
  "**Appearance:** ",
  "",
  "**Trait / Mannerism:** ",
  "",
  "**Goal:** ",
  "",
  "**Secret:** ",
  "",
  "### Notes",
  "",
].join("\n");

const TEMPLATE_LOCATION = [
  "## Location Name",
  "",
  "**Description:** ",
  "",
  "**Atmosphere:** ",
  "",
  "**Key features:**",
  "- ",
  "",
  "### Secrets & discoveries",
  "",
  "- ",
  "",
  "### NPCs present",
  "",
].join("\n");

const TEMPLATE_SECRETS = [
  "## Secrets & Clues",
  "",
  "- ",
  "- ",
  "- ",
  "- ",
  "- ",
  "- ",
  "- ",
  "- ",
  "- ",
  "- ",
].join("\n");

// Renders as a visually distinct callout block — matches how WotC marks read-aloud text.
const TEMPLATE_READALOUD = "> [!quote] Read aloud\n> ";

export function applyToolbarAction(
  id: ToolbarActionId,
  value: string,
  selStart: number,
  selEnd: number,
  calloutType = "note",
): InsertResult {
  switch (id) {
    case "bold":
      return wrapInline(value, selStart, selEnd, "**", "**");
    case "italic":
      return wrapInline(value, selStart, selEnd, "*", "*");
    case "highlight":
      return wrapInline(value, selStart, selEnd, "==", "==");
    case "wikilink":
      return wrapInline(value, selStart, selEnd, "[[", "]]", "page");
    case "footnote":
      return wrapInline(value, selStart, selEnd, "[^", "]", "1");
    case "codeblock":
      return wrapInline(value, selStart, selEnd, "```\n", "\n```", "code");
    case "heading":
      return prefixLines(value, selStart, selEnd, "## ");
    case "list":
      return prefixLines(value, selStart, selEnd, "- ");
    case "quote":
      return prefixLines(value, selStart, selEnd, "> ");
    case "task":
      return prefixLines(value, selStart, selEnd, "- [ ] ");
    case "callout":
      return insertBlock(value, selStart, `> [!${calloutType}] Title\n> text`);
    case "table":
      return insertBlock(value, selStart, TABLE_SKELETON);
    case "template:npc":
      return insertBlock(value, selStart, TEMPLATE_NPC);
    case "template:location":
      return insertBlock(value, selStart, TEMPLATE_LOCATION);
    case "template:secrets":
      return insertBlock(value, selStart, TEMPLATE_SECRETS);
    case "template:readaloud":
      return insertBlock(value, selStart, TEMPLATE_READALOUD);
  }
}
