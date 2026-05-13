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

**Images** listed in `atlas.images` appear as thumbnails in the side panel; click any thumbnail to open a lightbox. Paths are relative to `public/` (e.g. `assets/images/thornhold.webp`).

### Wikilinks

Standard Obsidian wikilinks are supported in entry bodies:

- `[[Thornhold]]` — link by title
- `[[Thornhold|the Red City]]` — custom display text
- Aliases resolve too (`[[Thorn Hold]]` finds Thornhold)

Wikilinks pointing at notes that don't exist yet are **allowed** — they usually mean "I haven't written that one yet". The build counts them as `unresolvedLinks` (back-compat alias: `brokenLinks`) and renders them as subtle non-clickable text. They never fail a strict player build. Duplicate slugs and invalid `visibility` values still fail strict. In player builds, the raw target name is omitted from the rendered HTML so DM-only entity titles can't leak via tooltips.

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
npm run atlas:build           # DM build — full atlas, %% comments preserved, written to .local-atlas/ (gitignored)
npm run atlas:build:player    # Player-safe + strict — physically removes secrets, written to public/atlas/
npm run atlas:publish         # Player build + Vite build (used by GitHub Action)
```

Output safety: only the **player** build writes to `public/atlas/` (the folder served by Vite and committed to GitHub). DM builds go to `.local-atlas/` so spoiler-bearing JSON can never accidentally ship. Override with `--out` when needed.

Outputs:

- `atlas.json` — worlds, maps, entities, placements, build report
- `search-index.json` — lightweight index for search UI

### What the player build physically removes

Hiding in the UI is not enough — anything shipped to GitHub Pages is inspectable. The `--player` build:

- Drops entities with `visibility: dm` or `hidden`
- Drops entities with `atlas.publish: false`
- Drops their map placements, regions, and routes
- Strips `%% ... %%` DM blocks from remaining bodies (DM build keeps them)
- Treats invalid `atlas.visibility` values as `dm` (and `--strict` fails the build outright)

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

## Updating maps through GitHub web (no CLI)

You can edit maps, layers, and settings entirely through the GitHub website without installing anything locally.

### Step 1 — Open the placement editor in Lovable

1. Open your Lovable project preview.
2. Navigate to `/atlas/edit`.
3. Switch to the **Layers** tab to upload images or adjust layer positions.
4. Switch to the **Map** tab to change canvas size, ocean color, grid, or wrapX.

### Step 2 — Export your changes

- Click **Patch** (Layers tab) to download a `map-layers-<id>.md` file with the new layer YAML.
- Click **Patch** (Map tab) to download a `map-settings-<id>.md` file with the new map settings YAML.
- If you uploaded new images, click **Zip** to download an `atlas-assets-<id>.zip` containing the files at their intended repo paths (`public/atlas/assets/maps/`).

A checklist dialog will appear after each export guiding you through the next steps.

### Step 3 — Apply the patch on GitHub

1. Go to your GitHub repository.
2. Navigate to `content/<world>/_atlas/world.yaml`.
3. Click the pencil icon to edit.
4. Find the map entry with the matching `id` and replace the `layers`, `width`, `height`, `oceanColor`, `wrapX`, or `grid` sections with the exported YAML.
5. Click **Commit changes…** and choose **Commit directly to the `main` branch**.

### Step 4 — Upload assets (if you added images)

1. In your GitHub repo, navigate to `public/atlas/assets/maps/`.
2. Click **Add file → Upload files**.
3. Drag the images from your exported zip (or individually) into the upload area.
4. Click **Commit changes…** and commit to `main`.

### Step 5 — Wait for publish

The `publish-atlas.yml` GitHub Action will automatically run on the commit and deploy the updated atlas to GitHub Pages. You can monitor progress in the **Actions** tab.

---

## Updating maps through Lovable

If you are already working inside Lovable, you can ask Lovable to apply the patch for you.

1. Export the patch from `/atlas/edit` as described above.
2. Open the downloaded `.md` file and copy the YAML block inside the triple-backticks.
3. Paste the YAML into the Lovable chat and say: *"Apply this patch to content/<world>/_atlas/world.yaml under the map entry with id <map-id>."*
4. Lovable will rewrite the file. Review the diff, then commit.

**Note:** Lovable can edit text files directly but may not be able to upload binary image files. If you added new images, you will still need to upload them manually through GitHub web (see above) or commit them locally.

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

## Timeline & in-world calendar

Define a calendar in `content/<world>/_atlas/world.yaml`:

```yaml
calendar:
  name: Reckoning of the Twin Moons
  epochName: AS                # appended to year labels, e.g. "612 AS"
  daysPerWeek: 8
  months:
    - { name: Frostmoon, days: 30 }
    - { name: Thawing,   days: 30 }
    - { name: Greentide, days: 32 }
