# campaign-atlas-final

D&D world atlas: Obsidian markdown -> build pipeline -> `atlas.json` -> dual-mode publish
(player-safe static site + DM editor).

## Hard rules

- **Never hand-edit generated artifacts.** `public/atlas/atlas.json`, `.local-atlas/`, `dist/`
  and `dist-ssr/` are build outputs. Edit the source (YAML frontmatter, `world.yaml`,
  components under `src/`) and rebuild. A pre-tool hook enforces this; if it blocks you, fix
  the source, not the output.
- **Player builds must not contain DM content.** Before calling a build done, run
  `npm run atlas:check-secrets <dir>` and `npm run atlas:check-derived <dir>` against the
  output dir. `npm run atlas:publish` chains both.
- **Editor code is gated.** The visual editor (`AtlasPlacementEditor`, `/__atlas/save`) is
  excluded from player builds by the `__INCLUDE_EDITOR__` define in `vite.config.ts`. Don't
  import editor modules from player-mode entry points.
- **Merges to `main` are automatic.** Once a branch (feature work or the `auto/continuous-dev`
  integration branch) passes its full gate (typecheck, lint, tests, plus `atlas:publish` and
  the scans when the change touches the build pipeline), merge it into `main` and push without
  waiting for a go-ahead. Never force-push. If `origin/main` has diverged so the merge is not a
  clean fast-forward or conflict-free merge, stop and flag it instead of resolving conflicts
  unattended. (User decision 2026-07-31, auto-memory `feedback_automerge_to_main.md`; the
  continuous-dev routine's SKILL.md matches.)

## Commands

- `npm run dev`: full editor + local save endpoint
- `npm run build`: player-safe production build (tree-shakes the editor)
- `npm run atlas:build:player`: strict player atlas -> `public/atlas/`
- `npm run atlas:publish`: full build + all scans
- `npm test`: Vitest
- `npm run lint`: ESLint
- `npm run images:optimize`: convert leftover PNG/JPEG in the image library to WebP and
  repoint references

## Image encoding

`src/atlas/assets/imageEncoding.ts` is the single answer to "what format does a published
image take, and what is it called". Both ingest paths (the editor's picker and the vault embed
copier) import it and convert PNG/JPEG to WebP automatically, so a DM never has to think about
file size. Don't re-declare its constants or convert rule anywhere else; that duplication is
what let 2.3 MB portraits ship.

Out of scope on purpose: maps (kept lossless for fog redaction and map labels;
`maps:optimize` owns them) and GIFs (converting would flatten the animation).

## When in doubt

- `README.md` is the design source of truth and it is long. Skim its TOC before architectural
  changes.
- For build-pipeline changes, the scan scripts under `scripts/` define the contracts the
  output must satisfy.

## Model selection

The general model and subagent policy is in user-level CLAUDE.md. Project specifics:

- Keep on Opus: anything touching `scripts/`, `vite.config.ts`, the atlas build pipeline,
  migrations or security; an ambiguous spec; architectural review; UI/UX with no concrete
  plan; the first session of a multi-phase initiative (the one that writes the handover).
- Good Sonnet hand-offs: executing an approved plan from `handovers/ACTIVE.md`, component work
  with a written spec, test-fix loops against a known spec.

## Handovers

Handovers live in project auto-memory at `handovers/ACTIVE.md`. Never commit one to the repo
as the primary copy, because it gets lost on unmerged branches. When a planning or design phase
ends with an approved plan (including on leaving Plan Mode), write the plan to `ACTIVE.md`
before executing; it is the handover. Full protocol: project memory `handover_protocol.md`.

## Branch cleanup

- Never delete a branch until its tip is tagged `archive/<name>`, that tag is pushed to origin,
  and the branch is not checked out in any worktree. The pushed tag is the safety net, not any
  detection heuristic.
- Auto-delete only branches with no commits past their fork point. For anything with commits:
  tag it, list it, and wait for the user to confirm.
- GitHub's "merged" status is never a deletion criterion, in manual sweeps and in the
  `clean_gone` / auto-delete-on-merge routine alike. Exact commands and rationale: project
  memory `safe_cleanup_protocol.md`.
