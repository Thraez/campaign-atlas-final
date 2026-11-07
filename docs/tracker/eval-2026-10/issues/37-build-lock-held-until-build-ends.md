# The build lock is held until the build ends

Status: done
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

## Comments

- 2026-11-07: Done. `buildLock.ts` gains `holdBuildLockUntilSettled(promise)`: the lock is free
  only when no request holds it and no held build is still running. `runAtlasBuild` (save
  rebuild) and the publish-check player build (`runPublishCheck.ts`, plus the unused
  `runPlayerBuildWithTimeout` copy in the plugin) hand their `runBuild()` promise to it, so a
  timeout still answers the DM (207, saved, `rebuilt: false`) but the lock stays taken until the
  build resolves or rejects. Tests: `src/test/build-lock-until-settled.test.ts` (save route with a
  mocked slow `runBuild` and fake timers: publish-check gets 423 until the build settles, success
  and failure), and two cases in `scripts/atlas/buildLock.test.ts`.
- Provisional call: the publish-check player build had the same timeout race, so it gets the same
  one-line hold. No stacking on #82 was needed (already merged).
- 2026-11-07, review fixes: when a request releases the lock while its build is still running,
  the server logs one warning line; the 423 then says "a previous build is still running"
  (`buildLockHolder()`). Added a publish-check timeout test (a save with rebuild gets 423 until the
  player build settles, then 200) and `__resetBuildLockForTests()` for the lock tests.
