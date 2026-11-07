# UX flows for the rebuilt atlas (PROPOSED, 2026-11-07)

Stage C input for the wireframes. Built on Isak's round-1 answers (`questions-round-1.md`) and
`GOALS-proposed.md`. Screen ids (E1, P1...) are the names the wireframes use. Decisions marked
**[confirm]** are listed at the end for Isak.

## Design principles

1. **Task-first.** The DM picks a job ("add a map", "hide this valley"), not a layer or a mode.
2. **One click.** Every DM job starts from one button on the first screen (E1).
3. **One save state, one undo.** Every edit is a command on one document store, saved automatically
   to source; one chip shows the state; Ctrl+Z undoes any of them, in order.
4. **The editor edits source data**, never the compiled atlas: `atlas.yaml`, `world.yaml`, notes,
   campaign files, the DM folder, image assets.
5. **Faithful preview.** "Preview as players" is the strict player build for one campaign, run
   without the DM folder, not a CSS toggle over the DM atlas.
6. **Fail closed.** Missing or invalid visibility is `dm`; anything in the DM folder never ships.
7. Solo DM plus AI agents. No accounts, no multi-user, no hosted editing.

## Where things are stored (proposal)

| File | Committed? | Holds |
|---|---|---|
| `content/_atlas/atlas.yaml` | yes | the ocean (size, sea style), each world map's place on it, the campaign list |
| `content/<world>/_atlas/world.yaml` | yes | player-visible maps: image refs, parent, frame, scale, zoom range; regions, routes, placements |
| `content/<world>/_atlas/images/` | yes | images of player-visible maps (raw; fog is baked at build) **[confirm 2]** |
| `content/_atlas/campaigns/<id>.yaml` | yes | per map: fog reveals, conceals, and the map's state (unknown, fogged, open) for that campaign |
| `content/<world>/<folder>/*.md` | yes | player-visible notes, player text only |
| DM folder (gitignored, default `.atlas-dm/`) **[confirm 1]** | **no** | DM-visibility notes; `<id>.dm.md` sidecars with DM blocks split out of player notes; `world.dm.yaml` with hidden maps, zones, routes, pins; images of hidden maps |

Placements move out of note frontmatter into the map's `world.yaml` (or `world.dm.yaml` when hidden),
because synced notes are read-only in the editor. The player build never reads the DM folder, so the
CI build on GitHub (where the folder does not exist) is a player build by construction.

## Editor

Every editor screen sits inside the shell E0 (see "Editor information architecture" below).

### (a) Import a map image (E3)

Goal: get a new picture into the atlas, either as a world map on the ocean or as a child map.

1. E1 task bar: **Add map**. E3 opens: drop zone or file picker (PNG, JPEG, WebP).
2. E3 asks "Where does it go?": **On the ocean** (a new world, or another map of an existing world)
   or **Inside a map** (pick the parent from the map tree, prefilled with the map on screen).
3. Name, world (new or existing), visibility (default **dm**, so a new map is hidden until made
   player), scale (units per pixel, or "set later with the ruler").
4. **Add**. The image uploads; E4 opens with the map ready to place.

Underneath: image to `content/<world>/_atlas/images/` (or the DM folder while the map is dm, and
moved when made player); a map entry in `world.yaml`/`world.dm.yaml` with `parent` set; for an ocean
map, a placement in `atlas.yaml`. Encoding goes through `imageEncoding.ts`; maps stay lossless.
Save/undo: one command ("Add map"); undo removes the entry and deletes the uploaded file.
Edge cases: very large image (warn above a size limit, offer tiling later; no silent downscale);
duplicate file name (rename with a suffix); unsupported format (refuse, say which); new world name
clashing with an existing folder (refuse); upload fails (save chip shows Failed, nothing written).

### (b) Place, scale, rotate and align a map (E4)

Goal: make the new map sit right on the ocean or inside its parent's frame.

1. E4 opens from (a), or from a map's inspector (E9) via **Align**.
2. The map shows at 60 % opacity over its context: the ocean and neighbouring worlds, or the
   parent map around the frame. Handles: move (drag), scale (corners, Shift keeps ratio), rotate
   (top handle, snaps 15°, Alt frees it).
