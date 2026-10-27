# First sync of the four vault folders

Status: ready-for-agent
Blocked by: code-retro 02, 03, 04

## Acceptance criteria

- Sync settings tick `01_Lore`, `02_Regions`, `03_Entities`, `04_Factions`; nothing else.
- A dry run (or Staging, before code-retro 07 exists) is shown to Isak before commit.
- After commit: 01/02 notes are `player`, 03/04 notes `dm`; no note from `10_DmNotesAndSecrets` is in `content/`.
- `npm run atlas:publish` passes; `atlas:check-secrets` and `atlas:check-derived` pass on `dist`.
