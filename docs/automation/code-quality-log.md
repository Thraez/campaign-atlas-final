# Code-quality routine — run log

**Read + written by** the daily code-quality routine (`code-quality-routine.md`).
**Purpose:** a running record of what the routine fixed, what it scanned-and-left-clean, and what it
**handed back** for you to decide. The routine reads this each run so it never re-reports the same thing.

Newest entries at the top.

---

## Handed back — needs your decision
*(The routine found these but did not change them, because they'd need a judgment call or could change
behavior. Clear an item once you've dealt with it.)*

_None yet._

---

## Run history
*(Each daily run appends one line: what was fixed, or "clean run — nothing safe to fix".)*

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