3. Side fields: x, y, scale, rotation, opacity slider; **Two-point align**: click a point on the new
   map, then the matching point on the parent, twice; the map snaps.
4. **Done** returns to E1/E2 with the map selected.

Underneath: ocean maps write `atlas.yaml` (`x, y, scale, rotation`); child maps write their frame in
the parent's coordinates in `world.yaml` (a rotated rectangle; see (c)). The child's own coordinates
never change, so its pins, regions and fog stay put.
Save/undo: one command per drag end or field change; undo steps back through them.
Edge cases: two ocean maps overlapping (allowed, warn, z-order control); child larger than its
parent's frame (fine: the frame is the link, the image keeps its scale); a rotated child keeps
upright labels in the player view.

### (c) Link or nest a map into the world (E5)

Goal: say "this city lives here on that continent" and walk into it.

1. On a parent map, task bar **Add map > Inside this map** (new image, flow a), or select an
   existing map in the map tree E2 and drag it onto a parent.
2. E5: draw the frame on the parent (drag a rectangle, rotate if needed); the child previews inside.
3. Frame options: label, visibility (inherits the child's), "enter at zoom" (when the player view
   switches from parent to child).
4. Double-click the frame (or **Enter** in E9) to go into the child; the breadcrumb grows by one.

Underneath: `parent` and `frame` on the child in `world.yaml`. A frame links exactly one child; a
child has exactly one parent. Pins can also link to a map (`linksTo: <mapId>`) for a second way in.
Save/undo: one command for "nest", one per frame edit.
Edge cases: nesting a map under its own descendant (refused); moving a map to another world (asks:
its notes stay in their world); a player child under a dm parent (stays hidden: a hidden map hides
its whole subtree, shown in E2 with a hidden badge on every descendant).

### (d) Hide a zone or a whole map (E6)

Goal: keep a valley, a dungeon or a whole continent away from players.

1. Task bar **Hide area**. E6: draw a polygon or pick an existing region; or, in E2 or E9,
   toggle a map's visibility to **Hidden**.
2. The zone shades with a hatch; a list shows what falls inside it: pins, routes, child maps, notes
   placed only there ("these 4 things will be hidden too").
3. Name and optional note for the zone (DM-only by default).

Underneath: the zone, and the pins, routes and frames only inside it, move to `world.dm.yaml` in the
DM folder; a hidden map moves its entry and image there. Unhiding moves them back. Nothing hidden
stays in a committed file.
Save/undo: one command; undo moves everything back.
Edge cases: a pin on the zone edge (inside test by the pin's point; the list shows it so the DM can
nudge); a note placed both inside and outside (only that placement hides; the note stays player);
a region with no visibility (loads as dm, shown hatched with "no visibility set"); hiding the map
on screen (the editor stays on it, badge "hidden from players").

### (e) Draw and reveal fog for a campaign (E7)

Goal: show campaign X's players only what their party has found.

1. Pick the campaign in the top-bar selector (always visible). Task bar **Fog**. E7 opens.
2. The map shows that campaign's fog as a dark overlay. Tools: **Reveal** (brush, polygon,
   circle), **Cover again**, **Reveal around a pin** (click the pin; no typed ids).
3. Map state for this campaign: **Unknown** (not shipped to this campaign), **Fogged**, **Open**.
4. Strip at the bottom: "Campaign X: 3 maps fogged, 12 reveals; last published reveal: 2 Nov".

Underneath: `content/_atlas/campaigns/<id>.yaml`, per map. Fog baking per campaign happens at build.
Save/undo: one command per stroke or shape; undo per stroke.
Edge cases: no campaign exists yet (E7 offers **New campaign** first; E13); a child map inside a fogged
parent area (frame hidden for that campaign until revealed); a pin under fog (not shipped to that
campaign); switching campaign mid-stroke (finishes the stroke first).

### (f) Write a place note, link it, mark a monument (E8)

Goal: write about a town, pin it, connect it to people and places, feature it as a monument.

1. Select a pin, region or map (E9), **Write about this place**, or task bar **Write note** then
   click the map. E8 opens on the right: title, type, visibility (default **dm**), body.
