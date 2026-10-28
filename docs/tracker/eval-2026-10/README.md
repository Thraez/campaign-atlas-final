# Evaluation, 2026-10-27

From an architecture sweep (`improve-codebase-architecture`), a test-gap check against
`docs/GOALS.md` and `npm outdated`. Isak's answers, 2026-10-27:

- The repo goes private, with GitHub Pro so Pages keeps working (Isak does this in GitHub).
- 01 and 02 come before `tidemarrow/`. 01 first.
- Dependencies: in-range bumps now (06); Vite 8 with Vitest 5 after Tidemarrow (07); React 19,
  Tailwind 4 and ESLint 10 parked.

Parked as notes, no ticket yet:

- One client for reading and saving canon (`/__atlas/read` fetched and hashed by hand in five
  places; `FileKind` and `ConflictReason` defined twice).
- Viewer deep links: load and Back resolve a link differently (`AtlasViewer.tsx:316-381`).
- Save lifecycle out of the page: `onSaveClick` (~808-904) and the ~120-line `onSaved` cleanup
  (~2129-2247) live inline; a module from (session state, save result) to (next state, undo entry)
  would test them without rendering. Revisit after 30.

Second sweep, 2026-10-27 (map, player site, editor, import, publish): 08-12, plus 13 from the eval-04 tests. 08, 09 and 13 are bugs.

Grill round 2, 2026-10-27: 14-17 are built on provisional calls (`State.md`, "Provisional
calls"); Isak hadn't answered yet. 17 is a bug.

Overnight 2026-10-28: 19 and 20 came out of reviews. 21-28 come from a third sweep (sound,
timeline, CI, dev scripts, accessibility and offline, test health); 21-25 and 27 rest on
provisional calls in `State.md`. 21, 22, 23, 25 and 26 are bugs; 28 is unverified.

Fourth sweep, 2026-10-28 (the editor page, second pass): 30-32, all bugs. The parked "save status
may stay dirty" note was worse than it read: a save drops other maps' region, route and fog drafts
(30). 30 waits for the editor stacks (#64 and #68 chains) to merge.

Work the lowest open number first. Words as in `GLOSSARY.md`; module, interface, seam and depth
as in the `codebase-design` skill.
