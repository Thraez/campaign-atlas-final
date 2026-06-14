# Spec — Categorize imported notes (stop silent "Lore" bucketing)

**Created:** 2026-06-14 · **Status:** blessed WANT (queue section F1) · **Gate:** standard (tests + tsc + eslint;
no build-pipeline touch expected — pure DM-editor + import-staging change)

> Graduated from the INBOX ("Categorize imported notes — `imports/` NPCs don't appear under Characters or
> any type tab") by human bless on 2026-06-14. Pairs with the completed import folder-mapping work (queue
> section B).

## Problem

When a DM imports markdown notes, each note's type is resolved by a cascade (see **Root cause** for refs):

1. explicit `atlas.type` in frontmatter →
2. tag-based inference (`inferTypeFromTags`) →
3. folder-based inference (`inferTypeFromPath`) →
4. **fallback → `"lore"`**

A note dropped into a folder that isn't in the import folder-mapping (e.g. a generic `imports/`), with no
recognized `tags:` and no explicit `atlas.type`, falls all the way through to step 4 and becomes **`"lore"`**.
The type tabs filter entities by category, and `"lore"` maps to the **Lore** tab — so an imported NPC never
appears under **Characters**. Worse, this fallback `"lore"` is **indistinguishable** from a note the DM
deliberately typed as lore, so there's no signal that categorization was a guess.

## Root cause (verified 2026-06-14 — re-confirm line numbers on read)

- **Type cascade / silent fallback:** `src/atlas/import/stagingState.ts` (~L144–150) —
  `explicit ?? fromTags ?? (fromFolder && fromFolder !== "note" ? fromFolder : "lore")`. When `fromFolder`
  is `"note"` (the unmapped-folder signal) it collapses to `"lore"` with no record that it was a fallback.
- **Unmapped folder → `"note"`:** `src/atlas/import/inferType.ts` — `FOLDER_TYPE_MAP` (~L9–31) lists the
  recognized folders; `inferTypeFromPath` (~L46–54) returns `"note"` for anything not in the map.
- **Tabs filter by category:** `src/atlas/content/entityCategory.ts` — `TYPE_TO_CATEGORY` (~L22–40) maps
  `npc/character/person → characters`, etc.; unknown/undefined type → `"lore"` (`categoryForType` fallback).
  `src/atlas/categories/CategoryPanel.tsx` (~L29) filters: `categoryForType(e.type) === category`.
- **No secrecy risk:** `src/atlas/view/filterEntitiesForLens.ts` filters the player projection **only** by
  `entity.visibility` (`player`/`rumor` visible; `dm`/`hidden` hidden). `type` is never consulted for the
  player build. Re-categorizing cannot expose DM-only content. (Still run the standard gate.)

## Goal

Imported notes land under the **right type tab** automatically when there's a signal, and when there isn't,
the DM can fix them in **one obvious place** instead of hunting through Lore. Sleek, not naggy: importing
still works untouched; uncategorized notes are *surfaced*, not *blocked*.

## Approach (recommended — reuses existing machinery)

Two parts; Part B is the core deliverable.

**A. Keep/strengthen the automatic path (no new friction).**
The cascade already auto-categorizes notes that carry an explicit `atlas.type`, a recognized tag, or live in
a mapped folder. Leave that intact. (Documenting "map your import subfolders in `world.yaml` → `import:`" is
the bulk-import answer and needs no code.)

**B. Stop the *silent* lore fallback — surface "uncategorized" imports in the staging modal.**
The import staging modal (`src/atlas/import/ImportStagingModal.tsx`) already renders a per-row **type
dropdown** (built in queue section B1/B2, sourced from `importConfig.folders`). The fix:
- Track **why** a row's type was chosen — distinguish a genuine fallback (`fromFolder === "note"` AND no
  explicit/tag signal → currently silently `"lore"`) from a real `"lore"`/typed note. Surface this as a
  small per-row flag (e.g. `typeWasGuessed: true` or an `inferenceSource` enum on the staged row).
- In the modal, give guessed rows a quiet **"Pick a type"** affordance (badge + the existing dropdown,
  defaulted so the DM can set it in one glance). Confidently-typed rows are untouched (no false flag).
- Assigning a type there routes the entity to the correct tab after import — no separate step.

This is deliberately the "flag + one-click fix" half, mirroring how E2/E6 chose "surface it" over "auto-guess
it." No fragile filename/content heuristics in v1.

## The one design choice to confirm at build time

What should a guessed note default to if the DM **doesn't** touch it during import?
- **(Recommended)** Keep the data default `"lore"` (so nothing regresses), but mark it guessed so it's visible
  and easy to re-type later — i.e. the *only* change is making the guess honest + fixable.
- **(Alternative)** Introduce a visible **"Uncategorized"** treatment (its own bucket/tab) so guessed notes
  don't blend into deliberate Lore at all. Bigger surface change; defer unless the human wants it.

Build the recommended shape unless the human says otherwise. Do **not** add a mandatory blocking import step.

## Files (expect)

- `src/atlas/import/stagingState.ts` — expose the inference source / `typeWasGuessed` instead of silently
  collapsing unmapped → `"lore"`.
- `src/atlas/import/inferType.ts` — the `"note"` sentinel is the "unmapped" signal; surface it rather than
  swallow it (no behavior change to recognized folders).
- `src/atlas/import/ImportStagingModal.tsx` — render the guessed-row affordance using the existing dropdown.
- Tests: `src/test/import-staging-modal.test.tsx`, plus stagingState coverage for the
  guessed-vs-deliberate-lore distinction.

## Done when

- A note imported into an **unmapped** folder with no tag/explicit type is flagged as guessed in the staging
  modal, and assigning it (e.g.) "npc" there makes it appear under **Characters** after import.
- Notes with an explicit `atlas.type`, a recognized tag, or a mapped folder are **unaffected** — no false
  "guessed" flag, same tab as today.
- A note the DM **deliberately** types as lore is **not** flagged as guessed.
- Import still completes with zero extra mandatory clicks (sleek; the affordance is optional).
- No player-projection change; standard gate green (tests + tsc + eslint). ~1–2 runs.
