AstrathDeeprealm Atlas
A static, GitHub Pages hosted interactive fantasy atlas and wiki for D&D worlds.

For most readers, start with the focused docs in [docs/](docs/):

- [docs/QUICK_START.md](docs/QUICK_START.md) — zero to published in 10 minutes.
- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) — what this is and who it's for.
- [docs/VISIBILITY_AND_PLAYER_SAFETY.md](docs/VISIBILITY_AND_PLAYER_SAFETY.md) — how DM content stays hidden.
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — daily session-prep loop, save plugin, rollback.
- [docs/IMPORT_EXPORT.md](docs/IMPORT_EXPORT.md) — bringing in an Obsidian vault, backups.
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) — Obsidian feature support, constraints.
- [docs/NON_GOALS.md](docs/NON_GOALS.md) — what we won't build.

The rest of this file is the long-form design doc. It covers the same ground as the focused docs in greater depth.

Architecture rule: Obsidian markdown and YAML are the source of truth. The app does not own canon lore. The app reads selected markdown files, parses YAML frontmatter and Obsidian wikilinks, reads `world.yaml`, then generates static atlas data for the React viewer.
The intended workflow is:
```text
Obsidian markdown + YAML canon
  -> build script
  -> generated atlas.json and search-index.json
  -> GitHub Pages player atlas
```
The DM should normally work through the visual editor in `/atlas/edit`. YAML remains the storage format, but the tool generates and validates patches so you do not have to hand-author YAML for normal map work.
---
Current status
Implemented and shipping:
Source-generated atlas from markdown vault content
Strict player-safe build
GitHub Pages auto-publish workflow
Multi-map worlds
Image map layers
Pins and multi-map placements
Pin presets, labels, and visibility styles
Regions, fog, routes, grid, and scale
Real overview map wired through `world.yaml`
`/atlas` player viewer
Side panel with rendered markdown
Search palette
Browse, tag, and type pages
Timeline with in-world calendar support
Minimap
Offline PWA for production builds
Print / PDF player handouts
`/atlas/edit` Creator Cockpit for DM prep
Visual editor tabs for pins, maps, regions, routes, fog, entities, import, and publish check
Unified YAML patch export workflow
Build and validation tests for spoiler safety and `world.yaml` behavior
---
Core design model
The project has three layers:
```text
Canon layer:
  content/**/*.md
  content/<world>/_atlas/world.yaml

Generated layer:
  public/atlas/atlas.json
  public/atlas/search-index.json

UI layer:
  /atlas       player-safe viewer
  /atlas/edit  local/private DM creator cockpit
```
Do not treat `atlas.json` as canon. It is generated output.
Do not store secrets in the published player build. Anything shipped to GitHub Pages can be inspected.
---
Most common mistake
Do not paste an entire exported patch file into `world.yaml`.
Exported patch files may contain comment headers explaining where a block goes. `world.yaml` itself must be pure YAML.
Also note: `/atlas/edit` no longer exists on the published player site. The editor route lives in `npm run dev` only — the player production build physically excludes it.
Do not paste:
```markdown
```yaml
maps:
  - id: ...
```
```

Do paste only the YAML inside the fence:

