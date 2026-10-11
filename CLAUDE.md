# campaign-atlas-final

D&D world atlas: Obsidian markdown -> build pipeline -> `atlas.json` -> player-safe site and
local DM editor.

## Non-negotiable rules

- Do not hand-edit `public/atlas/atlas.json`, `.local-atlas/`, `dist/`, or `dist-ssr/`. Edit YAML
  frontmatter, `world.yaml`, `scripts/`, or `src/`, then rebuild. The pre-tool hook blocks direct
  Edit, Write, and MultiEdit calls to those outputs. Shell writes are still the agent's
  responsibility.
- Player builds must contain no DM content. Run `npm run atlas:check-secrets <dir>` and
  `npm run atlas:check-derived <dir>` before calling an output safe. `npm run atlas:publish`
  includes both checks.
- Keep `AtlasPlacementEditor` and `/__atlas/save` behind the `__INCLUDE_EDITOR__` gate in
  `vite.config.ts`. Never import editor modules from a player entry point.
- Never force-push.

## Commands and completion gate

- `npm run dev`: editor and local save endpoint
- `npm run build`: player-safe production build
- `npm run atlas:build:player`: strict player atlas in `public/atlas/`
- `npm run atlas:publish`: full build and safety scans
- `npm test`: Vitest
- `npm run lint`: ESLint
- `npm run images:optimize`: convert remaining PNG/JPEG assets to WebP and update references

A branch is complete only after typecheck, lint, tests, and any build-pipeline checks it affects.
Once green, merge feature branches and `auto/continuous-dev` into `main` and push without another
go-ahead. If `origin/main` has diverged or the merge conflicts, stop instead of resolving it
unattended. This is the July 31, 2026 decision recorded in `feedback_automerge_to_main.md`.

## Images

`src/atlas/assets/imageEncoding.ts` owns published image format and naming. Both ingest paths must
import it rather than copy its constants or conversion rules. Maps remain lossless for labels and
fog redaction; `maps:optimize` owns them. Leave GIFs animated.

## Sources of truth

- Skim the `README.md` table of contents before architectural work.
- For build-pipeline changes, the scan scripts under `scripts/` define the output contract.
- Keep Opus for `scripts/`, `vite.config.ts`, the atlas pipeline, migrations, security,
  architecture, ambiguous specs, and unplanned UI work. The user-level model policy covers the
  rest.

## Handovers

Use project auto-memory `handovers/SESSION.md`; `/handover` writes there. The continuous routine
owns and overwrites `handovers/ACTIVE.md`, so never put a session plan in it. Before executing an
approved multi-phase plan, write it to `SESSION.md`. See `handover_protocol.md` for the full rules.

## Branch cleanup

- Before deleting a branch with commits, tag its tip as `archive/<name>`, push the tag, confirm the
  branch is in no worktree, list it, and wait for user confirmation.
- Auto-delete only branches with no commits past their fork point.
- GitHub's merged status is not a deletion criterion. See `safe_cleanup_protocol.md`.
