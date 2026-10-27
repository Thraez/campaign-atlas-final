# Decisions

Closed 2026-10-27: new decisions go in `docs/adr/` (see `docs/agents/domain.md`). Kept as history.

Each entry: date, decision, why. Newest last. More are recorded as memory files (`feedback_*.md`).

- **2026-07-31** Auto-merge gated work to `main` and push without asking
  (`feedback_automerge_to_main.md`). **Reversed 2026-10-11:** agents now ask before any push or
  merge to `main`, because `publish-atlas.yml` deploys on push to `main`.
- **2026-10-02** Session handovers go to `handovers/SESSION.md`; the continuous routine owns
  `ACTIVE.md` (commit `8245709b`). Keeps a session plan from being overwritten by the routine.
- **2026-10-02** Force-push is denied in `.claude/settings.json` (commit `8245709b`).
- **2026-10-11** The generated-path hook fails closed: bad or missing input blocks the write
  (commit `89724d4c`).
- **2026-10-11** Importer ignore list gains `00_templates`, `98_templates`, `z_archive`,
  `90_inbox`, `z_codex_proposals` for the restructured D&D vault. The importer infers types from
  `03_Entities/NPCs`, `03_Entities/Gods`, `02_Regions/Places`; renaming them needs an importer change.
- **2026-10-27** The continuous-dev routine is retired; its docs are in `docs/archive/`. Matt
  Pocock's skills replace the old process (`docs/agents/workflow.md`). Last entry here.