```yaml
maps:
  - id: astrath-deeprealm-overview
    name: Overview
```
The build fails loudly if `world.yaml` contains markdown code fences.
---
Folder layout
Place markdown files under `content/`. Each file becomes one Entity.
```text
content/
  astrath-deeprealm/
    _atlas/
      world.yaml
    settlements/
      Thornhold.md
    regions/
      Ravens-Vale.md
    ruins/
      The-Old-Keep.md
    events/
      The-Sundering.md
    factions/
    npcs/
    items/
    dungeons/
      Deeproot-Cavern.md
    _drafts/
      Wip-Note.md
    _dm/
      Secret-Prep.md
```
Default excluded folders:
```text
_drafts
_dm
archive
deprecated
```
Edit `atlas.config.json` to change included or excluded folders.
---
Entity frontmatter
Each markdown file can include an `atlas:` block.
```yaml
---
title: Thornhold
atlas:
  publish: true
  type: settlement
  world: astrath-deeprealm
  visibility: player
  aliases:
    - Thorn Hold
    - The Red City
  images:
    - /atlas/assets/images/thornhold.webp
  summary: A red-stone mining city carved into the southern bluffs.
  placements:
    - mapId: astrath-deeprealm-overview
      x: 100000
      y: 50000
      label: Thornhold
      pin:
        preset: settlement
        priority: 5
        labelMode: auto
        labelMinZoom: -1
tags:
  - city
  - mining
---
```
Important fields
Field	Purpose
`title`	Display title. Defaults to filename if omitted.
`atlas.publish`	Set `false` to exclude from player builds.
`atlas.type`	Entity category, such as settlement, region, ruin, npc, faction, event, item.
`atlas.world`	World id. Defaults to `defaultWorld` from `atlas.config.json`.
`atlas.visibility`	`player`, `rumor`, `dm`, or `hidden`.
`atlas.aliases`	Extra names that wikilinks can resolve to.
`atlas.images`	Player-visible image paths.
`atlas.summary`	Short side-panel and search summary.
`atlas.placements`	One or more pin placements across maps.
`atlas.profile`	Optional player and DM profile data.
`atlas.relationships`	Optional explicit entity relationships.
Unknown `visibility` values produce a build warning and fall back to `dm`. In strict player builds, invalid visibility fails the build.
---
Placements and pins
An Entity is the wiki entry. A MapPlacement is one position of that entity on one map.
One entity can appear on multiple maps:
```yaml
atlas:
  placements:
    - mapId: astrath-deeprealm-overview
      x: 100000
      y: 50000
    - mapId: astrath-deeprealm-northern-reaches
      x: 30000
      y: 20000
```
Legacy single-map coordinates are still supported:
```yaml
atlas:
  x: 100000
  y: 50000
```
But new work should prefer `atlas.placements[]`.
Pin style overrides
Pins use type-based presets by default. You can override style per placement:
```yaml
atlas:
  placements:
    - mapId: astrath-deeprealm-overview
      x: 100000
      y: 50000
      label: Thornhold
      pin:
        preset: settlement
        color: gold
        icon: city
        shape: pin
        labelMode: auto
        labelMinZoom: -1
        priority: 5
```
The visual editor can generate these patches for you.
---
Profiles
Profiles are optional structured DM/player data for improvisation.
```yaml
atlas:
  profile:
    player:
      known_for: Guides travelers across the marsh.
      visible_traits:
        - Soft-spoken
        - Keeps looking at the river
      rumors:
        - He knows where the drowned shrine is.
    dm:
      wants: To keep his daughter out of the river cult's debt.
      fears: The party learning he ferried cultists across the marsh.
      will_not: Harm a child or lie under oath.
      secret: He carries a shrine-token under his tongue.
      pressure: Debt collectors arrive after every new moon.
```
Player builds include only `profile.player`.
Player builds exclude `profile.dm`.
Use the DM-only profile fields for emotional and behavioral handles:
wants
fears
will not
secret
pressure
methods
public face
hidden pressure
---
Relationships
Relationships are explicit links between entities. They complement wikilinks.
```yaml
atlas:
  relationships:
    - entity: thornhold
      type: trades_with
      label: iron trade
      visibility: player
    - entity: deeproot-cavern
      type: secretly_funds
      label: secret expedition funding
      visibility: dm
```
Player builds exclude `dm` and `hidden` relationships.
A player-visible relationship pointing to a DM-only or hidden entity is treated as a spoiler leak and is blocked by strict safety checks.
---
Wikilinks
Standard Obsidian wikilinks are supported in markdown bodies.
```markdown
[[Thornhold]]
[[Thornhold|the Red City]]
[[Folder/Note]]
[[Note#Heading]]
[[Note#Heading|Display text]]
```
Aliases resolve too. For example, `[[Thorn Hold]]` can resolve to `Thornhold`.
Unresolved wikilinks are allowed. They usually mean the note has not been written yet. They render as non-clickable text and do not fail strict player builds.
In player builds, links to excluded DM-only entities are rendered safely so target names do not leak through HTML attributes.
---
DM-only markdown blocks
Any text wrapped in Obsidian comment syntax is stripped during player builds:
```markdown
The lord-mayor seems honorable.

%% DM NOTE: He secretly funds Deeproot Cavern expeditions. %%
```
DM builds keep these blocks.
Player builds strip them.
---
World config: `world.yaml`
Per-world map definitions live here:
```text
content/<world>/_atlas/world.yaml
```
This file defines:
maps
image layers
regions
routes
fog
grid
scale
calendar
`world.yaml` is canon. The visual editor can generate patches for it.
---
Map basics
```yaml
maps:
  - id: astrath-deeprealm-overview
    name: Overview
    width: 200000
    height: 100000
    oceanColor: "#18313f"
    wrapX: false
    scale:
      unitsPerPixel: 0.05
      unitLabel: mi
    grid:
      kind: hex
      size: 5000
      color: "rgba(255,255,255,0.06)"
      enabled: false
    layers:
      - id: overview-map
        src: /atlas/assets/maps/map.jpg
        x: 0
        y: 0
        width: 200000
        height: 100000
        opacity: 1
        zIndex: 1
```
Coordinates use map pixel space, with origin `(0, 0)` at the top-left.
---
Geometry formats
`world.yaml` supports two equivalent geometry formats.
The older top-level format is still supported:
```yaml
regions:
  - id: ravens-vale-region
    mapId: astrath-deeprealm-overview
    name: Raven's Vale
    entityId: ravens-vale
    color: "#7fb069"
    fillOpacity: 0.18
    visibility: player
    points:
      - [80000, 35000]
      - [120000, 32000]
      - [128000, 55000]
      - [95000, 62000]
      - [78000, 50000]

routes:
  - id: kings-road
    mapId: astrath-deeprealm-overview
    name: The King's Road
    mode: horse
    speed: 6
    color: "#f4c95d"
    weight: 3
    visibility: player
    waypoints:
      - thornhold
      - sunhaven

fog:
  - mapId: astrath-deeprealm-overview
    enabled: true
    color: "rgba(8, 12, 20, 0.55)"  # DM-side preview tint; player build paints map.oceanColor instead
    featherPx: 16                    # soft-edge band width on the player build
    reveals:
      - [[40000, 30000], [140000, 30000], [140000, 85000], [40000, 85000]]
    conceals:                        # "draw fog" polygons that subtract from the reveals
      - [[80000, 50000], [100000, 50000], [100000, 70000], [80000, 70000]]
```
The Creator Cockpit exports the newer map-nested format:
```yaml
maps:
  - id: astrath-deeprealm-overview
    name: Overview
    width: 200000
    height: 100000
    regions:
      - id: ravens-vale-region
        name: Raven's Vale
        entityId: ravens-vale
        color: "#7fb069"
        fillOpacity: 0.18
        visibility: player
        points:
          - [80000, 35000]
          - [120000, 32000]
          - [128000, 55000]
          - [95000, 62000]
          - [78000, 50000]
    routes:
      - id: kings-road
        name: The King's Road
        mode: horse
        speed: 6
        color: "#f4c95d"
        weight: 3
        visibility: player
        waypoints:
          - thornhold
          - sunhaven
    fog:
      enabled: true
      color: "rgba(8, 12, 20, 0.55)"  # DM-side preview tint; player build paints map.oceanColor instead
      featherPx: 16                    # soft-edge band width on the player build
      reveals:
        - [[40000, 30000], [140000, 30000], [140000, 85000], [40000, 85000]]
      conceals:                        # "draw fog" polygons that subtract from the reveals
        - [[80000, 50000], [100000, 50000], [100000, 70000], [80000, 70000]]
```
For nested `maps[].regions`, `maps[].routes`, and `maps[].fog`, `mapId` is inferred from the parent map.
If a nested entry declares a different `mapId`, the build warns and uses the parent map id.
If top-level and nested geometry both exist, the loader merges them. Duplicate region or route ids warn and the first definition wins. Duplicate fog for the same map warns and the first definition wins.
---
Regions
Regions are clickable polygons.
```yaml
regions:
  - id: thornhold-domain
    mapId: astrath-deeprealm-overview
    name: Thornhold Domain
    entityId: thornhold
    color: "#f4c95d"
    fillOpacity: 0.14
    strokeOpacity: 0.85
    visibility: player
    points:
      - [40000, 60000]
      - [70000, 58000]
      - [72000, 80000]
      - [42000, 82000]
```
In the viewer, a region can open its linked entity.
In the editor, regions are drawn above map image layers and below routes, fog, pins, labels, and editor handles.
---
Routes
Routes can use raw coordinate waypoints or entity waypoints.
```yaml
routes:
  - id: ravens-trail
    mapId: astrath-deeprealm-overview
    name: Raven's Trail
    mode: foot
    speed: 3
    color: "#7fb069"
    dashed: true
    visibility: player
    waypoints:
      - sunhaven
      - ravens-vale
      - the-old-keep
```
Supported route modes:
```text
foot
horse
ship
cart
fly
custom
```
Entity waypoints resolve through map placements. If a route uses a player-visible waypoint that points to a DM-only entity, strict safety checks block it.
Routes show distance and travel-time tooltips when the map has a `scale`.
---
Fog
Fog covers a map except where reveal polygons cut holes. The Fog tab also lets you draw conceal polygons ("draw fog") that subtract from the revealed area, and set a soft-edge width.
```yaml
fog:
  - mapId: astrath-deeprealm-overview
    enabled: true
    color: "rgba(8, 12, 20, 0.55)"
    reveals:
      - [[40000, 30000], [140000, 30000], [140000, 85000], [40000, 85000]]
```
In the player viewer, fog can be toggled with the eye button in the header.
In the editor, the Fog tab can author reveal polygons, reveal around pins, reveal around routes, and reveal selected regions.

