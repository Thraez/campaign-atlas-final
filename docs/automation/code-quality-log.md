# Code-quality routine — run log

**Read + written by** the daily code-quality routine (`code-quality-routine.md`).
**Purpose:** a running record of what the routine fixed, what it scanned-and-left-clean, and what it
**handed back** for you to decide. The routine reads this each run so it never re-reports the same thing.

Newest entries at the top.

---

## Handed back — needs your decision
*(The routine found these but did not change them, because they'd need a judgment call or could change
behavior. Clear an item once you've dealt with it.)*

- ⚠️ **The two routines ran on top of each other today — the shared lock failed (2026-06-15).** While this
  code-quality run held the lock (`IN_PROGRESS since 2026-06-15T15:02:27 (run qa-20260615)`), the hourly
  feature routine fired at the same time, **misread the live lock as a leftover header**, and reset it to
  `IDLE` mid-run (see `ACTIVE.md` body, `routine-check-20260615e`). No harm done this time — the feature run
  was a no-op REFUEL-POINT check and this run made no changes — but the mutual-exclusion both routines depend
  on did not hold. **Why it matters:** if this races again on a day when one routine is actually committing,
  the two could collide on `auto/continuous-dev`. **Likely cause:** the feature routine recognises the lock
  by matching a run-id it expects in the body, and it attributed my header's timestamp to a *previous* check
  run rather than to an active different-routine run. Worth a human look at how the lock owner is identified
  (e.g. record the owning routine name in the `Run status:` line, not just a timestamp) so a foreign but live
  lock is never mistaken for a stale one. I did not change the lock logic — that's a design call.

- ✅ RESOLVED 2026-06-14 — **The "what's new for players" badge counted changes, not entities.** The human
  decided (2026-06-14) it should count **distinct entities** (and the map/placement counts likewise, for
  consistency). Queued as WANT **F2** in `docs/automation/continuous-dev-queue.md` — spec
  `docs/superpowers/specs/2026-06-14-publish-diff-distinct-entity-count-design.md`. No longer a pending
  decision; the routine builds it as F2.

---

## Run history
*(Each daily run appends one line: what was fixed, or "clean run — nothing safe to fix".)*

- 2026-06-16 (run qa-20260616) — **Fixed (tests only, no behavior change):** added regression tests for
  the part of Publish Check that explains *why* publishing is blocked. When the safety scans catch a
  problem (a DM-only note about to go public, a hidden person/place name leaking, a malformed world file),
  the editor turns each into a plain-language reason — and it must never echo the secret itself. The
  existing tests covered the main messages and the "never show the secret" rule, but not the quiet
  *de-duplication* behind them: several leaks from the same source note collapse to a single reason,
  several problems on the same entity collapse to one, and a malformed-file problem with no entity shows
  one reason with no pin-point locator. The 8 new cases lock all of that in — plus "a DM leak and an
  editor-code leak produce two separate reasons" and the empty-scan cases — so a future tweak can't
  silently start double-counting blockers or leak a secret name into a reason. Baseline was fully green
  first (lint clean — 0 errors, 16 known warnings; types clean; 1469 tests across the four shards). Source
  untouched. Commit `299e0bf4`, merged `7ba9b5d4`. Test count 1469 → 1477. (Note for the human: the run
  worktree was removed cleanly; the merged branch `run/qa-20260616` was kept, not auto-deleted, per the
  safe-cleanup protocol — delete it at your discretion.)
- 2026-06-15 (run qa-20260615) — **Clean run — nothing changed (stopped on a lock collision).** Confirmed
  `auto/continuous-dev` (@ `08a55c5e`) is fully healthy: lint clean (0 errors, 16 known warnings), types
  clean, and **all 1402 tests pass** across the four shards (350 + 394 + 336 + 322). The branch grew since the
  last run (1203 → 1402 tests) from the H1/H2 and N18–N24 work. Did **not** make a fix this run: mid-run the
  hourly feature routine fired concurrently and reset the shared lock (see the handed-back item above), so per
  the routine's "when in doubt, stop" rule I made no mutating change while the lock was contested. Baseline
  was green, so there was nothing broken to fix regardless. Worktree cut from origin tip `08a55c5e`, removed
  cleanly; empty run branch deleted; no commits to source, `main` untouched. (This docs-only log entry is the
  run's only commit.)
- 2026-06-14 (run qa-20260614) — **Fixed (dead code removed, no behavior change):** the app
  carried a leftover mobile-detection helper (`useIsMobile`, in `src/hooks/use-mobile.tsx`) from
  the original UI scaffolding that nothing ever used — no screen, menu, or component referenced
  it. Removed the whole file. Confirmed it was truly dead by searching the entire project for any
  use of it (both by name, `useIsMobile`, and by its file path, `use-mobile`) and checking for any
  dynamic/glob imports that could pull it in indirectly — zero references anywhere. The app behaves
  exactly as before: lint still 0 errors / 16 known warnings, types clean, and all 1203 tests pass
  unchanged across the four shards (identical before and after). Baseline was fully green first
  (lint clean, types clean, 1203 tests). Commit `b1abeb97`, merged `08888314`. Test count unchanged
  1203 → 1203.
- 2026-06-04 (run qa-20260604) — **Fixed (dead code removed, no behavior change):** the part of
  the Obsidian import that finds attached images was carrying around the source note's folder path
  but never using it — a leftover from an earlier design where attachments were going to be filed
  next to their note. Today every imported image is simply suggested into one shared
  `assets/images/` folder by its filename, so that folder value did nothing. Removed it (and the
  now-unused argument that fed it). The import behaves exactly as before — the existing tests that
  check how relative, web (`https://`), and embedded images are handled all pass unchanged, and the
  full suite is identical at 1203 tests. Baseline was fully green first (lint clean, types clean,
  1203 tests). Commit `029799a6`, merged `244b3cc1`. Test count unchanged 1203 → 1203.
- 2026-06-03 (run qa-20260603b) — **Fixed (tests only, no behavior change):** added regression
  tests for the helper that decides *which DM fields the entity editor shows* for a given kind of
  thing (an NPC gets Wants/Fears/Secret, a faction gets Goal/Forbidden line, a settlement gets
  Will-not-tolerate, and so on). The existing tests covered the four main kinds, one shorthand
  (city → settlement), and the unknown-kind fallback — but never pinned what happens with no kind
  at all, a blank kind, odd capitalization (e.g. "Faction"), or 12 of the 13 shorthands the editor
  accepts (town/village/hamlet, area/zone/district, party/cult/guild/order/church, character/person).
  The 8 new cases lock all of those in, so a future tweak can't silently change which fields a DM
  sees when editing an entity. Baseline was fully green first (lint clean, types clean, 1195 tests).
  Source untouched. Commit `3e39a30e`, merged `2503a258`. Test count 1195 → 1203.
- 2026-06-03 (run qa-20260603) — **Fixed (tests only, no behavior change):** added regression
  tests for the rule that decides which "this NPC is connected to that one" links a player is
  allowed to see. The code treats a *rumored* connection as something players can see (alongside
  plain player-visible ones) — but every existing test only checked plain and DM-only links, so the
  rumored case had zero coverage. The five new cases lock in that a rumored link to a visible person
  shows, a rumored link to a *secret* (DM-only or hidden) person is caught as a spoiler leak and
  never shipped, and a link pointing at a person who no longer exists is also held back. This is the
  app's most important promise — players never see DM-only content — so pinning it means a future
  tweak can't silently start leaking rumored connections. Baseline was fully green first (lint clean,
  types clean, 1190 tests). Source untouched. Commit `d53e502f`, merged `8cd69862`. Test count
  1190 → 1195. *(Also handed back one item — see above: the Publish Check "N entities" badge can
  overstate when one entity has several edits.)*
- 2026-06-02 (run qa-20260602b) — **Fixed (tests only, no behavior change):** added
  regression tests for the world-config loader — the code that reads the DM's map,
  region, route, and fog definitions out of `world.yaml`. Four cases now lock in how it
  behaves when a fog or route block is nested under one map but names a *different* map
  (it keeps the parent map and warns), and when a map has no id at all (the nested fog/route
  keeps its own named map and stays silent). These branches had no coverage — the previous
  run only covered the equivalent case for regions — so a future tweak couldn't silently
  change how the DM's overlays get assigned to maps. Baseline was fully green first (lint
  clean, types clean, 1161 tests). Source untouched. Commit `908fba3f`, merged `42b7d8ab`.
  Test count 1161 → 1165.
- 2026-06-02 (run qa-20260602) — **Fixed (tests only, no behavior change):** added a
  regression guard for the slug generator that turns place/person names into the IDs and
  links used across the published atlas. It had zero tests despite being the source of
  truth the import preview copies; the 11 new cases lock in how it handles accents,
  apostrophes, spacing, and length so a future tweak can't silently change everyone's
  links. Baseline was fully green first (lint clean, types clean, 1092 tests). Commit
  `cc109245`, merged `fb53fbec`. Test count 1092 → 1103.
- 2026-06-02 — routine created; first run pending.
