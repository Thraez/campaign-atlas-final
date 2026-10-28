# The build lock is held until the build ends

Status: ready-for-agent
Area: dev save endpoint, build

Found by the fifth sweep (2026-10-28), from reading; the clash itself isn't traced. When the
save's rebuild passes 60 s, `runAtlasBuild` (`scripts/vite-plugin-atlas-save.ts` ~868-885)
resolves, and the route releases the lock (`buildLock.ts`) while `runBuild()` is still running. A
publish-check can then start a player build alongside it, which is what the lock is for
(`buildLock.ts` ~1-6). Both write under `public/atlas/assets/`.

## Acceptance criteria

- A failing test first: a slow build passes the timeout, and a second build can't take the lock
  until the first settles.
- The timeout still answers the DM (saved, not yet rebuilt), but the lock is released only when
  the build promise settles.
- Stack on code-retro-08 (#82), which reshapes `runBuild`.
