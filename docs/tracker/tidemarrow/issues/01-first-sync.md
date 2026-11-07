# First sync of the four vault folders

Status: ready-for-agent
Blocked by: code-retro 02, 03, 04, H-04 (hosting private: Cloudflare Access, repo private)

Waits for H-04 (R-01, 2026-11-07): the GitHub repo is public, so real vault notes can't land in `content/` until hosting is behind Cloudflare Access and the repo is private; Sync refuses real writes and `check-vault-content` fails publish until then. H-04 sets `"hosting": "private"` in `atlas.config.json`.

## Acceptance criteria

- Sync settings tick `01_Lore`, `02_Regions`, `03_Entities`, `04_Factions`; nothing else.
- A dry run (or Staging, before code-retro 07 exists) is shown to Isak before commit.
- After commit: 01/02 notes are `player`, 03/04 notes `dm`; no note from `10_DmNotesAndSecrets` is in `content/`.
- `npm run atlas:publish` passes; `atlas:check-secrets` and `atlas:check-derived` pass on `dist`.
