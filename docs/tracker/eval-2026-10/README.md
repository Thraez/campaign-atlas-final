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
- Save status may stay dirty for drafts on other maps after a save
  (`AtlasPlacementEditor.tsx` ~2155, unverified).

Second sweep, 2026-10-27 (map, player site, editor, import, publish): 08-12. 08 and 09 are bugs.

Work the lowest open number first. Words as in `GLOSSARY.md`; module, interface, seam and depth
as in the `codebase-design` skill.