```

Add `atlas.date` to any entry's frontmatter:

```yaml
---
title: Founding of Thornhold
atlas:
  publish: true
  type: event
  date: "47-3-12"        # YYYY-MM-DD in the world calendar
  summary: Lord Garron raises the red walls...
---
```

`YYYY`, `YYYY-MM`, and `YYYY-MM-DD` are all accepted; missing parts default to the start of the year / month. The build resolves each date against the calendar to produce a sortable integer (`dateValue`) and a pretty label (`dateRaw`).

Open `/atlas/timeline` to see entries grouped by year. Each card links to `/atlas?entity=<id>`, which deep-links to that entry's pin and side panel in the map viewer.

## Search

The header search palette (⌘K / Ctrl+K) does full-text matching across titles, aliases, tags, summaries, and the markdown body, with highlighted snippets around the first hit. Filter chips above the results scope by entry **type** (settlement, event, region, …) and by the most common **tags**.

---

## Roadmap

Implemented:

- **Batch 1 — Foundation**: schema, frontmatter parser, wikilinks, build script, sample vault, README. (US-0001, 0101, 0102, 0103, 0104, 1502, 1503)
- **Batch 2 — Map MVP**: `/atlas` viewer with Leaflet map, placements as pins, side panel with rendered markdown + backlinks, ⌘K search, mobile bottom-sheet. (US-0301, 0302, 0303, 0304, 0305, 0306, 1201)
- **Batch 3 — Safe publishing**: `--player` strict build with physical exclusion of dm/hidden content, GitHub Action, GitHub Pages deploy, "Updated" date in viewer. (US-0105, 0106, 0201, 0202, 0203, 0204, 0701)
- **Batch 4 — Creator convenience**: `/atlas/edit` placement editor with drag-to-place pins, `placements.json` export, `apply-placements` CLI to round-trip back into markdown frontmatter, copy-paste YAML patch. (US-0601, 0602, 0603, 0604, 1303)
- **Batch 5 — Layered maps & regions**: multi-map worlds, image layers, polygon regions linked to entities, fog of war with reveal areas, header map switcher and fog toggle. (US-0801, 0802, 0803, 0804, 0805)
- **Batch 6 — Connections & travel**: routes with entity-id waypoint resolution, per-map scale and travel-mode speeds, distance + travel-time hover tooltips, optional hex/square grid overlay with viewer toggle. See `world.yaml` (`scale`, `grid`, `routes`). (US-0901, 0902, 0903, 0904, 1001)
- **Batch 7 — Search depth & timeline**: full-text search across body with highlighted snippets, type and tag filter chips, in-world calendar in `world.yaml`, `atlas.date` frontmatter on any entry, `/atlas/timeline` page sorted and grouped by year, deep-link from timeline back into the map via `/atlas?entity=<id>`.
- **Batch 8 — Media & viewer polish**: entity `images` rendered as thumbnails in the side panel with a click-to-lightbox Dialog, copy-share-link button per entity, keyboard navigation (↑↓Enter) in the search palette.
- **Batch 9 — Browse & taxonomy**: `/atlas/browse` alphabetical directory of every entry, `/atlas/tag/:tag` and `/atlas/type/:type` landing pages, clickable tag and type chips throughout the side panel, timeline, and directory.

Next:

- **Batch 10 — UX/workflow stabilization**: `/` is a clear landing page; the original in-browser editor moved to `/legacy-editor` (clearly labeled, kept for back-compat). `/atlas/edit` got a **Layers** tab with multi-file image upload (object-URL preview), URL-add with external-asset warning, numeric x/y/width/height/opacity/zIndex inputs, lock-aspect, ±100/±1000/±10000 nudge, 50–150% scale presets, Center / Fit map / Map=layer / Expand / Reset, and a **map layer YAML patch** export with an asset commit checklist. Wikilinks to not-yet-created notes never fail strict player builds and never leak DM-only target names.

- **Batch 11 — GitHub-web-friendly workflow**: export checklist dialogs guide DMs through committing patches via GitHub web or Lovable. README documents the full no-CLI workflow.

- **Batch 12 — Hardening for GitHub-web editing**: `.gitkeep` placeholders for every asset and content folder so they are visible and editable in the GitHub website (`public/atlas/assets/{maps,images,icons,portraits,locations,handouts}` and `content/<world>/{_atlas,_drafts,_dm,settlements,regions,ruins,events,factions,npcs,items}`). New `normalizeAtlasAssetUrl` helper resolves layer/image paths against `import.meta.env.BASE_URL` so `/atlas/assets/...` references render correctly under GitHub Pages project subpaths (e.g. `https://user.github.io/repo-name/`). Used by the player viewer, placement editor, minimap, and layer panel thumbnails. YAML patches still emit human-friendly absolute paths. Added a commented sample `layers:` block to `world.yaml`. Routes are unchanged: `/` landing, `/atlas` player atlas, `/atlas/edit` DM editor (layers + map settings + minimap, patch + zip export), `/legacy-editor` legacy experimental editor.

