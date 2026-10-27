# COMMANDS.md matches package.json and the Mac

Status: ready-for-human

COMMANDS.md misses 15 `package.json` scripts (`test:ci`, `typecheck:all`, `verify`, `format`, `images:optimize`, `maps:optimize`, `audio:transcode`, `atlas:restore` and more) and lists only Windows `.cmd` launchers in `bin/`.

## Acceptance criteria

- Every `package.json` script a person runs is in COMMANDS.md; hooks (`predev`, `prepare`) are not.
- Each launcher line says it's Windows-only, and the Mac way is given (the npm command, or a `.command` launcher if Isak wants them; ask).
- `README.md` and `docs/QUICK_START.md` use `npm run test:ci`, not `npm test`.

## Comments

2026-10-27: COMMANDS.md rewritten against `package.json`. All 35 scripts a person runs are in it; `predev` and `prepare` are not. Every launcher is marked Windows-only, with the npm command as the way on any machine. The old text also said `atlas:build` writes `public/atlas/atlas.json`; it writes `.local-atlas/`, which is now fixed. README, `docs/WORKFLOWS.md`, `docs/VISIBILITY_AND_PLAYER_SAFETY.md` and AGENTS.md say `npm run test:ci`. `docs/QUICK_START.md` never mentioned `npm test`.

Open for Isak: Mac `.command` launchers in `bin/`, or just the npm commands? Recommended: npm commands only. The Mac work runs from a terminal or Claude, and the launchers would be 22 more files to keep in step. If he says yes, it's one copy per `.cmd`.
