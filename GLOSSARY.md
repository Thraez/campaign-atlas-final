# Glossary

The atlas's words. Use these in tickets, tests, UI text and commit messages. Code ids may differ; where they do, the id is in brackets.

## The world

- **Vault**: the DM's Obsidian campaign notes, outside this repo (on the Mac `~/Documents/DnD-Campaign-Repository/Vault-DnD`). The source the DM writes in. _Avoid:_ "canon repo".
- **Atlas content**: the atlas's own copy of the lore, `content/<world>/`. Filled from the vault by sync. _Avoid:_ calling it "the vault".
- **World**: one campaign setting with its own content folder and `world.yaml` (today only `astrath-deeprealm`).
- **`world.yaml`**: the world's maps, layers, regions, routes and fog, in `content/<world>/_atlas/`.
- **Entity**: one note in the atlas (an NPC, a settlement, a faction, an event...). Its **type** comes from frontmatter `atlas.type`, else a flat top-level `type:`; with neither, the build says `note` and Staging guesses from tags or the vault folder name.
- **Note** [`Note`, from `readNote`]: one markdown file as read: its title, id, type, aliases, visibility and whether it is secret. Every reader (build, Staging, merge, safety scans) gets these from `readNote` in `src/atlas/content/readNote.ts`. A note becomes an entity when the build ships it.
- **Content-folder scan** [`scanContentFolder`]: the build's pass over atlas content, applying `include` and `exclude` from `atlas.config.json`. The derived-secrets scan uses the same one.
- **Excluded note**: a note the content-folder scan leaves out (a `_dm/`, `_drafts/`, `archive/` or `deprecated/` folder, or missed by `include`). Never built, and secret whatever its tag: a player link to one is redacted and its names are guarded.
- **Placement**: an entity's position on a map. _Avoid:_ "marker" for the data (marker is the drawn pin).
- **Map / layer**: a map is an image with its own coordinate space; a layer is one image stacked on a map (for example a floor or a revealed overlay).
- **Fog**: the parts of a map players can't see yet. Baked into player images at build time, never just hidden by CSS.

## Schema v2 (the rebuild)

ADR-0003 and ADR-0004. Types in `src/atlas/content/schemaV2.ts`. Used by `content-next/` until cutover.

- **Ocean**: the one canvas every world's top-level maps sit on, described in `_atlas/atlas.yaml` (size, sea style, and `onOcean`: where each top-level map sits) [`AtlasFileV2`].
- **Map tree**: maps nested inside maps (continent, city, dungeon). A map with no `parent` is top-level and sits on the ocean; a child map sits inside its parent, in the same world. Map ids are unique across every world.
- **Frame**: where a child map sits in its parent: `x`, `y`, `width`, `height`, `rotation` in the parent's pixels. `enterZoom` is the parent zoom at which the viewer enters the child. If any part of a frame is under its parent's fog, the child and its whole subtree don't ship to that campaign.
- **Zoom handoff**: zooming the canvas from one view of the map tree to another (ocean, map, child map) with the same ground under the centre: in past a child's enter zoom with the centre in its frame, out below the map's `zoom.min` (or its fitted zoom). A half-level margin keeps it from flipping back [`nextView`, `src/atlas/ocean/zoomHandoff.ts`].
- **Campaign**: one group of players over the same atlas, with its own map states, fog and visibility, and its own player output. Today's site is campaign `main`. _Avoid:_ "world" for a campaign; one campaign can span worlds.
- **Campaign file**: `_atlas/campaigns/<id>.yaml`: a campaign's `id`, `name`, its `notes:` default and its map states and fog, keyed by map id [`CampaignFileV2`]. Every campaign in `atlas.yaml` has one.
- **Map state**: a map's progress in one campaign: `unknown` (the party hasn't found it; doesn't ship), `fogged` (ships with that campaign's fog) or `open`. A map not listed in the campaign file is `unknown`. Separate from visibility, which is the DM's spoiler call: a map ships only when both allow it.
- **`notes:` block**: two things share the name. In `world.yaml`, per-note entries that narrow a note's frontmatter visibility per campaign (`visibility`, `basedOn`, `belongsTo`) [`NoteOverride`]. In a campaign file, `notes: vault | hidden`, how that campaign treats notes with no entry for it: `vault` uses the frontmatter value, `hidden` ships only notes whose entry names the campaign as `player` or `rumor`. A missing campaign `notes:` means `hidden`.

## Who sees what

- **Visibility**: per entity, and per `world.yaml` region, route and sound-only area, one of `player`, `rumor`, `dm`, `hidden`. `player` and `rumor` ship to players; `dm` and `hidden` never do. Missing or invalid means `dm`.
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
- **Sync map**: `sync-map.json`, which remembers which vault note became which entity, one map per
  world.
- **Staging**: sync's preview of changes before they are written.
