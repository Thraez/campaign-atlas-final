# One "reduce motion" switch for the player site

Status: in-review
Area: accessibility, player site

Found by the third sweep (2026-10-28). There are two readers of reduced motion:
`hooks/use-prefers-reduced-motion.ts` updates live, while `sound/prefersReducedMotion.ts` reads
once in a default prop (`SoundSettingsProvider.tsx` ~40) and never subscribes. Calm mode lives in
the sound settings and stops the ocean waves but not the map's fly-to (`AtlasViewer.tsx`
~130-142). The type filter chips in Timeline, Browse and SearchPalette copy the same markup, and
none has `aria-pressed`, so the selected chip is shown by colour alone
(`AtlasTimeline.tsx` ~147-165).

Provisional call (State.md): calm mode becomes the one "reduce motion" switch for the player site
(map flights, ocean, transitions). It moves out of the sound settings and combines with the OS
setting.

## Acceptance criteria

- One hook gives "reduce motion" as the OS setting OR calm mode, updated live. Map flights,
  ocean and transitions read it.
- The calm-mode switch sits in the general view settings, not the sound settings, and keeps its
  saved value.
- One shared filter-chip component with `aria-pressed`, used by Timeline, Browse and
  SearchPalette.
- Tests: an OS setting change mid-session takes effect; calm mode stops fly-to animation; chips
  expose their pressed state.

## Comments

### 2026-11-07, branch `eval-27-one-reduce-motion-switch`

- `src/hooks/use-reduce-motion.ts` is the one reader: `useReduceMotion()` = OS setting OR calm
  mode, both live (OS via the media query's `change` event, calm mode via a small store with
  `useSyncExternalStore`). It replaces `hooks/use-prefers-reduced-motion.ts` and the once-only
  `sound/prefersReducedMotion.ts` (deleted). Map fly-to, the reset-view fit, the minimap pan and
  Browse's A–Z scroll read it.
- Calm mode is stored under `atlas-calm-mode-v1` and mirrored onto `<html data-calm>`
  (`syncCalmModeToDocument()` at boot in `main.tsx`), so CSS follows it on every page: the ocean
  waves (already keyed on `data-calm`) and the global transition/animation rule in `index.css`,
  which now has a `data-calm` twin of the reduced-motion block.
- Saved value kept: if the new key is missing, the old `calmMode` in `atlas-player-sound-v1` is
  read once and copied to the new key; `SoundPrefs` no longer has `calmMode`.
- The switch is `CalmModeToggle` in the map toolbar, beside the grid and ruler toggles
  (`aria-pressed`); it is gone from `SoundControl`.
- `src/atlas/FilterChip.tsx` is the shared chip (`aria-pressed`, `type="button"`, same classes;
  a `tag` variant for SearchPalette's #tags). Timeline, Browse and SearchPalette use it. Browse's
  tag links and "+N more" are not toggles and stay as they were.
- Tests: `use-reduce-motion.test.ts` (OS change mid-session both ways, calm OR OS, `data-calm`,
  persistence, migration from the old key), `AtlasViewer.smoke` (calm mode → `setView` with no
  animation; the toggle sits in the header), chip `aria-pressed` in the Timeline, Browse and
  SearchPalette tests, sound tests updated.

Provisional call: "the general view settings" is the map toolbar's view toggles (grid, ruler),
since the player site has no settings panel. Isak should look at the new toolbar button.

Provisional call: calm mode still silences the soundscape, as it did before the move; only the
OS setting leaves audio alone. The button's title says so.
