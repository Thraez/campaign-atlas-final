# Spec — Render planned/broken wikilinks as visible "planned link" styling (N26)

**Created:** 2026-06-15 · **Status:** blessed NICE-TO-HAVE (queue N26) · **Gate:** standard (tsc + eslint +
vitest; no build-pipeline change). **Security-relevant** — `hideBroken: true` must never leak the raw target
name to players; the existing security test must stay green; new tests are required across all three surfaces.

> This is the render half of the broken-link FLAG (E6). E6 surfaces broken links in Publish Check as a
> suggestion; N26 changes how they look in the reading view itself, so the DM sees loose threads while writing.

## Problem

A wikilink whose target doesn't resolve — `[[Ghost Town]]`, `[[folder/Unwritten Note]]`,
`[[Note#Heading]]` — renders as a muted, non-clickable `<span class="atlas-unresolved">` in the entity
reading view. Nothing visually distinguishes it from surrounding prose at a glance; the DM has no signal
that a thread is dangling, and a player who somehow sees it gets equally no signal (the E6 Publish Check
suggestion is the alert, not the rendering). The spec calls for styling these as a "planned link" so the
DM sees the structural intent — "this note is planned but not yet written."

## Key finding (verified 2026-06-15) — it is all reuse

The `broken` flag is already computed inside `tokenizeWikilinks` (`src/atlas/content/parseWikilinks.ts`
line 28): `broken: !resolved` (the function itself starts at line 15). The `renderLinkTokens` function
(`src/atlas/content/parseWikilinks.ts:40-62`) already branches on `link.broken` and renders a
`<span class="atlas-unresolved">` today. The security contract is also already in place: when
`opts.hideBroken === true`, the span emits only the display text (the alias or target) with no `title`
attribute, so the raw target never reaches the player.

The CSS at `src/index.css` already has a rule covering `.atlas-unresolved` (lines 271-276) that makes these
spans muted. **Note:** the actual rule at lines 271-276 has TWO selectors: `.atlas-prose .atlas-broken-link`
and `.atlas-prose .atlas-unresolved` — grouped in one block. `.atlas-broken-link` is a dead selector
(nothing in the codebase emits it — confirmed by grep). When replacing this block with the two new variants,
remove `.atlas-broken-link` alongside `.atlas-unresolved`; no code change is needed to stop emitting it.
This spec changes **only that visual rule** — split into two variants — and updates `renderLinkTokens` to
emit the new class. No new regex, no new resolution logic, no new broken-link detection.

`renderEntityMarkdown.ts` is a separate simpler renderer used in a different path (not wikilink-resolved);
it does not use `renderLinkTokens` and emits `.atlas-wikilink` spans directly — it is out of scope and
untouched.

## Goal

In the DM reading view and the player reading view (with the secrecy invariant respected):

- **DM surface:** a broken/planned wikilink renders as a visually distinct "planned link" — something like
  a dashed underline with a muted amber tint and a tooltip naming the target (the existing `title=` attr).
  It should read as "this would be a link to `Ghost Town`, not written yet" — noticeable but not alarming.
