# One "reduce motion" switch for the player site

Status: ready-for-agent
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
