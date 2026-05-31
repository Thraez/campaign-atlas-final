# Accessible names for icon-only controls — design

**Date:** 2026-05-31
**Status:** blessed → queued as WANT **E1** (`docs/automation/continuous-dev-queue.md`)
**Origin:** dogfooding inbox "Accessibility labels" (Tier 4) in `docs/DEVELOPMENT_WANTS.md`
**Backs queue unit:** E1
**Confidence:** high — pure additive, zero design fork, no visual change.

## The problem

Several icon-only interactive controls have no accessible name, so a screen reader announces them as a
bare "button" with no indication of what they do. A recon pass found the **player-facing** map header is
already mostly labelled (the map selector, grid toggle, search button, and panel collapse/expand all carry
`aria-label`s), so the remaining gaps are concrete and small:

**Player-facing (fix first):**
- `src/atlas/AtlasMinimap.tsx` — the minimap is an interactive `<div>` with pointer/drag handlers but only
  a `title`; it has **no `role` and no accessible name**, so assistive tech does not announce it as a
  region at all.

**DM editor (desktop-only, but the labels are cheap and correct hygiene):**
- `src/atlas/MapLayerPanel.tsx` — the four **nudge** buttons (left/right/up/down chevrons) have **no label
  at all** (not even `title`); the Eraser / Copy / Lock-Unlock / Trash icon buttons have `title` only.
- `src/pages/AtlasPlacementEditor.tsx` — the "discard all local pin overrides" button and the per-pin
  "discard local edit" / "remove placement" icon buttons have `title` only.
- `src/atlas/tabs/EntitiesTab.tsx` — two bare `<Trash2>` icon buttons ("remove value", "remove linked
  entity") have no label.

> **Verify line numbers before editing** — this list was gathered partly on an older base; the *files* and
> controls are stable, but confirm exact lines in the current `auto/continuous-dev` tree.

## The fix

Add accessible names, matching the **pattern already used elsewhere in the codebase**:
- Put `aria-label="…"` directly on the `<button>` / `<Button>` element (this is what `Undo`, `Redo`,
  `Close panel`, `Open navigation menu`, `Choose map`, `Toggle grid overlay` already do).
- Add `aria-hidden="true"` to the decorative icon SVG inside the button.
- Where a `title` already exists, **keep it** (it's a useful hover tooltip) and **add** `aria-label`
  alongside — do not rely on `title` alone for the accessible name.
- Use the existing Tailwind `sr-only` class if any control genuinely needs a visually-hidden text label
  (there is no custom `VisuallyHidden` component — match the shadcn dialog/sheet close-button pattern).

Concrete labels (plain language; adjust wording to match neighbours):

| Control | File | Suggested `aria-label` |
|---|---|---|
| Minimap region | `AtlasMinimap.tsx` | `role="img"` + `aria-label="Minimap — click or drag to pan"` |
| Nudge left/right/up/down | `MapLayerPanel.tsx` | `"Nudge layer left"` / `right` / `up` / `down` |
| Clear local draft assets | `MapLayerPanel.tsx` | `"Clear local draft assets"` |
| Duplicate layer | `MapLayerPanel.tsx` | `"Duplicate layer"` |
| Lock / unlock layer | `MapLayerPanel.tsx` | `locked ? "Unlock layer" : "Lock layer"` |
| Remove layer | `MapLayerPanel.tsx` | `"Remove layer"` |
| Discard all local pin overrides | `AtlasPlacementEditor.tsx` | `"Discard all local pin overrides"` |
| Discard local edit (per-pin) | `AtlasPlacementEditor.tsx` | `"Discard local edit"` |
| Remove placement (per-pin) | `AtlasPlacementEditor.tsx` | `"Remove placement"` |
| Remove value | `EntitiesTab.tsx` | `"Remove value"` |
| Remove linked entity | `EntitiesTab.tsx` | `"Remove link"` |

For the minimap: it is a mouse/drag control with no keyboard path. **Do not** attempt to make it
keyboard-operable here — just name the region with `role="img"` + `aria-label` so AT announces it. The
main map remains the keyboard-accessible surface.

## Testing

Add one light test (e.g. `src/test/accessibility-labels.test.tsx`) that renders the affected components and
asserts the controls expose accessible names via `getByRole("button", { name: … })` / `getByLabelText(…)`
for a representative subset (the four nudge buttons, the two EntitiesTab trash buttons, and the minimap
region). The goal is a regression guard, not exhaustive coverage. Full gate: `npx tsc --noEmit`,
`npx eslint .`, `npx vitest run` green.

## Acceptance criteria

- Every control listed above exposes an accessible name (verified by the test for the sampled subset).
- No visual change and no behaviour change — labels and `aria-hidden` only.
- Existing `title` tooltips are preserved where present.
- Full gate green.

## Out of scope

- Making Leaflet pin markers (`divIcon`s, not React buttons) keyboard-focusable / screen-reader-clickable —
  that is a larger a11y feature (wrapping markers in real buttons + focus management), not a label add.
  Note it as a possible future want; **do not** build it here.
- Any restyling, focus-ring work, or color-contrast changes.
- `axe-core`/`jest-axe` integration — not in scope for this nibble.