2. Type `[[` to link: a picker lists notes by title (synced and atlas-only); new titles offer
   "create note". Backlinks show under the body.
3. **Place on map**: click to drop a pin, or pick a region to attach the note to.
4. Type `monument` plus a picture (upload or pick) makes it a monument; E8 shows "featured in
   <region>" when it sits inside a player region.
5. People: type `person`; **Belongs to** picks places; the person shows in their panels.
6. A synced note opens read-only with a banner "From your vault: edit it in Obsidian, then Sync";
   placement, region link and monument picture can still be set (they live in `world.yaml`).

Underneath: atlas-only player note to `content/<world>/<folder>/<id>.md`; dm note to the DM folder;
DM blocks (`%% %%`, `:::dm`) in a player note are split to `<id>.dm.md` on save. Placement and region
link in `world.yaml`.
Save/undo: typing autosaves after a pause; undo inside the text box is the text box's own; leaving
the box makes one "Edit note" command for the shell's undo.
Edge cases: changing visibility player to dm (moves the file to the DM folder; links from player
notes become plain text, listed); a link to a dm note from a player note (renders as plain text for
players, flagged in E8); a monument with no picture (a warning, still a place); deleting a note with
backlinks (lists them; goes to an `archive/` folder, not hard-deleted).

### (g) Sync from Obsidian (E10)

Goal: pull new and changed vault notes into the atlas.

1. Task bar **Sync**. E10: the vault path (remembered per computer, local config), **Check**.
2. Dry run list: creates, updates, renames, skips, with reasons; each line shows the visibility it
   will arrive with (`01`/`02` player, `03`/`04` dm) and where it will be stored (repo or DM folder).
3. Tick or untick lines; **Sync N notes**. Result: done count, and "3 notes have no place yet" with
   **Place them** (opens the unplaced list in E2).

Underneath: player text to `content/`, DM notes and DM blocks to the DM folder, `sync-map.json`
updated. Placements are untouched (they live in `world.yaml`).
Save/undo: one command per sync run; undo restores the files the run wrote (kept as a snapshot).
Edge cases: vault path missing (E10 says so, nothing written); a note renamed in the vault (updates in
place via the sync map); a synced note deleted in the vault (listed, archived, never silently
removed); second run with no changes ("nothing to do").

### (h) Preview as a player of campaign X (E11)

Goal: see exactly what campaign X's players will see, before publishing.

1. Top bar **Preview as players**, campaign from the selector. E11 replaces the canvas.
2. A strict player build of the current source runs (seconds; a progress bar), without the DM folder,
   with campaign X's fog baked. The real player UI (P1–P6) loads in the frame.
3. A banner: "Preview: campaign X, built 12:04 from unsaved/saved state". **Back to editing** keeps
   the camera where it was.

Underneath: the same build and projection as publish, into a temp folder; the secret and
derived-secret scans run on it and show their result in the banner.
Edge cases: unsaved edits (preview waits for the save first); a scan fails (banner turns red, names the
file and string, **Show in editor**); build error (shows the error, editor untouched).

### (i) Publish (E12)

Goal: put the current atlas live for every campaign, safely.

1. Top bar **Publish**. E12: per campaign, what changes for players (new maps, notes, reveals,
   removed items), then the scan list running: secrets, derived secrets, player secrets, image
   privacy, fog, shape, asset audit, plus "nothing in the DM folder is staged in git".
2. All green: **Commit and open PR** (the agent or Isak pushes; the merge into `main` publishes).
   Any red: the button is disabled, each failure names file, line and campaign, with **Show in editor**.

Blocks publish: any scan failure; a DM-visibility note or DM markup in a committed path; a player item
whose parent is hidden (reported as a warning and stripped, or blocked if it would ship); a broken
image reference; unsaved edits. Warnings only: player wikilinks to unpublished notes, monuments with no
picture, maps with no scale.

## Player site

### (p1) Arrive and orient on the ocean (P1)

Goal (player): see the whole known world and where to look first.

