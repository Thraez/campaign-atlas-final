# campaign-atlas-final

D&D world atlas: Obsidian markdown → build pipeline → `atlas.json` → dual-mode publish (player-safe static site + DM editor).

## Hard rules

- **Never hand-edit generated artifacts.** `public/atlas/atlas.json`, `.local-atlas/`, `dist/`, and `dist-ssr/` are build outputs. Edit source (YAML frontmatter, `world.yaml`, components under `src/`) and rebuild. A pre-tool hook enforces this — if it blocks you, fix the source, not the output.
- **Player builds must not contain DM content.** Before claiming a build is done, run `npm run atlas:check-secrets <dir>` and `npm run atlas:check-derived <dir>` against the output dir. `npm run atlas:publish` chains both.
- **Editor code is gated.** The visual editor (`AtlasPlacementEditor`, `/__atlas/save`) is excluded from player builds via the `__INCLUDE_EDITOR__` define in `vite.config.ts`. Don't import editor modules from player-mode entry points.

## Commands

- `npm run dev` — full editor + local save endpoint
- `npm run build` — player-safe production build (tree-shakes editor)
- `npm run atlas:build:player` — strict player atlas → `public/atlas/`
- `npm run atlas:publish` — full build + all scans
- `npm test` — Vitest
- `npm run lint` — ESLint

## When in doubt

- The source of truth for design is `README.md` (long). Skim its TOC before architectural changes.
- For changes to the build pipeline, the scan scripts under `scripts/` define the contracts the output must satisfy.

<!-- MODEL-SELECTION-TRIAL START (added 2026-05-15 — delete this block to revert) -->
## Model selection — trial rules

Default: **Sonnet 4.6**. Switch up or down based on signals.

**Haiku 4.5 — use for:**
- Slash-command-only sessions
- Batch template-fill (apply pattern to N files, dossier generation)
- Pure renames / format conversions

**Sonnet 4.6 — use for (this is the default):**
- First message references a handover doc, plan file, or "implement phase X"
- Executing from a written spec under `.claude/plans/` or `docs/superpowers/specs/`
- Multi-file edits with a clear shape; normal bug fixes; writing tests
- Small / well-scoped code review

**Opus 4.7 — use for:**
- Ambiguous spec needing interpretation; "what should we do about X?"
- Architectural review; UI/UX work without a concrete plan
- Anything touching `scripts/`, `vite.config.ts`, atlas build pipeline, migrations, security
- The *first* session of a multi-phase initiative (the one producing the handover)

**Escalate Sonnet → Opus mid-session when:**
- Verification fails twice in a row in the same area
- Third "actually, let me try a different approach" reframing
- The task turned out to need design judgment, not execution

**Agent / subagent rules:**
- No Agent for work achievable in ≤3 direct tool calls — use Grep/Read.
- For >3 parallel codebase lookups: Explore subagent.
- For multi-file implementation with clear shape: Plan agent → write handover → execute on Sonnet in a fresh session.
- When spawning agents, pass `model: "haiku"` for lookup/search work and `model: "sonnet"` for execution. Reserve Opus subagents for synthesis only.

**Mid-session handoff signal (when running on Opus):**
- When finishing a planning, design, or architectural-review phase — *before* starting execution — stop and **write the handover to `<project-memory>/handovers/ACTIVE.md`** (goal, context, files to touch, success criteria, open questions, branch/PR). Then say:
  > "Planning is done and the handover is saved. Suggest switching to `/model sonnet` and replying `continue` to execute. Staying on Opus is fine if you'd rather not switch."
- Same signal when exiting Plan Mode with an approved plan: write the approved plan to `ACTIVE.md` — it *is* the handover — then prompt the switch.
- Do **not** propose a mid-session switch during execution unless verification has failed twice in the same area and a redesign is needed (in which case: switch *back up* to Opus).
- If the user says "continue" after a handoff signal, treat `ACTIVE.md` as the spec. Don't re-derive the plan; execute it. When the work is done, archive the handover per the protocol.

**Handover discovery (every session, any model):**
- At session start, before planning or clarifying questions, read the project auto-memory `handovers/ACTIVE.md`. If it holds a pending handover, that is the spec — confirm scope with the user, then execute; don't re-derive.
- Never commit handover docs into the repo as the primary copy — they get lost on unmerged branches. Auto-memory is the source of truth. Full protocol: project memory `handover_protocol.md`.
<!-- MODEL-SELECTION-TRIAL END -->