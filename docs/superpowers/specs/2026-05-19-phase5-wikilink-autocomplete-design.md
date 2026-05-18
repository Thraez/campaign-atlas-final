# Spec 3 — Phase 5: wikilink/embed autocomplete + safe image import

**Date:** 2026-05-19
**Status:** Approved design, ready for implementation plan
**Lane:** B, runs **after** Spec 2 (reuses `src/atlas/editor/textareaInsert.ts`).

## Goal

When the DM types `[[` (or `![[`) in the entity body editor, show an inline
suggestion dropdown of linkable targets — **entities and images and other
linkable atlas objects** — so links/embeds are picked, not hand-typed and
mistyped. Plus a safe path to import a new image so it immediately becomes
suggestable.

This replaces the earlier "modal library picker" idea (user decision
2026-05-19): autocomplete-in-textarea, not a separate modal.

## Trigger + behaviour

- Detect the active token: the text between the most recent unclosed `[[` (or
  `![[`) and the caret.
- `[[foo` → suggestions across **entities** (+ images, lower-ranked).
- `![[foo` → suggestions restricted to **images** (embeddable assets only).
- Dropdown anchored near the caret; keyboard nav ↑/↓, Enter to accept, Esc to
  dismiss, click to accept. Filter updates as the DM types.
- Accept → insert the target name and auto-close `]]` (or `]]` for embed),
  caret placed after the closing brackets. Insertion goes through
  `textareaInsert.ts` from Spec 2.

## Suggestion data sources

- **Entities:** already in memory in the editor (the loaded atlas dataset that
  populates the rest of `AtlasPlacementEditor`). No new fetch — derive a
  `{ name, kind }[]` index from existing state. (Plan task: locate the
  in-memory atlas/entity collection and expose a selector.)
- **Images:** the files under `public/atlas/assets/images/`. The editor has no
  list of these today. Chosen approach: extend the dev save plugin
  (`scripts/vite-plugin-atlas-save.ts`) with a **dev-only, editor-only**
  `GET /__atlas/assets/images` returning filenames. Alternative considered
  (derive from an atlas.json asset manifest) — rejected unless a manifest
  already exists; dev-endpoint is lower-coupling and dev-server already hosts
  the save plugin.

## Safe image import

Retained from the original Phase 5 ("safe import only" — user decision Q5):

- File input in `EntityEditPanel` → POST `/__atlas/save` with
  `kind:"asset-binary"`.
- Server already enforces safety: `isWritableAssetPath` (path allowlist,
  `sourcePathAllowlist.ts`) + `validateAsset.ts` (extension allowlist
  `.jpg/.jpeg/.png/.webp`, 5 MB cap). Mirror the same validation client-side
  for fast rejection feedback — server remains the source of truth.
- On success: refresh the image list (re-hit `GET /__atlas/assets/images`) and
  insert `![[filename]]` at the caret.

## Security boundary — explicit assumption + residual risk

**The pipeline does NOT enforce DM/player image secrecy.** Per user decision
2026-05-19: secret images are kept out of player view by *placement and fog and
`%%` DM blocks*, not by the import pipeline. An imported image referenced via
`![[img]]` inside a player-visible body **will ship to players**.

- This spec adds no build-time secret-image scan.
- **Residual risk (documented, accepted):** a DM who embeds a spoiler image in
  a non-DM body section leaks it. Mitigation is editorial discipline + existing
  fog/`%%` mechanisms, not this feature.
- The autocomplete must therefore not imply images are "safe to place
  anywhere" — no scope creep into secrecy UI.

## Files touched

- `scripts/vite-plugin-atlas-save.ts` — add `GET /__atlas/assets/images`
  (dev-only; project flags `scripts/` as careful territory — minimal, additive,
  read-only endpoint).
- `src/atlas/editor/useLinkSuggestions.ts` (new) — token detection + filtered
  suggestion list (entities from memory, images from endpoint).
- `src/atlas/categories/LinkAutocomplete.tsx` (new) — dropdown UI + keyboard
  nav, wired to the body textarea ref.
- `src/atlas/categories/EntityEditPanel.tsx` — mount autocomplete + image
  import input (shares textarea ref with Spec 2's toolbar).
- Reuses `src/atlas/editor/textareaInsert.ts` (Spec 2, dependency).
- Tests: `src/test/editor/useLinkSuggestions.test.ts` (token parse + filter),
  component test for accept-inserts-and-closes.

## Test plan

- Unit: token extraction (`[[`, `![[`, closed vs unclosed, caret mid-token),
  filter ranking (entity vs image scoping).
- Component: type `[[`, assert dropdown; arrow+Enter inserts name + `]]`;
  `![[` scopes to images; Esc dismisses.
- Import: mock `/__atlas/save`; success path inserts `![[name]]` and refreshes
  list; oversize/bad-ext rejected client-side.
- Editor-only: `GET /__atlas/assets/images` and import UI absent from player
  `npm run build`; `npm run atlas:publish` scans clean.
- `npm test` green; `npm run lint` clean.

## Dependency

Hard dependency on Spec 2's `textareaInsert.ts`. Build order: Spec 2 → Spec 3.

## Risk

Medium. Touches `scripts/` (save plugin) — additive read-only dev endpoint
keeps blast radius small. Existing asset validation lowers import risk.