### Fog is enforced in player builds

When `fog.enabled` is true on a map, the player build does three things:

1. The map's image layers are rasterized through a feathered alpha mask
   (`featherPx` wide, default 16). Fogged pixels are transparent; the
   player viewer paints `map.oceanColor` behind them.
2. The player `atlas.json` carries only `{ mapId, enabled: true }` for
   that map — `reveals`, `conceals`, `featherPx`, and `color` are stripped.
3. Pins, routes, and regions inside fog are removed from the player build.

An independent `npm run atlas:check-fog` scan re-derives the boundary from
the source `world.yaml` and fails the build if any layer image, geometry
field, in-fog content, or alpha pixel leaked. It runs as part of
`npm run atlas:publish`.

Full spec: `docs/superpowers/specs/2026-05-19-fog-player-mechanic-design.md`.
---
Calendar and timeline
Define a calendar in `world.yaml`:
```yaml
calendar:
  name: Reckoning of the Twin Moons
  epochName: AS
  daysPerWeek: 8
  months:
    - { name: Frostmoon, days: 30 }
    - { name: Thawing,   days: 30 }
    - { name: Greentide, days: 32 }
    - { name: Highsun,   days: 32 }
    - { name: Goldfall,  days: 30 }
    - { name: Longnight, days: 30 }
```
Add `atlas.date` to any entry:
```yaml
---
title: Founding of Thornhold
atlas:
  publish: true
  type: event
  date: "47-3-12"
  summary: Lord Garron raises the red walls.
---
```
Accepted date formats:
```text
YYYY
YYYY-MM
YYYY-MM-DD
```
Open `/atlas/timeline` to view dated entries grouped by year.
---
Player build safety
Hiding secrets in the UI is not enough. Anything shipped to GitHub Pages is inspectable.
The strict player build physically removes unsafe content.
```bash
npm run atlas:build:player
```
Player builds:
Drop entities with `visibility: dm` or `visibility: hidden`
Drop entities with `atlas.publish: false`
Drop placements for excluded entities
Drop DM-only and hidden relationships
Drop DM profile fields
Strip `%% ... %%` DM blocks
Strip raw `frontmatter`
Strip `sourcePath`
Render unsafe/broken wikilinks as plain text
Fail on invalid visibility in strict mode
Fail on missing local player-visible assets in strict mode
Block player-visible relationships to DM-only or hidden entities
Block player-visible regions/routes that expose DM-only entities
DM builds go to `.local-atlas/` and are gitignored:
```bash
npm run atlas:build
```
Only the player build writes to `public/atlas/`.
---
Build commands
```bash
npm install

npm run atlas:build
npm run atlas:build:player
npm run atlas:publish
npm test
```
Scripts:
Script	Purpose
`npm run atlas:build`	DM build to `.local-atlas/`. Keeps DM content.
`npm run atlas:build:player`	Strict player build to `public/atlas/`.
`npm run atlas:publish`	Player build plus Vite production build + all safety scans.
`npm run atlas:check-secrets`	Scan a built artifact for sentinel-string DM leaks.
`npm run atlas:check-derived`	Scan a built artifact for verbatim hidden/dm entity name leaks.
`npm run atlas:check-shape`	Structural check on `atlas.json` (visibility / sourcePath / frontmatter / DM block).
`npm test`	Runs Vitest test suite.
Generated files:
```text
public/atlas/atlas.json
public/atlas/search-index.json
```
These are runtime files, not canon.
---
## Development