1. The campaign's link opens P1 fitted to every map the campaign knows, on an animated sea.
2. World and continent names float over their maps; hover shows a one-line card (P3).
3. Corner: breadcrumb "Ocean", search, campaign name (P6), legend. No toast over the map.

### (p2) Zoom from ocean to continent to city (P2)

1. Scroll or pinch zoom over a continent: past its "enter at zoom" the view hands over to that map
   (P2) with no page load; the breadcrumb reads "Ocean > Varn". Clicking a map also enters it.
2. On the continent, city frames show as soft outlines with labels; zoom in or click to enter.
3. Breadcrumb or zooming out past the map's minimum returns to the parent at the same spot.
Edge cases: a frame for a map unknown to this campaign is not drawn; fogged areas are baked dark.

### (p3) Hover a region: story card (P3)

1. Hover a region: it lights up; P3 shows name, one-line summary, picture, up to 3 monuments
   (thumbnails), up to 5 people.
2. Click the region (or **Read more**): the full story panel P4 opens.

### (p4) Read a person or place note and follow links (P4)

1. P4 (right side; bottom sheet on phone): title, picture, body, then "Inside": places, people,
   monuments, child maps (each **Show on map**), and backlinks.
2. A wikilink opens the linked note in P4, with Back; a link to an unpublished note is plain text.
3. **Show on map** flies to the pin at a sensible zoom, entering child maps as needed.

### (p5) Search and deep link (P5)

1. Search box or Ctrl+K: P5 palette, results across all maps of this campaign, grouped by map, with
   type chips. Pick one: P2 opens on its map with P4 open.
2. Every view has a URL (`?c=<campaign>&map=<id>&note=<id>&x&y&z`); sharing it opens the same view.
Edge cases: a deep link to something not in this campaign opens the campaign's ocean with "not found
in this campaign"; a link without a campaign opens P6.

### (p6) Pick a campaign (P6)

1. No campaign in the URL and none remembered: P6 lists campaigns (name, picture, one line). With
   only one campaign, it is skipped.
2. Picking one opens P1 for it and remembers it in the browser; the campaign chip in the corner
   reopens P6 to switch.

### (p7) Phone (P7)

P1–P6 at phone width: full-screen map; breadcrumb and search in one top bar; P3 becomes a tap
preview strip at the bottom; P4 is a bottom sheet (peek, half, full) with one close button; legend
and campaign chip in a menu; no minimap. Pinch zoom enters child maps as in p2.

## Editor information architecture

```
E0 shell
┌ top bar ─────────────────────────────────────────────────────────────────────────┐
│ Ocean > Varn > Saltmere   [Campaign: Red Tide ▾]  ● Saved  ↶ ↷  [Preview] [Publish] │
├ task bar (left, labelled) ┬ canvas (map, fitted on open) ─────┬ inspector (right) ─┤
│ Add map                  │                                    │ E9: what is         │
│ Place pin                │                                    │ selected, or E8 /   │
│ Write note               │                                    │ E3..E7 task panel   │
│ Hide area                │                                    │                     │
│ Fog                      │                                    │                     │
│ Draw route               │                                    │                     │
│ Sync                     │                                    │                     │
│ Map tree (E2) toggle     │                                    │                     │
└──────────────────────────┴────────────────────────────────────┴─────────────────────┘
```

- **Always visible:** breadcrumb (click any level; a caret opens the map tree E2), campaign selector,
  save chip, undo/redo, Preview, Publish. No hamburger menu; nothing renders under the map.
- **Task bar:** the jobs, labelled with words. One task panel open at a time, in the inspector
  column; Esc closes it and returns to selection.
- **Map tree E2:** ocean at the top, worlds, then their maps; hidden badges, unplaced notes at the
  bottom ("12 notes with no place").
- **Save chip states:** Saved · Saving… · Failed: <reason> [Retry] · Changed on disk [Reload] [Keep
  mine]. Autosave writes after each command through `/__atlas/save` with the existing conflict check.
- **Undo:** one stack of commands for the session (Ctrl+Z / Ctrl+Shift+Z); git is the long-term undo.
- Ctrl+K stays as a quick finder for notes, maps and tasks, never the only way to reach one.

## Screens

