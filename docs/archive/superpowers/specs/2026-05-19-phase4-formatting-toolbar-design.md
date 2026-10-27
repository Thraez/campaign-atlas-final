# Spec 2 — Phase 4: DM editor formatting toolbar + entry templates

**Date:** 2026-05-19
**Status:** Approved design, ready for implementation plan
**Lane:** B, runs **before** Spec 3 (builds the shared textarea util Spec 3 reuses).

## Goal

Give the DM a formatting toolbar above the entity body editor so common
Obsidian markdown and reusable entry skeletons can be inserted without typing
syntax by hand.

## Where it lives

`src/atlas/categories/EntityEditPanel.tsx` — the body `<textarea>` is at
lines 153–159, value `d.body`, change handler `api.setBody(e.target.value)`
(`useEntityEditDraft.ts`). New component `<BodyToolbar>` renders directly above
that `<textarea>`.

Editor-only by construction: `EntityEditPanel` is inside the
`AtlasPlacementEditor` lazy chunk, which is gated by `__INCLUDE_EDITOR__`
(`src/App.tsx:14`) and tree-shaken from player builds. No new player-bundle
surface. The implementation must not add any import that pulls editor code into
a player entry point.

## Mechanism

A shared utility `src/atlas/editor/textareaInsert.ts`:

- `wrapSelection(value, selStart, selEnd, prefix, suffix)` → `{ value, selStart, selEnd }`
- `insertAtCursor(value, selStart, snippet)` → `{ value, caret }`
- Pure functions, no React — independently unit-testable. **Spec 3 depends on
  this module.**

`<BodyToolbar>` holds a `ref` to the textarea, reads
`selectionStart`/`selectionEnd`, calls the util, pushes the result through
`api.setBody(...)`, then restores selection/caret in a `useLayoutEffect` /
`requestAnimationFrame` (React controlled-value re-render loses native caret).

No new dependencies. Plain DOM + existing state hook.

## Buttons

**Group 1 — wrap selection:**
Bold `**` · Italic `*` · Highlight `==` · Strikethrough `~~` ·
Inline code `` ` `` · Wikilink `[[ ]]` (caret between brackets if no
selection) · Callout (prefixes selected lines / inserts `> [!note] ` block)

**Group 2 — insert template at cursor:**
Lazy-DM NPC · Location · Secrets list · Read-aloud box

## Template contents

Stored as a constants module `src/atlas/editor/bodyTemplates.ts` (string
constants, not components). Initial drafts — **user reviews/edits wording at
spec-review**:

- **NPC:** name, role, appearance, voice/mannerism, wants, secret (`%%`),
  stat-block stub.
- **Location:** read-aloud `> [!quote]` block, notable features list,
  secrets `%%` block.
- **Secrets list:** a `%%` DM block with bulleted secret slots.
- **Read-aloud box:** a single `> [!quote]` callout placeholder.

Templates intentionally use constructs already supported (callouts, `%%`,
lists) so they render correctly the moment they're inserted.

## Files touched

- `src/atlas/editor/textareaInsert.ts` (new, shared with Spec 3)
- `src/atlas/editor/bodyTemplates.ts` (new)
- `src/atlas/categories/BodyToolbar.tsx` (new)
- `src/atlas/categories/EntityEditPanel.tsx` (mount toolbar, add textarea ref)
- `src/test/editor/textareaInsert.test.ts` (new — pure-function coverage)
- Optional: small CSS for the button row in `src/index.css`

## Test plan

- Unit: `textareaInsert` wrap/insert math (selection present, empty selection,
  start/end of buffer, multi-line callout).
- Component: render `<BodyToolbar>`, simulate selection + click, assert
  `api.setBody` called with expected string and caret restored.
- Manual (dev server): toolbar visible only in editor; player `npm run build`
  bundle does not contain template strings (grep dist).
- `npm test` green; `npm run lint` clean.

## Known limitation (accepted for v1)

Programmatically setting the controlled textarea value breaks the browser's
native undo stack for toolbar-driven edits. Acceptable for v1; documented.
No custom undo stack in scope.

## Risk

Low–medium. Self-contained editor UI. Main care: caret restoration timing and
the player-bundle exclusion check.
