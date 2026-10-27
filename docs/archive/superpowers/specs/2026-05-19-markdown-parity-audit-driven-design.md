# Spec 1 — Audit-driven markdown parity (Phase 2/3 distilled)

**Date:** 2026-05-19
**Status:** Approved design, ready for implementation plan
**Independent:** Yes — disjoint files from Spec 2/3, runs in parallel.

## Background

Phase 0+1 (shared `markdownCore`, callouts) shipped in PR #28. Phases 2 and 3
were nominally "highlights + footnotes + task checkboxes" then "residual parity
audit". An empirical scan of the user's actual Obsidian vault (863 `.md` files)
reordered priorities:

| Construct | Total | Files | Verdict |
|---|---|---|---|
| `[[wikilink]]` | 8483 | 507 | already done |
| `[[Note#Heading]]` / `[[#Heading]]` | 55 | 13 | **broken — renders raw dead text** |
| `==highlight==` | 10 | 4 | all Excalidraw-plugin noise, 0 authored — but user wants it for future |
| footnotes `[^id]` | ~10 | 1–2 | **out of scope** (user decision) |
| task-list `[ ]`/`[x]` | 229 | 24 | renders as plain bullets today (`<input>` in `FORBID_TAGS`); acceptable, **out of scope** |
| strikethrough / math / mermaid | 0 | 0 | n/a |

Conclusion: the highest-value work is the anchor-wikilink rendering gap, not the
nominal Phase 2 feature set.

## Scope

Two source-side fixes. **No sanitizer change** (`<mark>` already in
`ALLOWED_TAGS`; the anchor fix only changes a display string).

### 1a. Heading/anchor wikilink rendering

`src/atlas/content/renderEntityMarkdown.ts:26` — `WIKILINK_RE` currently
captures `Note#Heading` as one target, producing
`<span class="atlas-wikilink" data-link="Note#Heading">Note#Heading</span>` —
an ugly, dead reference.

Fix: split the captured target on the first `#` into `file` / `anchor`.

| Input | Label shown | `data-link` | Extra |
|---|---|---|---|
| `[[Note#Heading]]` | `Note` | `Note` | — |
| `[[Note#Heading\|Alias]]` | `Alias` | `Note` | — |
| `[[#Heading]]` (same-page) | `Heading` | `` (empty) | add class `atlas-wikilink-anchor` so styling can distinguish a section ref from an entity link |
| `[[Note]]` (no anchor) | `Note` | `Note` | unchanged behaviour |

Behaviour stays a **non-navigating span**, consistent with the existing
wikilink design (the atlas does not resolve cross-entity navigation in body
text today; this spec does not change that).

### 1b. `==highlight==` → `<mark>`

Add an inline `marked` extension in `src/atlas/content/markdownCore.ts`
alongside `calloutExtension`. Emits `<mark>…</mark>`.

- `<mark>` is already in `ALLOWED_TAGS` (`sanitizeHtml.ts:30`) — zero sanitizer
  change.
- Tokenizer must not match inside code spans or across newlines. Pattern:
  non-greedy, requires non-`=` boundary content, single-line:
  `==(?=\S)([^=\n]|=(?!=))+?(?<=\S)==` (final form decided in plan; intent:
  no empty `====`, no multi-line, `=` allowed singly inside).
- Inline level so it composes with bold/italic/links.

## Files touched

- `src/atlas/content/renderEntityMarkdown.ts` — anchor split in the
  `WIKILINK_RE` replace callback.
- `src/atlas/content/markdownCore.ts` — register `highlightExtension`.
- `src/test/content/markdownCore.test.ts` — highlight render, code-span
  safety, multi-line non-match, determinism.
- `src/test/content/renderEntityMarkdown.test.ts` — the four anchor-link
  rows above.
- Possibly `src/index.css` — optional `.atlas-wikilink-anchor` styling
  (cosmetic, low priority; can be a follow-up).

## Test plan

- Unit: extend the two existing test files (cases enumerated above).
- Determinism guarantee preserved (same markdown → same HTML everywhere).
- Secrecy unchanged: strip-before-parse order untouched; add one regression
  test that a `==highlight==` inside a `%%DM%%` block does not survive a
  player render.
- `npm test` green (was 700/700).
- `npm run atlas:publish` — secret + derived scans clean.

## Out of scope (explicit)

Footnotes, task-list checkboxes, image `|size` syntax, Excalidraw constructs.
Documented as deliberately deferred per user decision 2026-05-19.

## Risk

Low. Both changes are isolated to well-tested pure functions with existing
coverage.