## Website-only quickstart (no CLI)

You can edit maps and content entirely from the GitHub website.

**A. Upload a map image**

1. Open your repo on GitHub.
2. Navigate to `public/atlas/assets/maps/`.
3. Click **Add file → Upload files** and drag your image (e.g. `overview-map.webp`).
4. Click **Commit changes…** → commit to `main`.

**B. Edit the map config**

1. Open `content/astrath-deeprealm/_atlas/world.yaml`.
2. Click the pencil icon to edit.

**C. Add the layer** under the matching map:

```yaml
layers:
  - id: overview-map
    src: /atlas/assets/maps/overview-map.webp
    x: 0
    y: 0
    width: 200000
    height: 100000
    opacity: 1
    zIndex: 1
```

**D. Commit to `main`.**

**E. The `publish-atlas.yml` GitHub Action runs automatically** and deploys the updated atlas to GitHub Pages. Check the **Actions** tab for progress.

For new content entries, browse the matching folder under `content/astrath-deeprealm/` (settlements, regions, npcs, …), click **Add file → Create new file**, and commit a markdown file with frontmatter as documented above. Files in `_drafts/` and `_dm/` are excluded from the player build by `atlas.config.json`.



## Offline support (PWA)

The published player atlas (`/atlas`) is an installable Progressive Web App with offline support.

### How it works

- A service worker is registered **only in production builds** (i.e. on the published GitHub Pages site).
  It is intentionally **disabled in dev mode** (`npm run dev`) and in the **Lovable editor preview**
  (iframes / `*.lovableproject.com` / `id-preview--*.lovable.app` hosts) to avoid stale caches.
- On first online visit to `/atlas`, the service worker caches:
  - the HTML app shell + built JS/CSS
  - `/atlas/atlas.json` and `/atlas/search-index.json`
  - all local atlas assets under `/atlas/assets/` (maps, images, icons, portraits, handouts)
- Subsequent visits work fully offline.

### Installability

Modern browsers will offer "Install app" / "Add to Home Screen" once the manifest + SW are detected.
The app launches in standalone mode, opens directly at `/atlas`, and uses the bundled compass icon.

### Updates

When a new build is published, the new service worker installs in the background. The next time
you open the app you'll see a small banner:

> Atlas update available. Refresh to load the newest version.

Click **Refresh** to activate the new version. You will not be silently trapped on stale data.

### Manual cache controls

In the `/atlas` toolbar there is a cloud icon. It opens a small menu with:

- **Reload latest atlas** — checks the server for a newer service worker / atlas build.
- **Clear offline cache** — wipes all caches managed by the service worker (use this if something
  feels stuck).

### Caveats

- **First visit must be online.** If you open `/atlas` for the very first time without internet,
  you'll see "Atlas not available offline yet — open it once while online to cache it."
- **External image URLs are not guaranteed offline.** Layers that point at `https://i.pinimg.com/...`
  or other off-site URLs are cached opportunistically (so repeat online visits are fast) but may
  not load when fully offline. For reliable offline maps, commit images to
  `public/atlas/assets/maps/` and reference them with `/atlas/assets/maps/<file>` paths.
- **`/atlas/edit` is a local-only DM tool.** The shell may load offline because it shares the same
  bundle, but it does not push to GitHub or persist DM data anywhere outside your browser.
- **DM builds are never cached as the player atlas.** Only the player-safe `public/atlas/atlas.json`
  produced by `npm run atlas:publish` is treated as the offline source of truth.

## Player handouts (Print / PDF)

Each entity in `/atlas` has a printer icon next to its title. Click it to open a
clean, single-page handout in a new tab — the browser's print dialog pops up
automatically and you can choose **Save as PDF** to share the handout with players.

The handout includes the entity's title, type, summary, hero image, body text,
gallery, and tags. Map chrome, toolbars, and the side panel are excluded.

Tip: hitting **Ctrl+P / Cmd+P** anywhere in `/atlas` also prints the currently
open entity (a fallback print stylesheet hides the rest of the UI).
