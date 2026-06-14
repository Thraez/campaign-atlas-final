# Code-quality routine — run log

**Read + written by** the daily code-quality routine (`code-quality-routine.md`).
**Purpose:** a running record of what the routine fixed, what it scanned-and-left-clean, and what it
**handed back** for you to decide. The routine reads this each run so it never re-reports the same thing.

Newest entries at the top.

---

## Handed back — needs your decision
*(The routine found these but did not change them, because they'd need a judgment call or could change
behavior. Clear an item once you've dealt with it.)*

- 2026-06-03 (run qa-20260603) — **The "what's new for players" Publish Check counts changes,
  not entities — so its badge can overstate.** In `src/atlas/publish/computeAtlasDiff.ts`, when a
  single entity has more than one thing edited at once (say its title *and* its body), the panel
  records that as two separate changes, and the summary badge ("N entities") counts those records
  rather than distinct entities. So one entity edited in two ways reads as "2 entities changed."
  Not touched because the right number depends on what you want the badge to *mean* — "how many
  entities changed" (then it should count distinct entities) vs "how many changes there are" (then
  it's correct as-is) — and the placement/map counts next to it count records the same way, so
  changing only this one could make them inconsistent. That's a product call, not a safe mechanical
  fix. If you want it to read as distinct-entity counts, this is a small change — say the word.

---

## Run history
*(Each daily run appends one line: what was fixed, or "clean run — nothing safe to fix".)*

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