After cloning, run `npm install`. The `prepare` script installs a pre-commit hook that runs `tsc --noEmit`, `eslint .`, and `vitest run --changed` before every commit. A failure in any of those blocks the commit.

To bypass intentionally (e.g. for a WIP commit), use `git commit --no-verify`.

---
## Build modes

The Vite app ships in two physical shapes. The editor route, the `AtlasPlacementEditor` component, and the dev-only local-save endpoint are tree-shaken out of the player bundle.

- `npm run dev` — full editor + local Save endpoint, used for daily authoring.
- `npm run build` — player-safe production build; excludes editor code AND the local-save endpoint (Vite tree-shaking via `__INCLUDE_EDITOR__` + the save plugin's `apply: "serve"`).
- `npm run build:player` — alias for `npm run build`.
- `npm run build:editor` — full editor in a built artifact. Rarely needed; prefer `npm run dev`.
- `npm run atlas:check-secrets <dir>` — sentinel scan over any directory. Catches DM-content sentinels and editor-code fingerprints (e.g. `/__atlas/save`, `saveAtlasPatchToLocalFs`, `AtlasPlacementEditor`, `/atlas/edit`).
- `npm run atlas:check-shape <atlas.json>` — structural assertions over the player atlas.json.
- `npm run atlas:publish` — full publish chain: build player atlas → vite build → both sentinel scans → shape scan.

---
## Verifying the player build is clean

After `npm run build`, the editor strings must not appear anywhere in `dist/`. Pick the shell that matches your environment:

PowerShell:
```
npm run build
Select-String -Path "dist\**\*.*" -Pattern "AtlasPlacementEditor","/__atlas/save","saveAtlasPatchToLocalFs","/atlas/edit" -SimpleMatch
```

CMD (findstr):
```
npm run build
findstr /S /M /C:"AtlasPlacementEditor" /C:"/__atlas/save" /C:"saveAtlasPatchToLocalFs" /C:"/atlas/edit" dist\*
```

Git Bash / Unix:
```
npm run build
grep -r "AtlasPlacementEditor\|/__atlas/save\|saveAtlasPatchToLocalFs\|/atlas/edit" dist/
```

Expected: zero matches. `npm run atlas:check-secrets dist` runs the same scan with a non-zero exit code on any leak.

---
GitHub Pages deployment
The workflow file is:
```text
.github/workflows/publish-atlas.yml
```
It runs on pushes to `main` and manual dispatch.
One-time GitHub setup:
Go to Settings -> Pages -> Source.
Select GitHub Actions.
Go to Settings -> Actions -> General -> Workflow permissions.
Select Read and write.
Push to `main`.
The workflow:
```text
npm ci
npm run atlas:build:player
vite build with ATLAS_BASE=/<repo-name>/
upload dist/
deploy to GitHub Pages
```
For a user or organization root site, set `ATLAS_BASE=/`.
---
## ⚠️ Where do your secrets live? (source-repo privacy)

The player-safe build protects the **published artifact** at `https://<you>.github.io/<repo>/`. It does NOT protect the **source repository**.

If your repo on github.com is public, every file under `content/` — including `_dm/`, `_drafts/`, and any note with `visibility: dm` — is browsable on GitHub itself, regardless of how clean the player atlas is.

Three options:

1. **Private source repo + public Pages (recommended).** Make the repo private; on paid plans Pages still publishes a public site from a private repo, or use option 3.
2. **Public repo, scrubbed source.** Move DM-only notes outside the repo.
3. **Split repos:** private source builds and pushes generated `dist/` to a separate public Pages repo.

The sentinel scan catches leaks in the published artifact. It cannot catch the case where a DM commits `content/_dm/Secret.md` to a public source repo. That's a repository-privacy decision.

Sanity check: open `https://github.com/<you>/<repo>/tree/main/content` in an incognito tab. Whatever you see there is what every player can see too.

---
Player viewer
Open:
```text
/atlas
```
Player viewer features:
Interactive map
Map switcher
Pin markers
Pin labels with priority and zoom behavior
Region polygons
Route lines with distance/travel-time tooltips
Fog-of-war overlay
Optional grid overlay
Minimap
Search palette
Side panel with rendered markdown
Entity images and lightbox
Share-link button
Print/PDF handout button
Timeline link
Browse link
Offline/PWA controls
The public player viewer does not advertise DM tools in production. The "Edit pins" link appears only when DM tools are enabled.
---
DM Creator Cockpit
Open:
```text
/atlas/edit
```
This is a local/private DM tool. It is not the source of truth. It creates local draft changes, then exports YAML/frontmatter patches that you commit.
The Creator Cockpit currently includes:
Pins
Maps
Regions
Routes
Fog
Entities
Import
Publish Check
Pins tab
Use this to:
place unplaced entities
drag pins
nudge pins
edit coordinates in advanced mode
duplicate placements to other maps
remove placements
reset draft changes
change labels and pin style overrides
export entity frontmatter placement patches
Maps tab
Use this to:
change map size
change ocean color
enable/disable horizontal wrap
edit grid and scale
upload map layers
add external URL layers
move, resize, scale, center, fit, and reorder layers
export world map/layer patches
export uploaded assets as a zip
Regions tab
Use this to:
draw region polygons
edit vertices
move regions
duplicate regions
link regions to entities
set visibility
export `world.yaml` region patches
Routes tab
Use this to:
draw routes
use coordinate waypoints
use entity waypoints
use mixed waypoints
set travel mode and speed
set color, weight, and dashed styling
export `world.yaml` route patches
Fog tab
Use this to:
enable or disable fog
set fog color
draw reveal polygons
draw reveal circles
reveal around a pin
reveal around a route
reveal a selected region
export `world.yaml` fog patches
Entities tab
Use this to:
edit visibility
edit summary
edit aliases
edit images
edit profile data
edit relationships
export entity frontmatter patches
Import tab
Use this to review imported Obsidian/markdown content and identify missing metadata or safe defaults.
Publish Check tab
Use this before publishing to check:
player-safety issues
invalid YAML/content
missing summaries
missing assets
unresolved relationships
player-visible links to DM-only content
empty maps
pins outside bounds
route/region/fog problems
local draft changes not exported
---
## Save workflow (local repo)

The editor writes directly to your local repository via the Vite dev server. There is no GitHub API, no token, no PR — you control git fully.

Daily flow:

1. `cd C:\path\to\campaign-atlas-final`
2. `npm run dev`
3. Open `http://localhost:8080/atlas/edit`
4. Edit pins, regions, routes, fog, layers visually.
5. Click **Save**; review the diff; click **Save to disk**.
6. Files are now modified on disk. Run `git status` to see what changed.
7. `git add <paths>`, `git commit -m "..."`, `git push`.
8. The publish workflow runs on push; check the Actions tab.

Safety guards (always in place):

- The save endpoint at `/__atlas/save` only exists during `npm run dev`. Production builds physically do not contain it — the Vite plugin uses `apply: "serve"`, and a post-build sentinel scan verifies the endpoint string is absent from `dist/`.
- The endpoint refuses to write any path outside the source allowlist: `content/**/_atlas/*.yaml`, `content/**/_atlas/*.yml`, and `content/**/*.md`. Even a buggy or malicious payload cannot touch `package.json`, `public/atlas/`, `.github/`, or any generated file.
- The editor route `/atlas/edit` is also excluded from production builds via `__INCLUDE_EDITOR__` gating.

Scope: the Save button reuses the same payload as Export Patch. For data Export Patch doesn't handle (e.g., creating brand-new markdown lore files), edit those files directly in your editor of choice and commit them yourself, or use the existing Obsidian import flow.

Fallback: Export Patch is still available. It downloads a `.yaml` patch file you can paste anywhere (GitHub web edit, Lovable chat, etc.). Use it when you're editing from a machine that doesn't have the repo cloned, or when you want a portable patch file for review.

---
DM tools flag
The public player atlas should not advertise editor entry points.
DM tools are controlled by:
```text
VITE_ENABLE_DM_TOOLS=true
```
Behavior:
Development mode defaults DM tools on.
Production mode defaults DM tools off.
Set `VITE_ENABLE_DM_TOOLS=true` or `VITE_ENABLE_DM_TOOLS=1` to show editor links.
The `/atlas/edit` route stays mounted, but visible links to it are hidden in production unless explicitly enabled.
---
Save workflow (canonical, default)
Pin placement edits in `/atlas/edit` are kept in browser localStorage until you click **Save**. Save then:
1. Reads the current `.md` for each affected entity (dev-only `/__atlas/read` endpoint).
2. Patches `atlas.placements[]` in the frontmatter, preserving placements on other maps.
3. Writes the new `.md` back through `/__atlas/save` (dev-only, allowlist-guarded).
4. Triggers `npm run atlas:build`, so `public/atlas/atlas.json` regenerates immediately.
The player view at `/atlas` shows your changes on reload. Commit with `git` when you're ready to publish.
Per-tab exports for **Regions**, **Routes**, **Fog**, **Map layers**, and **Entity frontmatter** still produce YAML patch snippets you paste into `world.yaml` (or an `.md` frontmatter). These survive because the canonical save path currently only covers placements — extending it to cover the rest is a follow-up.
---
GitHub web workflow, no CLI
You can update maps and content from the GitHub website.
Upload a map image
Open the repository on GitHub.
Navigate to `public/atlas/assets/maps/`.
Click Add file -> Upload files.
Upload the image.
Commit to `main`.
Edit `world.yaml`
Navigate to `content/astrath-deeprealm/_atlas/world.yaml`.
Click the pencil icon.
Edit the relevant map, layer, region, route, or fog section.
Commit to `main`.
The GitHub Action publishes on every push to `main`.
---
Asset paths
Local atlas assets should live under:
```text
public/atlas/assets/
```
Recommended folders:
```text
public/atlas/assets/maps/
public/atlas/assets/images/
public/atlas/assets/icons/
public/atlas/assets/portraits/
public/atlas/assets/locations/
public/atlas/assets/handouts/
```
Use paths like:
```yaml
src: /atlas/assets/maps/overview-map.webp
```
or:
```yaml
images:
  - /atlas/assets/images/thornhold.webp
```
External URLs can work online, but they are not reliable offline.
For reliable PWA/offline behavior, commit assets locally.
---
Offline support
The published player atlas is an installable Progressive Web App.
The service worker is enabled only in production builds. It is disabled in:
`npm run dev`
Lovable editor preview
iframe preview contexts
`*.lovableproject.com`
`id-preview--*.lovable.app`
On first online visit, the service worker caches:
app shell
JS/CSS
`atlas.json`
`search-index.json`
local atlas assets under `/atlas/assets/`
After that, the atlas can work offline.
Offline caveats
First visit must be online.
External image URLs are not guaranteed offline.
Use local committed assets for reliable maps.
DM builds are never cached as the player atlas.
`/atlas/edit` may load offline as part of the app shell, but it does not push to GitHub or persist outside your browser.
---
Player handouts
Each entity in `/atlas` has a printer icon.
Click it to open a clean printable handout. Use the browser print dialog and choose Save as PDF if needed.
Handouts include:
title
type
summary
body text
images
tags
Map chrome, toolbar UI, and side panels are excluded.
`Ctrl+P` or `Cmd+P` also prints the currently open entity.
---
Search and browse
The player atlas includes:
```text
/atlas
/atlas/browse
/atlas/timeline
/atlas/tag/:tag
/atlas/type/:type
```
Search matches:
titles
aliases
tags
summaries
body text
The search palette opens with:
```text
Ctrl+K
Cmd+K
```
---
PWA QA checklist
Run this against the published GitHub Pages URL, not the Lovable preview.
First online visit
Open `/atlas` while online.
Confirm the map loads.
Confirm `/atlas/atlas.json` returns 200.
Confirm `/atlas/search-index.json` returns 200.
DevTools -> Application -> Service Workers shows an activated service worker.
Cache Storage shows the atlas precache.
Offline reload
Switch device to airplane mode.
Reload `/atlas`.
Confirm the app shell loads.
Confirm atlas data loads.
Confirm local map images render.
Confirm search works.
Update behavior
Push a content or code change.
Wait for GitHub Actions to publish.
Reopen `/atlas`.
Confirm the update banner appears.
Click Refresh.
Confirm new content appears.
Manual cache controls
Use the cloud icon in the `/atlas` toolbar:
Reload latest atlas checks for an update.
Clear offline cache wipes managed caches and reloads.
Lovable preview
In Lovable preview, confirm there is no service worker registered. This is intentional.
---
Sample placeholder map
A sample placeholder map may exist at:
```text
public/atlas/assets/maps/sample-overview.svg
```
A real production map should be placed under:
```text
public/atlas/assets/maps/
```
Then referenced from `world.yaml`:
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
---
Tests
Run:
```bash
npm test
```
The test suite covers:
player build spoiler protection
DM/hidden entity exclusion
DM block stripping
invalid visibility behavior
missing asset failures
duplicate slug failures
`world.yaml` fence detection
no-map failures
layer asset checks
legacy top-level geometry
nested Creator Cockpit geometry
mixed geometry formats
duplicate region/route/fog warnings
relationship leak validation
Publish Check validation
patch engine behavior
---
Current recommended workflow
For day-to-day DM use:
```text
1. Write lore in Obsidian.
2. Commit/sync markdown to GitHub.
3. Open /atlas/edit locally or in a private preview.
4. Place pins, import maps, draw regions/routes/fog, edit profiles and relationships.
5. Export DM changes.
6. Apply generated YAML/frontmatter patches.
7. Commit to main.
8. Let GitHub Actions build and publish.
9. Players use the GitHub Pages /atlas player view.
```
Use YAML as canon, but let the editor generate as much of it as possible.
---
Roadmap status
Implemented:
Foundation: schema, parser, wikilinks, build script, sample vault
Map MVP: Leaflet viewer, placements, pins, side panel, search, mobile sheet
Safe publishing: strict player build and GitHub Pages workflow
Creator workflow: `/atlas/edit`, patch exports, asset zip
Layered maps: multi-map worlds and image layers
Regions, fog, routes, grid, scale, minimap
Timeline and calendar
Browse, tag, and type pages
Media and print/PDF handouts
Offline PWA
YAML-backed Creator Cockpit
Publish Check
Profile and relationship editing
Nested and top-level `world.yaml` geometry support
Next high-value improvements:
Better Obsidian import report and migration helpers
Stronger batch map import wizard
Relationship graph view
More player-facing label density controls
Session prep collections
Cleaner handout packet export
Better mobile polish for DM editor
More automated docs/tests around profile and relationship edge cases

Batch 13 — Editor build split + local Save workflow:
- Build split: player vs editor bundles via `__INCLUDE_EDITOR__` tree-shaking; `/atlas/edit` and `AtlasPlacementEditor` excluded from `npm run build`.
- Sentinel scan (`atlas:check-secrets`) for DM content + editor-code leaks in `dist/`.
- Shape scan (`atlas:check-shape`) over the player `atlas.json` for structural safety properties.
- Source-path allowlist module shared between client and server (`content/**/_atlas/*.yaml|yml`, `content/**/*.md`).
- Vite save plugin (`apply: "serve"`) exposing `/__atlas/save` only in dev.
- Save button + DiffPreviewModal in the editor: review, write to disk, then commit with git.