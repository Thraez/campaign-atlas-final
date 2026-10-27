# COMMANDS.md matches package.json and the Mac

Status: ready-for-agent

COMMANDS.md misses 15 `package.json` scripts (`test:ci`, `typecheck:all`, `verify`, `format`, `images:optimize`, `maps:optimize`, `audio:transcode`, `atlas:restore` and more) and lists only Windows `.cmd` launchers in `bin/`.

## Acceptance criteria

- Every `package.json` script a person runs is in COMMANDS.md; hooks (`predev`, `prepare`) are not.
- Each launcher line says it's Windows-only, and the Mac way is given (the npm command, or a `.command` launcher if Isak wants them; ask).
- `README.md` and `docs/QUICK_START.md` use `npm run test:ci`, not `npm test`.