| Id | Screen | One line |
|---|---|---|
| E0 | Editor shell | top bar, task bar, canvas, inspector; holds every other E screen |
| E1 | Ocean home | first screen: the ocean canvas with every world map, task bar ready |
| E2 | Map tree | ocean > worlds > maps, hidden badges, unplaced notes |
| E3 | Add map | upload an image, choose ocean or parent, name, world, visibility, scale |
| E4 | Align map | move, scale, rotate, two-point align over the ocean or the parent frame |
| E5 | Frame and nest | draw a child's frame on its parent, set enter zoom, enter it |
| E6 | Hide area | draw or pick a zone, see what it hides; hide a whole map |
| E7 | Fog | per-campaign reveal and cover tools, map state per campaign |
| E8 | Note editor | write or read a note, links, backlinks, type, monument picture, placement |
| E9 | Inspector | properties of the selected map, frame, region, pin or route |
| E10 | Sync from Obsidian | vault path, dry run list, sync result |
| E11 | Player preview | strict player build for one campaign, with scan banner |
| E12 | Publish check | per-campaign changes, scan list, commit and PR |
| E13 | Campaigns | create, rename, picture and one-line blurb for each campaign |
| P1 | Ocean | arrival view, every map the campaign knows, fitted |
| P2 | Map view | a continent, city or dungeon with breadcrumb and frames |
| P3 | Story card | hover card for a region or place: summary, monuments, people |
| P4 | Story panel | full note: body, inside lists, backlinks, Show on map |
| P5 | Search | palette across the campaign's maps and notes |
| P6 | Campaign picker | choose a campaign; skipped when there is one |
| P7 | Phone layouts | P1–P6 at phone width: top bar, bottom sheet, tap preview |

## Data-model concepts the flows need

- **Atlas**: everything; one ocean, many worlds, many campaigns. `content/_atlas/atlas.yaml`.
- **Ocean**: the seamless top-level canvas; holds world maps by position, scale and rotation.
- **World**: one setting with its own content folder, `world.yaml` and notes.
- **Map**: one image with its own coordinates, scale and zoom range; top-level on the ocean or a
  child of exactly one parent map.
- **Frame**: a child map's rotated rectangle in its parent's coordinates; the way in.
- **Region (zone)**: a polygon on a map, optionally linked to a note; can be hidden.
- **Place**: a note placed on a map by a pin or attached to a region.
- **Note**: one markdown file; synced (vault-owned, read-only) or atlas-only (editor-owned).
- **Monument**: a place note of type `monument` with a picture, featured in its region.
- **Person**: a note of type `person`, placed or belonging to places.
- **Placement**: a note's pin on a map, stored in the map's `world.yaml`, not in the note.
- **Route**: a line on one map with a speed; distance and time from the map's scale.
- **Campaign**: one group of players; its own fog, map states and published view.
- **Fog (per campaign)**: per map, reveals minus conceals for one campaign; baked into its images.
- **Visibility**: `player`, `rumor`, `dm`, `hidden` on notes and every `world.yaml` item; missing or
  invalid is `dm`; a hidden map hides its subtree.
- **DM folder**: the gitignored folder for every DM-only note, DM block, hidden item and hidden image.

## Decisions to confirm with Isak

1. **Where the DM folder lives.** Gitignored and never on GitHub means it won't reach the PC by
   itself. Proposal: default `.atlas-dm/` in the repo, path overridable in gitignored local config,
   so he can point it at a folder that travels by his own means (for example inside the private D&D
   campaign repo, if that repo is private). Synced DM notes can always be re-synced from the vault;
   only editor-written DM notes and hidden-map work need the folder to travel.
2. **Raw images of player maps are committed un-fogged.** Fog protects the site, but anyone browsing
   the public repo sees the whole map, including what campaigns haven't found. Hidden maps' images go
   to the DM folder. Alternative: keep every raw map image in the DM folder and commit only the baked
   per-campaign images, built locally (CI then no longer bakes fog).
3. **Campaigns differ only in fog and map state.** Visibility of notes and zones is the same for every
   campaign; a place one party hasn't heard of is handled by fog or the map's "unknown" state, not by
   per-campaign visibility.
