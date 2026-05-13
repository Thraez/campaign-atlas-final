# AstrathDeeprealm Atlas

A static, GitHub Pages–hosted interactive fantasy atlas and wiki for D&D worlds.

**Architecture rule:** Obsidian markdown is the source of truth. The app does not own canon lore. A build script reads selected markdown files, parses YAML frontmatter and Obsidian wikilinks, and generates static atlas data that the React app loads.

> Status: Foundation (Batch 1) — content pipeline + schema. Map editor and player-safe publishing land in later batches.

---

## Content format

Place markdown files under `content/`. Each file becomes one **Entity**. Pins are *placements* of entities on a map; they are not the entry itself.

### Folder layout

```
content/
  astrath-deeprealm/
    settlements/Thornhold.md
    regions/Ravens-Vale.md
    ruins/The-Old-Keep.md
    dungeons/Deeproot-Cavern.md     # visibility: dm — excluded from player view
    _drafts/Wip-Note.md              # excluded by folder rule
```

Excluded folders (default): `_drafts`, `_dm`, `archive`, `deprecated`. Edit `atlas.config.json` to change.

### Frontmatter

```yaml
---
title: Thornhold                    # optional; defaults to filename
atlas:
  publish: true                     # set false to keep out of player builds
  type: settlement                  # settlement | region | ruin | dungeon | npc | faction | ...
  world: astrath-deeprealm
  visibility: player                # player | dm | hidden | rumor
  aliases: [Thorn Hold, The Red City]
  images: [assets/images/thornhold.webp]
  summary: A red-stone mining city.
  x: 100000                         # optional bootstrap placement coords
  y: 50000
tags: [city, mining]
---
```

Unknown `visibility` values produce a build warning and fall back to `dm`.

### Wikilinks

Standard Obsidian wikilinks are supported in entry bodies:

- `[[Thornhold]]` — link by title
- `[[Thornhold|the Red City]]` — custom display text
- Aliases resolve too (`[[Thorn Hold]]` finds Thornhold)

Broken wikilinks are reported by the build and rendered as `<span class="atlas-broken-link">` so they don't crash the UI.

### DM-only blocks

Any text wrapped in `%% ... %%` (single or multi-line) is stripped during build. Use it for DM context inside otherwise public entries:

```markdown
The lord-mayor seems honorable.

%% DM NOTE: He secretly funds Deeproot Cavern expeditions. %%
```

### Sample vault

A small sample vault ships under `content/astrath-deeprealm/` so the build is runnable out of the box. It includes one DM-only entry, one rumor entry, and one intentional broken wikilink to demonstrate validation output.

---

## Build pipeline

```bash
npm run atlas:build
```

Outputs to `public/atlas/`:

- `atlas.json` — full project (worlds, maps, entities, placements, build report)
- `search-index.json` — lightweight index for search UI

The build script (`scripts/build-atlas.ts`):

1. Reads `atlas.config.json` for content root + include/exclude rules.
2. Walks the content tree, parses frontmatter via `gray-matter`.
3. Strips `%% ... %%` DM blocks.
4. Tokenizes `[[wikilinks]]`, resolves them against titles + aliases.
5. Renders markdown to HTML via `marked`, then re-injects link anchors.
6. Computes backlinks.
7. Writes atlas + search index.

The build prints a report: scanned, included, excluded, stripped DM blocks, broken links, duplicate slugs, and full warning list. The build does not fail on validation warnings (Batch 3 will add an opt-in strict mode for CI deploys).

---

## Schema overview

Defined in `src/atlas/content/schema.ts`. The important rule:

> An **Entity** is a wiki entry. A **MapPlacement** is one position of an entity on one map. They are separate objects with stable IDs so titles can change without breaking links and one entity can appear on multiple maps.

```text
AtlasProject
  ├ worlds:     World[]
  ├ maps:       MapDocument[]
  ├ entities:   Entity[]          # the wiki
  ├ placements: MapPlacement[]    # pins on maps
  └ assets:     AssetRef[]
```

Runtime loading lives in `src/atlas/content/loader.ts` — `loadAtlasContent()` fetches `/atlas/atlas.json`. (Wiring the loader into the existing map UI lands in Batch 2.)

---

## Roadmap

Implemented (Batch 1): US-0001, US-0101, US-0102, US-0103, US-0104, US-1502, US-1503.

Next batches:

- **Batch 2 — Map MVP**: render maps + placements from atlas.json, side panel, search, mobile.
- **Batch 3 — Safe publishing**: physical exclusion of DM/hidden content, GitHub Action, GitHub Pages deploy.
- **Batch 4 — Creator convenience**: visual edit mode, placement export back to YAML.

See the full backlog in project notes.
