# campaign-atlas-final

D&D world atlas: Obsidian markdown → build pipeline → `atlas.json` → dual-mode publish (player-safe static site + DM editor).

## Hard rules

- **Never hand-edit generated artifacts.** `public/atlas/atlas.json`, `.local-atlas/`, `dist/`, and `dist-ssr/` are build outputs. Edit source (YAML frontmatter, `world.yaml`, components under `src/`) and rebuild. A pre-tool hook enforces this — if it blocks you, fix the source, not the output.
- **Player builds must not contain DM content.** Before claiming a build is done, run `npm run atlas:check-secrets <dir>` and `npm run atlas:check-derived <dir>` against the output dir. `npm run atlas:publish` chains both.
- **Editor code is gated.** The visual editor (`AtlasPlacementEditor`, `/__atlas/save`) is excluded from player builds via the `__INCLUDE_EDITOR__` define in `vite.config.ts`. Don't import editor modules from player-mode entry points.
- **`main` merges are automatic, not human-gated.** Once a branch (feature work, or the `auto/continuous-dev` integration branch) passes its full gate — typecheck, lint, tests, and `atlas:publish`/scans where the change touches the build pipeline — merge it into `main` and push to `origin/main` without waiting for a go-ahead. Still respect ordinary git safety: never force-push, and if `origin/main` has diverged in a way that isn't a clean fast-forward or conflict-free merge (e.g. concurrent direct-to-main commits not reachable from the branch being merged), stop and flag it rather than resolving conflicts unattended. Confirmed by the user 2026-07-31 (see auto-memory `feedback_automerge_to_main.md`) — this supersedes the earlier "main is sacred, human merges only" convention that gated the hourly continuous-dev routine; that routine's standing instructions (`~/.claude/scheduled-tasks/campaign-atlas-continuous-development-v2/SKILL.md`) were updated to match.

## Commands

- `npm run dev` — full editor + local save endpoint
- `npm run build` — player-safe production build (tree-shakes editor)
- `npm run atlas:build:player` — strict player atlas → `public/atlas/`
- `npm run atlas:publish` — full build + all scans
- `npm test` — Vitest
- `npm run lint` — ESLint
- `npm run images:optimize` — convert leftover PNG/JPEG in the image library to WebP and repoint references

## Image encoding

`src/atlas/assets/imageEncoding.ts` is the single answer to "what format does a published image take, and what is it called". Both ingest paths — the editor's picker and the vault embed copier — import it and convert PNG/JPEG to WebP automatically, so a DM never has to think about file size. Don't re-declare the constants or the convert rule anywhere else; that duplication is what let 2.3 MB portraits ship.

Out of scope on purpose: **maps** (lossless, for fog redaction and map labels — `maps:optimize` owns them) and **GIFs** (converting would flatten the animation).

## When in doubt

- The source of truth for design is `README.md` (long). Skim its TOC before architectural changes.
- For changes to the build pipeline, the scan scripts under `scripts/` define the contracts the output must satisfy.

<!-- TRIAL: MODEL-SELECTION START (added 2026-05-15 — delete this section alone to revert just model selection) -->
## Model selection — trial rules

General model-tier and subagent policy lives in user-level CLAUDE.md — don't restate it here.
Version-numbered tiers were removed from this file in Aug 2026 after they went stale.

Only the project-specific triggers belong here. **Escalate to the strongest model for:**
- Anything touching `scripts/`, `vite.config.ts`, the atlas build pipeline, migrations, security
- Ambiguous spec needing interpretation; architectural review; UI/UX with no concrete plan
- The *first* session of a multi-phase initiative (the one producing the handover)
- Mid-session: after verification fails twice in the same area, or the third "let me try a
  different approach" reframing — that means the task needs design judgment, not execution
<!-- TRIAL: MODEL-SELECTION END -->

<!-- TRIAL: HANDOVER START (added 2026-05-17 — delete this section alone to revert just the handover protocol) -->
## Handover protocol — trial rules

**Mid-session handoff signal (when running on Opus):**
- When finishing a planning, design, or architectural-review phase — *before* starting execution — stop and **write the handover to `<project-memory>/handovers/ACTIVE.md`** (goal, context, files to touch, success criteria, open questions, branch/PR). Then say:
  > "Planning is done and the handover is saved. Suggest switching to `/model sonnet` and replying `continue` to execute. Staying on Opus is fine if you'd rather not switch."
- Same signal when exiting Plan Mode with an approved plan: write the approved plan to `ACTIVE.md` — it *is* the handover — then prompt the switch.
- Do **not** propose a mid-session switch during execution unless verification has failed twice in the same area and a redesign is needed (in which case: switch *back up* to Opus).
- If the user says "continue" after a handoff signal, treat `ACTIVE.md` as the spec. Don't re-derive the plan; execute it. When the work is done, archive the handover per the protocol.

**Handover discovery (every session, any model):**
- At session start, before planning or clarifying questions, read the project auto-memory `handovers/ACTIVE.md`. If it holds a pending handover, that is the spec — confirm scope with the user, then execute; don't re-derive.
- Never commit handover docs into the repo as the primary copy — they get lost on unmerged branches. Auto-memory is the source of truth. Full protocol: project memory `handover_protocol.md`.
<!-- TRIAL: HANDOVER END -->

<!-- TRIAL: BRANCH-CLEANUP START (added 2026-05-17 — delete this section alone to revert just the cleanup rule) -->
## Branch cleanup safety — trial invariant

- **Never delete a branch unless its tip is first tagged `archive/<name>` and that tag is pushed to origin**, and it is not checked out in any worktree. The pushed tag — not any detection heuristic — is the safety net.
- **Auto-delete only branches provably empty past their fork point. Anything with commits: tag it, list it, wait for explicit user confirmation — never auto-delete.**
- **GitHub "merged" status is informational only — never a deletion criterion.** Applies to manual sweeps and the `clean_gone` / auto-delete-on-merge routine alike. Exact commands + rationale: project memory `safe_cleanup_protocol.md`.
<!-- TRIAL: BRANCH-CLEANUP END -->