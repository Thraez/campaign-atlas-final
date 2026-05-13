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

## Placement editor (DM-only)

Visit `/atlas/edit` to drag pins onto the map for any entity in the built atlas. The page is local-only — your edits are stored in browser localStorage and never written to the repo until you export them.

Workflow:

1. `npm run atlas:build` — generate the DM `atlas.json` (so the editor knows which entities exist).
2. Open `/atlas/edit`. Use **Crosshair** on an unplaced entity, click the map; or drag any existing pin to nudge it.
3. **placements.json** — download the merged set of pins.
4. Apply them back into your markdown frontmatter:
   ```bash
   npm run atlas:apply-placements -- placements.json
   npm run atlas:build
   ```
   This rewrites each entity's frontmatter with `atlas.x` / `atlas.y`.
5. Or, if you prefer to copy-paste manually, use **Patch.md** instead — it gives you per-entity YAML snippets.

Commit the markdown changes; the GitHub Action will publish the player atlas with the new pin coordinates.

---

## Maps, regions, and fog (`world.yaml`)

Per-world map definitions live in `content/<world>/_atlas/world.yaml`. This is where you define multiple base maps, image layers stacked on each map, polygon regions linked to wiki entries, and fog-of-war reveal areas.

```yaml
maps:
  - id: astrath-deeprealm-overview
    name: Overview
    width: 200000
    height: 100000
    oceanColor: "#18313f"
    layers:
      - id: continent
        src: /atlas/assets/continent.webp
        x: 0
        y: 0
        width: 200000
        height: 100000
        opacity: 1

regions:
  - id: ravens-vale-region
    mapId: astrath-deeprealm-overview
    name: Raven's Vale
    entityId: ravens-vale          # clicking the polygon opens this entity
    color: "#7fb069"
    visibility: player              # dm-only regions are stripped in player builds
    points: [[80000,35000],[120000,32000],[128000,55000],[95000,62000],[78000,50000]]

fog:
  - mapId: astrath-deeprealm-overview
    enabled: true
    color: "rgba(8,12,20,0.55)"
    reveals:
      - [[40000,30000],[140000,30000],[140000,85000],[40000,85000]]
```

In the player viewer:

- A **map switcher** appears in the header when more than one map is defined.
- **Regions** are clickable polygons that fly to and open their linked entity.
- **Fog** is a dark mask covering the whole map with the listed reveal polygons cut out (SVG `evenodd` fill rule). Toggle it via the eye button in the header.

Coordinates use each map's pixel space with origin `(0, 0)` at the top-left.

---

## Roadmap

Implemented:

- **Batch 1 — Foundation**: schema, frontmatter parser, wikilinks, build script, sample vault, README. (US-0001, 0101, 0102, 0103, 0104, 1502, 1503)
- **Batch 2 — Map MVP**: `/atlas` viewer with Leaflet map, placements as pins, side panel with rendered markdown + backlinks, ⌘K search, mobile bottom-sheet. (US-0301, 0302, 0303, 0304, 0305, 0306, 1201)
- **Batch 3 — Safe publishing**: `--player` strict build with physical exclusion of dm/hidden content, GitHub Action, GitHub Pages deploy, "Updated" date in viewer. (US-0105, 0106, 0201, 0202, 0203, 0204, 0701)
- **Batch 4 — Creator convenience**: `/atlas/edit` placement editor with drag-to-place pins, `placements.json` export, `apply-placements` CLI to round-trip back into markdown frontmatter, copy-paste YAML patch. (US-0601, 0602, 0603, 0604, 1303)
- **Batch 5 — Layered maps & regions**: multi-map worlds, image layers, polygon regions linked to entities, fog of war with reveal areas, header map switcher and fog toggle. (US-0801, 0802, 0803, 0804, 0805)
- **Batch 6 — Connections & travel**: routes with entity-id waypoint resolution, per-map scale and travel-mode speeds, distance + travel-time hover tooltips, optional hex/square grid overlay with viewer toggle. See `world.yaml` (`scale`, `grid`, `routes`). (US-0901, 0902, 0903, 0904, 1001)

Next:

- **Batch 7 — Search depth & timeline**: full-text search across body, tag/type filters, optional in-world calendar timeline.

