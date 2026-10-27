# Goals and acceptance criteria

Agreed with Isak on 2026-10-27 (grilling session). The words are defined in `GLOSSARY.md`.
Open work lives as tickets in `docs/tracker/`; this file says what "working" means.

## What the atlas is for

The players' atlas for Isak's whole D&D world (today `astrath-deeprealm`; the name is likely to
change). Tidemarrow, the continent the campaigns play on, is the first map; other continents come
later as more maps or layers. The vault (`~/Documents/DnD-Campaign-Repository/Vault-DnD`) is where
the DM writes; the atlas fills itself from it through Sync from Obsidian and publishes a
spoiler-safe site on GitHub Pages. The old Astrath sample content (three events, three NPCs from
May) goes once Tidemarrow content is in.

Only Isak and AI agents use the editor; players only see the published site.

## Areas and when each counts as working

### Player safety (the spine)

- A note with no visibility, or an invalid one, never ships: it counts as `dm` everywhere (build,
  Sync, Staging, safety scans). ADR-0001.
- Every safety scan passes before a publish, and CI blocks a publish whose scans fail.
- What the vault keeps DM-only (`10_DmNotesAndSecrets`, `%%` blocks) never appears in the player
  build, the search index or any shipped asset.
- The weekly dependency audit is green (no high or critical production vulnerabilities).

### Sync from Obsidian

The vault folders that sync are `01_Lore`, `02_Regions`, `03_Entities` and `04_Factions`.
`10_DmNotesAndSecrets`, `00_SessionNotes`, `11_DmToolBox`, templates, inbox and archive stay out.

Working means:

- a dry run over the real vault lists what would be created, updated and left alone, and writes
  nothing;
- notes from `01_Lore` and `02_Regions` (already public on the Obsidian site) arrive as `player`;
  notes from `03_Entities` and `04_Factions` arrive as `dm` until the DM tags them;
- a note's title, type (top-level `type:` included) and links survive the trip unchanged;
- running Sync twice changes nothing the second time; a moved or renamed note updates in place
  instead of duplicating.

### The world map

- Tidemarrow is a map with its regions and places pinned, starting from the 16 pins in the vault's
  `02_Regions/World Map.markers.json`.
- Pins, clicks and fog land where they're drawn (the coordinate flip holds on every layer).
- Isak checks the map's look; a ticket that changes it stays `ready-for-human` until he has.

### Tooling and the Mac

- Typecheck, lint and `npm run test:ci` pass on the Mac and the PC; a lone shard's worker timeout
  doesn't fail the run when every test passed.
- The generated-path hook works on both computers.

## Not now

- Renaming the world: one ticket once the new name settles.
- Map-space and editor-draft refactors from the retro (`docs/tracker/code-retro/`, wontfix for now).
- Multi-user, hosted editing, VTT features (see `docs/NON_GOALS.md`).
