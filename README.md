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

Two build modes:

```bash
npm run atlas:build           # DM build — full atlas (all visibilities, source paths, frontmatter)
npm run atlas:build:player    # Player-safe + strict — physically removes secrets
npm run atlas:publish         # Player build + Vite build (used by GitHub Action)
```

Outputs to `public/atlas/`:

- `atlas.json` — worlds, maps, entities, placements, build report
- `search-index.json` — lightweight index for search UI

### What the player build physically removes

Hiding in the UI is not enough — anything shipped to GitHub Pages is inspectable. The `--player` build:

- Drops entities with `visibility: dm` or `hidden`
- Drops entities with `atlas.publish: false`
- Drops their map placements
- Strips `%% ... %%` DM blocks from remaining bodies
- Strips raw `frontmatter` and `sourcePath` from each entity
- Renders broken wikilinks as plain text (so excluded targets' names don't leak via `title=` attributes)

### Strict mode

`--strict` exits non-zero on any warning (broken links, invalid visibility, etc). Used by the publish workflow so a typo doesn't quietly ship.

### Build report

Every build prints a report to stdout: scanned, included, excluded by folder, excluded by visibility, stripped DM blocks, excluded secret pins, broken wikilinks, duplicate slugs, warnings, errors. Errors always fail the build; warnings only fail in strict mode.

---

## Deploying to GitHub Pages

A workflow lives at `.github/workflows/publish-atlas.yml`. It runs on every push to `main` and on manual dispatch.

One-time setup in your GitHub repo:

1. **Settings → Pages → Source**: select **GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions**: **Read and write**.
3. Push to `main` (or trigger the workflow manually from the Actions tab).

The workflow:

- Installs deps with `npm ci`
- Runs `npm run atlas:build:player` (strict)
- Runs `vite build` with `ATLAS_BASE=/<repo-name>/` so asset URLs work under the project subpath
- Uploads `dist/` and deploys to GitHub Pages

For a user/organization site (`https://<user>.github.io/`), edit the workflow's `ATLAS_BASE` to `"/"`.

Local production preview:

```bash
npm run atlas:publish
npx vite preview
```

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

Implemented:

- **Batch 1 — Foundation**: schema, frontmatter parser, wikilinks, build script, sample vault, README. (US-0001, 0101, 0102, 0103, 0104, 1502, 1503)
- **Batch 2 — Map MVP**: `/atlas` viewer with Leaflet map, placements as pins, side panel with rendered markdown + backlinks, ⌘K search, mobile bottom-sheet. (US-0301, 0302, 0303, 0304, 0305, 0306, 1201)
- **Batch 3 — Safe publishing**: `--player` strict build with physical exclusion of dm/hidden content, GitHub Action, GitHub Pages deploy, "Updated" date in viewer. (US-0105, 0106, 0201, 0202, 0203, 0204, 0701)

Next:

- **Batch 4 — Creator convenience**: visual edit mode, drag-to-place pins, export placements back to YAML, markdown export. (US-0601, 0602, 0603, 0604, 1303)

