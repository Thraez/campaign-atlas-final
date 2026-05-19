# Markdown parity with Obsidian

**North star:** for the Obsidian *core* feature set (no community plugins),
there is **no difference** between how a note renders in Obsidian's reading
view and how it renders in this atlas (DM pane, player view, published site).

"No difference" is **semantic/structural**, not a pixel clone of Obsidian's
theme. A callout looks and folds like a callout; a highlight is highlighted —
in *this app's* visual language. Matching Obsidian's own CSS is a non-goal.

This document is the human-readable boundary. Its executable counterpart is
`src/test/content/markdownCore-parity-fixture.test.ts`, which renders one
representative note exercising every in-scope construct and locks the
structure against regression. The single owner of the renderer is
`src/atlas/content/markdownCore.ts` — no other site configures `marked`.

## In scope — rendered at parity

| Construct | Syntax |
|---|---|
| Headings, paragraphs, emphasis, blockquotes | CommonMark |
| Bullet / ordered lists, nested lists | CommonMark |
| Tables, strikethrough | GFM |
| Task lists | `- [ ]` / `- [x]` (class-styled, non-interactive) |
| Fenced / inline code | CommonMark |
| **Single-newline line break** | a lone `\n` in a paragraph → `<br>`, matching Obsidian's default ("Strict line breaks" OFF) |
| Callouts | `> [!type] Title`, foldable `> [!type]-` / `> [!type]+`, full core type set + aliases |
| Highlight | `==text==` |
| Footnotes | `[^id]` ref + `[^id]:` def, numbered with backrefs |
| Wikilinks | `[[name]]`, `[[name|alias]]` |
| Image embeds | `![[name.ext]]` |
| DM-secrecy strip | `%%…%%` and `:::dm…:::` removed from player/published output before parse |

## Out of scope — explicit non-goals

These do **not** render specially. They are deliberately excluded so "no
difference" stays bounded and honest. If a request needs one of these,
treat it as a new scoped decision, not a parity bug.

| Not built | Note |
|---|---|
| Note / section embeds | `![[Note]]`, `![[Note#Heading]]`, `![[Note#^block]]`. Embeds are used for images only. |
| Math | `$…$`, `$$…$$` / KaTeX. |
| Mermaid & diagram code blocks | Rendered as plain fenced code. |
| `#tag` pills | Tags are not turned into styled pills. |
| Community-plugin syntax | Dataview, Tasks plugin queries, etc. Core only. |
| WYSIWYG / contenteditable | Markdown text remains the single source of truth. |

See also: [docs/NON_GOALS.md](NON_GOALS.md) for product-level non-goals and
the design record at
`docs/superpowers/specs/2026-05-18-obsidian-markdown-parity-design.md`.