- **Player surface (`hideBroken: true`):** the same span gets the planned-link class for styling (so it
  doesn't just vanish into prose) but **the tooltip and the target name are never present** — the player
  sees only the display text in a subtly styled span, with no hint of what it was meant to link to. This
  satisfies the security invariant while still making the text look intentional rather than broken.

## Approach (bounded — reuse only)

### 1. New CSS class for planned links

In `src/index.css`, replace the single `.atlas-unresolved` rule with two variants:

- **`.atlas-planned-link`** (DM view, `hideBroken: false`) — dashed underline, muted amber tone, `cursor:
  help` so the tooltip (`title=`) is discoverable. Example values drawn from existing CSS variables:
  `color: hsl(var(--primary) / 0.7)`, `border-bottom: 1px dashed hsl(var(--primary) / 0.5)`,
  `cursor: help`.
- **`.atlas-planned-link-player`** (player/published view, `hideBroken: true`) — a neutral, low-contrast
  styling (e.g. `color: hsl(var(--muted-foreground))`, `border-bottom: 1px dotted hsl(var(--muted-foreground)
  / 0.4)`) that signals the text is intentional prose-with-intent without revealing anything. No `cursor: help`
  (no tooltip, nothing to hover-discover).

Keep the old `.atlas-unresolved` rule as an alias for `.atlas-planned-link-player` (or remove it — the parity
test confirms the class name in the output, so align the CSS and the code together). The cleanest outcome:
both `.atlas-unresolved` and the co-grouped `.atlas-broken-link` selector (a dead alias — nothing emits it)
are removed, and both new class names are used from `renderLinkTokens` onward.

### 2. Update `renderLinkTokens` to emit the correct class

Change the broken-link branch in `renderLinkTokens` (`src/atlas/content/parseWikilinks.ts:53-58`):

```
if (opts.hideBroken) {
  return `<span class="atlas-planned-link-player">${text}</span>`;
}
return `<span class="atlas-planned-link" title="Planned link: ${escapeHtml(link.target)}">${text}</span>`;
```

The existing security contract is preserved exactly: `hideBroken: true` → no `title=` attr, no raw target
in the markup. Only the class name and the tooltip label change (`"Planned link:"` replaces
`"Unresolved link:"`).

**No change to `tokenizeWikilinks`, the `broken` flag computation, `ResolvedLink`, or any schema.** The
build-side re-export at `scripts/atlas/parseWikilinks.ts` requires no change (it just re-exports from
`src/`).

### 3. Update the parity test

`src/test/content/parseWikilinks-parity.test.ts` already asserts `src/` and `scripts/` produce identical
output. It will keep passing because `scripts/atlas/parseWikilinks.ts` is a re-export — the change is in
one place only.

### 4. Update / add tests in `parseWikilinks.test.ts` and a cross-surface parity test

Extend `src/test/content/parseWikilinks.test.ts`:

- `hideBroken: true` broken link emits `atlas-planned-link-player` (not `atlas-unresolved`, not
  `atlas-planned-link`), no `title=`, no raw target in HTML.
- `hideBroken: false` broken link emits `atlas-planned-link` with a `title="Planned link: Ghost Town"`
  attribute containing the target.
- Resolved link is completely unaffected (still `atlas-wikilink` `<a>`).
- Existing security test (`hideBroken: true` never leaks raw target) must still pass (assert both class
  name change and no-target-in-HTML).

Add or extend a cross-surface planned-link test covering the three surfaces (DM, reading/player-preview,
player `hideBroken: true`) — either in `parseWikilinks.test.ts` or as a small focused file — asserting:

- DM surface (`hideBroken: false`): broken link → `atlas-planned-link`, `title=` present with target.
- Player surface (`hideBroken: true`): broken link → `atlas-planned-link-player`, no `title=`, no target.
- Both surfaces: resolved link → `atlas-wikilink` `<a>`, unaffected.

## Security notes — CRITICAL INVARIANT

`hideBroken: true` must never put the raw target text anywhere in the rendered HTML — not in `class=`, not
in `title=`, not in `data-*`, not in the span body (the span body is `escapeHtml(link.display)`, which is the
alias or the target depending on what the DM wrote in the wikilink, and the display text is permitted because
it is what the DM chose to show; the *target*, which may name a DM-only entity, is what must stay hidden).

The existing test at `src/test/content/parseWikilinks.test.ts` line 63-71 ("`hideBroken: true` — broken
aliased link shows display text only, never leaks raw target") asserts this contract and **must remain green
after this change**. The new tests must also assert the class name change does not introduce any new target
leakage path.

## Files

- `src/atlas/content/parseWikilinks.ts` — change broken-link span class names in `renderLinkTokens`; update
  tooltip label string.
- `src/index.css` — replace/rename the `.atlas-unresolved` CSS rule with the two new planned-link variants.
- `src/test/content/parseWikilinks.test.ts` — update class-name assertions in the two existing broken-link
  tests; add cross-surface planned-link tests.
- `src/test/content/parseWikilinks-parity.test.ts` — update any hardcoded class-name strings if present
  (currently the parity test only checks equality between `src/` and `scripts/`, so it should stay green
  automatically, but verify).

**Not touched:** `scripts/atlas/parseWikilinks.ts` (re-export; change flows through automatically),
`src/atlas/content/renderEntityMarkdown.ts` (separate simpler renderer, no `renderLinkTokens` call),
`src/atlas/yaml/validateProject.ts` (E6 is a separate spec), any schema or build-pipeline file.

## Secrecy notes

**CRITICAL:** `hideBroken: true` (player builds and player-preview mode) must never leak the raw
`link.target` — it could name a DM-only entity. The change to the class name (`atlas-planned-link-player`)
carries no target information and is safe. The removal of the `title=` attribute on the player path
(already absent today) must not be accidentally introduced. Tests enforce this contract.

The player-facing `.atlas-planned-link-player` styling is intentionally neutral — a subtle dotted underline
in muted foreground color. It signals "intentional text" without revealing target identity or hinting that
a secret entity exists at the other end. The DM-facing `.atlas-planned-link` may show the amber styling and
the `title=` tooltip freely, because the DM already knows all entity names.

No build-pipeline touch means `npm run atlas:check-secrets` and `npm run atlas:check-derived` are not
affected; the class name is a CSS token, not content. Standard gate suffices.

## Autonomy guard

This is a single, bounded change to one function and one CSS block. If the chosen colors look wrong on the
actual theme, adjust the CSS values (still one file, one block) — do not expand to a theme token system or
add new CSS variables. If a test fails due to a class-name mismatch in an unexpected file, fix that file
rather than reverting the class rename — the rename is the whole point.

Do not touch `renderEntityMarkdown.ts` — it uses a different rendering path that does not go through
`renderLinkTokens`, and changing it would expand scope and risk regressions on a separate code path.

## Done when

- Broken/planned wikilinks render as `atlas-planned-link` (DM view) or `atlas-planned-link-player`
  (player/player-preview view) in the entity reading pane.
- DM view: the span has a `title="Planned link: <target>"` tooltip and is styled with a dashed amber
  underline (draws the eye without alarming).
- Player view (`hideBroken: true`): the span has **no** `title=` attribute, contains only the display
  text, and is styled neutrally — the raw target name is absent from the HTML.
- The existing security test (N17 — `hideBroken: true` never leaks raw target) still passes without
  modification to its assertion logic.
- New tests cover the class name on both surfaces and the tooltip presence/absence.
- `src/index.css` has the two new CSS rules (old `.atlas-unresolved` rule removed or aliased).
- Gate green: sharded vitest, tsc, eslint. No build-pipeline change; publish scans not required. ~1 run.
