# campaign-atlas-final

D&D world atlas: Obsidian-style markdown -> build pipeline -> `atlas.json` -> player-safe site and
local DM editor. Vite, React, TypeScript. Remote: github.com/Thraez/campaign-atlas-final.

## Run, test, build

- `npm run dev`: editor and local save endpoint
- `npm run typecheck:all`, `npm run lint`, `npm run test:ci` (Vitest in 4 shards, ~3 min; a
  single unsharded `vitest run` of the whole suite runs out of memory), `npm run build`
- `npm run atlas:build:player`: strict player atlas in `public/atlas/`
- `npm run atlas:publish`: full build plus the safety scans
- `npm run images:optimize`: convert PNG/JPEG to WebP and update references

A ticket is done per `docs/agents/workflow.md` ("Done").

## Where things are

- Goals and what "working" means: `docs/GOALS.md`. State: `State.md`. Work: `docs/tracker/`.
  Decisions: `docs/adr/` (`docs/decisions.md` is closed). Hand-overs between sessions go in the
  ticket or `State.md`.
- Map: `docs/CODEBASE_MAP.md`, plus the `README.md` table of contents.
- Output contract for builds: the scan scripts under `scripts/`.
- `content/astrath-deeprealm/` is the atlas's own copy of the lore. The real vault sits outside the
  repo (Mac: `~/Documents/DnD-Campaign-Repository/Vault-DnD`); the DM types its path into the
  "Sync from Obsidian" panel.
- `docs/archive/`: the retired continuous-dev routine and old plans. History only.

## Search, don't read whole

- `docs/archive/automation/continuous-dev-done.md` (347 KB)
- `README.md` (35 KB, 1,055 lines)
- `src/pages/AtlasPlacementEditor.tsx` (110 KB)
- `scripts/build-atlas.ts`, `scripts/vite-plugin-atlas-save.ts` (1,500+ lines each)
- `package-lock.json` (496 KB)

## Git and deploy

- One branch and PR per ticket. A PR merges on the full local gate plus a clean Opus review
  (`docs/agents/workflow.md`, "Done"); GitHub CI is not part of it. The PR check
  (`atlas-pr-check.yml`) runs only when started by hand: start it only when Isak asks.
- A merge into `main` publishes the site (`publish-atlas.yml`). Ask before any `git push` and
  before merging; the yes comes from Isak in your own chat, not relayed by another session.
- A conflict: resolve it keeping both sides' changes, rerun the gate, and say what you kept.
  Unattended, leave it for Isak.
- Never force-push. Before deleting a branch with commits, tag its tip `archive/<name>`, push the
  tag, confirm it is in no worktree, list it, and wait for the user.

## Never

- Never hand-edit `public/atlas/atlas.json`, `.local-atlas/`, `dist/`, `dist-ssr/`. Edit
  frontmatter, `world.yaml`, `scripts/` or `src/`, then rebuild. The hook
  `.claude/hooks/block-generated-paths.mjs` blocks Edit/Write on them; shell writes are on you.
- Player builds must contain no DM content. Run `npm run atlas:check-secrets <dir>` and
  `npm run atlas:check-derived <dir>` before calling output safe.
- Keep `AtlasPlacementEditor` and `/__atlas/save` behind the `__INCLUDE_EDITOR__` gate in
  `vite.config.ts`. Never import editor modules from a player entry point.
- Published image format and naming belong to `src/atlas/assets/imageEncoding.ts`; import it,
  don't copy it. Maps stay lossless (labels, fog redaction); `maps:optimize` owns them.
- Never rename vault folders without updating `src/atlas/import/inferType.ts`, which reads note types and its ignore
  list from folder names. Details: `docs/IMPORT_EXPORT.md` ("Vault folder names").

## Agent skills

Matt Pocock's skills are copied into `.claude/skills/` (Codex reads them through `.agents/skills/`).
Don't edit them; see `.claude/skills/README.md`. How they fit this project: `docs/agents/workflow.md`.

### Issue tracker

Local Markdown in `docs/tracker/`, committed to git. See `docs/agents/issue-tracker.md`.

### Triage labels

Not used: the `triage` skill isn't installed. Ticket states are in `docs/agents/issue-tracker.md`.

### Domain docs

Single context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.

## Models

Opus for `scripts/`, `vite.config.ts`, the atlas pipeline, migrations, security, architecture,
ambiguous specs and unplanned UI work. The user-level policy covers the rest.
