# Glossary

The atlas's words. Use these in tickets, tests, UI text and commit messages. Code ids may differ; where they do, the id is in brackets.

## The world

- **Vault**: the DM's Obsidian campaign notes, outside this repo (on the Mac `~/Documents/DnD-Campaign-Repository/Vault-DnD`). The source the DM writes in. _Avoid:_ "canon repo".
- **Atlas content**: the atlas's own copy of the lore, `content/<world>/`. Filled from the vault by sync. _Avoid:_ calling it "the vault".
- **World**: one campaign setting with its own content folder and `world.yaml` (today only `astrath-deeprealm`).
- **`world.yaml`**: the world's maps, layers, regions, routes and fog, in `content/<world>/_atlas/`.
- **Entity**: one note in the atlas (an NPC, a settlement, a faction, an event...). Its **type** comes from frontmatter `atlas.type`, else from its vault folder name.
- **Placement**: an entity's position on a map. _Avoid:_ "marker" for the data (marker is the drawn pin).
- **Map / layer**: a map is an image with its own coordinate space; a layer is one image stacked on a map (for example a floor or a revealed overlay).
- **Fog**: the parts of a map players can't see yet. Baked into player images at build time, never just hidden by CSS.

## Who sees what

- **Visibility**: per entity, one of `player`, `rumor`, `dm`, `hidden`. `player` and `rumor` ship to players; `dm` and `hidden` never do. Missing or invalid means `dm`.
- **DM block**: DM-only text inside a player-visible entity, written `%% ... %%` or `:::dm ... :::`. Stripped from every player string.
- **Secret marker**: `{{secret:...}}` text revealed only in DM builds.
- **DM markup**: DM blocks and secret markers together, the syntax a player build must never contain. Owned by `src/atlas/content/dmMarkup.ts`.
- **Player build**: the published, safety-scanned site in `dist/` and `public/atlas/`. _Avoid:_ "prod build" when you mean the content.
- **DM build**: the local build with everything, in `.local-atlas/`. Never published.
- **Safety scans**: the `atlas:check-*` scripts that must all pass before a player build is safe (secrets, derived secrets, player secrets, image privacy, fog, shape) plus the asset audit.
- **Publish**: a push to `main`, which runs `publish-atlas.yml` and deploys the player build to GitHub Pages. _Avoid:_ "deploy" for a local build.

## The DM's tools

- **Editor**: the DM-only app at `/atlas/edit` in `npm run dev` [`AtlasPlacementEditor`]. Tree-shaken out of player builds. Also called the Creator Cockpit in older docs.
- **Save endpoint**: `/__atlas/save`, the dev-only, loopback-only route the editor writes through.
- **Sync from Obsidian**: the editor panel that reads the vault, shows what changed, and writes chosen notes into atlas content. _Avoid:_ "import" for the whole flow (import is one step of it).
- **Sync map**: `sync-map.json`, which remembers which vault note became which entity.
- **Staging**: sync's preview of changes before they are written.
