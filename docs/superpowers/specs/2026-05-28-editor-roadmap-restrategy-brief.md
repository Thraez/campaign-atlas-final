# Strategy brief — Re-sequence DM-editor Parts 2-4

**Date:** 2026-05-28
**Status:** Brainstorm-only; no edits this session
**Recommended model:** Opus 4.7
**Recommended skill:** `/ce-strategy` or `/ce-brainstorm`
**Estimated session:** 45–90 minutes
**Depends on:** nothing, but ideally run after the hygiene + flake work to keep `main` stable

## What we're deciding (plain language)

Three plans exist for editor improvements (Parts 2-4: "no lost work" / "information architecture" / "polish"). Since they were written, Phase 5 shipped a lot — security hardening, image library, EXIF stripping, entry templates, error toasts. The editor looks different now than it did when those plans were drafted.

**The question for this session:** *Do those three plans still make sense, in the order they were written, with the scope they were given? What needs to be cut, merged, or re-shaped?*

This is a brainstorm. The output is an updated plan-of-plans, not code.

## What to read first

In this order:

1. **The three plan files:**
   - `docs/superpowers/plans/2026-05-16-dm-editor-part-2-no-lost-work.md`
   - `docs/superpowers/plans/2026-05-16-dm-editor-part-3-information-architecture.md`
   - `docs/superpowers/plans/2026-05-17-dm-editor-editing-experience.md`

2. **The two related design specs:**
   - `docs/superpowers/specs/2026-05-16-dm-editor-part-2-no-lost-work-design.md`
   - `docs/superpowers/specs/2026-05-16-dm-editor-part-3-information-architecture-design.md`

3. **Phase 5 surface area** (what changed since those plans were written):
   - PRs #33–#40 merged into `main` between 2026-05-23 and 2026-05-27
   - `src/atlas/editor/ImagePickerPanel.tsx` — image library (PR #33, #36)
   - `src/atlas/editor/FormatToolbar.tsx` — formatting + entry templates (PR #35)
   - `src/atlas/categories/EntityEditPanel.tsx` — touched by image picker, EXIF stripping, error toasts (PRs #33-40)

4. **Project memory context:**
   - `project_editor_overhaul.md` — the Parts 1-4 framing
   - `feedback_sleek_ux.md` — "sleek one-button UX; hide internals"
   - `feedback_plain_language.md`
   - `feedback_unified_save_completeness.md`

## Questions to bring to the brainstorm

1. **Part 2 ("no lost work") — has any of it shipped silently?**
   The session restore / IDB-backed unsaved-counter work is already in `src/atlas/session/useEditorSession.ts`. Are there remaining gaps, or did this part complete during the security hardening?

2. **Part 3 (IA) — does it still match the current panel structure?**
   The editor now has: ImagePickerPanel, EntityEditPanel, FormatToolbar, EditorMenu, EditorRail, EditorPanelHost, CommandPalette. The Part 3 design was written before the image library landed. Does the proposed IA still hold, or does it need a re-cut around image-as-first-class?

3. **Part 4 (polish) — has the polish already creep-shipped?**
   Toast surfacing, error reveal, slugified filenames, backup-before-delete (PR #40) — these were polish items by another name. What polish is left that's meaningful for the DM, vs trivial?

4. **Order question:**
   Original sequence was Part 2 → Part 3 → Part 4. Should it now be:
   - (a) IA first (Part 3), then narrow polish?
   - (b) Skip Part 2 if shipped, do Part 3, drop Part 4 as "done in passing"?
   - (c) Pivot entirely to Vault-as-Source (the bigger lever) and treat editor polish as filling in around it?

5. **Cut question:**
   What can be deleted from the plans outright? Per `feedback_legacy_code_disposition.md`, decisive removal beats keeping legacy plans behind a caveat.

## Expected output of the session

A single document, written back to `handovers/ACTIVE.md` (or a dated sibling), containing:

- **Re-sequenced roadmap:** the surviving plan items in the new order, with one-line justification each.
- **Cut list:** items dropped, with one-line reason per cut.
- **Pre-flight:** which existing plan files become superseded (archive candidates).
- **Next-session spec:** the first surviving item, ready to hand to a Sonnet executor.

## Non-goals

- Writing code.
- Re-writing the three plan files in place (they stay as historical record; supersede via a new doc).
- Re-opening Phase 5 decisions.

## Constraints

- Respect the DM's UX preferences: sleek, one-button flows, plain language, hide internals.
- Don't re-introduce removed concepts (e.g., Export Patch — see `feedback_unified_save_completeness.md`).
- Treat this session as the FIRST session of a multi-phase initiative — that's the Opus signal per CLAUDE.md.

## Open questions for the strategist

- Is "Part X" a useful framing anymore, or should this just be a flat backlog of named improvements?
- Are there any user-visible regressions from Phase 5 worth folding into this work? (None known, but worth scanning the recent commits.)
