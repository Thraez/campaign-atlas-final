# UX flows for the rebuilt atlas (PROPOSED, 2026-11-07)

Stage C input for the wireframes. Built on Isak's round-1 answers (`questions-round-1.md`) and
`GOALS-proposed.md`. Screen ids (E1, P1...) are the names the wireframes use. Decisions marked
**[confirm]** are listed at the end for Isak.

Updated after Isak's 2026-11-07 follow-up: the repo goes private and hosting moves to Cloudflare
before real content, so DM data is committed and the DM folder and `world.dm.yaml` are gone;
campaigns differ by visibility as well as fog; player map images are tile pyramids.

## Design principles

1. **Task-first.** The DM picks a job ("add a map", "hide this valley"), not a layer or a mode.
2. **One click.** Every DM job starts from one button on the first screen (E1).
3. **One save state, one undo.** Every edit is a command on one document store, saved automatically
   to source; one chip shows the state; Ctrl+Z undoes any of them, in order.
4. **The editor edits source data**, never the compiled atlas: `atlas.yaml`, `world.yaml`, notes,
   campaign files, image assets.
5. **Faithful preview.** "Preview as players" is the strict player build for one campaign, run
   the same as publish, not a CSS toggle over the DM atlas.
6. **Fail closed.** Missing or invalid visibility is `dm`, for every campaign; only each campaign's
   player build ships, and every scan runs on it.
7. Solo DM plus AI agents. No accounts, no multi-user, no hosted editing.

## Where things are stored (proposal)

Everything is committed; the repo is private before it holds real content. What is DM-only is
marked by visibility, not by where the file sits.

| File | Holds |
|---|---|
| `content/_atlas/atlas.yaml` | the ocean (size, sea style), each top-level map's place on it, the campaign list |
| `content/<world>/_atlas/world.yaml` | every map (image refs, parent, frame, scale, zoom range), regions, routes, placements, sound areas, each with a visibility (one value, or per campaign); a `notes:` block for per-campaign visibility and extras of read-only synced notes |
| `content/<world>/_atlas/images/` | one lossless source image per map; the player build bakes fog and cuts tiles |
| `content/_atlas/campaigns/<id>.yaml` | per map: fog reveals, conceals, and the map's state (unknown, fogged, open) for that campaign |
| `content/<world>/<folder>/*.md` | every note, player and DM, with `atlas.visibility`; DM blocks (`%% %%`, `:::dm`) stay inline and are stripped from player builds |

Placements move out of note frontmatter into the map's `world.yaml`, because synced notes are
read-only in the editor. The publish builds and ships only player builds, one per campaign; the
safety scans check each one.

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

Underneath: image to `content/<world>/_atlas/images/`; a map entry in `world.yaml` with `parent`
set and `visibility: dm`; for an ocean map, a placement in `atlas.yaml`. Encoding goes through
`imageEncoding.ts`; maps stay lossless; the player build tiles them.
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

Step 3 also asks **Hidden in**: every campaign (default), or tick campaigns. The zone's visibility
is written in `world.yaml` (one value, or per campaign); the pins, routes and frames only inside it
are hidden in the same campaigns by the resolver. Unhiding changes the value back. Nothing moves
between files.
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

Underneath: atlas-only note to `content/<world>/<folder>/<id>.md` with `atlas.visibility` (one value,
or per campaign: the visibility field offers "every campaign" or a row per campaign); DM blocks
(`%% %%`, `:::dm`) stay inline. For a synced note, per-campaign visibility goes in `world.yaml`'s
`notes:` block. Placement and region link in `world.yaml`.
Save/undo: typing autosaves after a pause; undo inside the text box is the text box's own; leaving
the box makes one "Edit note" command for the shell's undo.
Edge cases: changing visibility player to dm in a campaign (links to it from player notes become
plain text in that campaign, listed); a link to a dm note from a player note (renders as plain text for
players, flagged in E8); a monument with no picture (a warning, still a place); deleting a note with
backlinks (lists them; goes to an `archive/` folder, not hard-deleted).

### (g) Sync from Obsidian (E10)

Goal: pull new and changed vault notes into the atlas.

1. Task bar **Sync**. E10: the vault path (remembered per computer, local config), **Check**.
2. Dry run list: creates, updates, renames, skips, with reasons; each line shows the visibility it
   will arrive with (`01`/`02` player, `03`/`04` dm, for every campaign).
3. Tick or untick lines; **Sync N notes**. Result: done count, and "3 notes have no place yet" with
   **Place them** (opens the unplaced list in E2).

Underneath: notes to `content/` with their folder's visibility, `sync-map.json` updated. The first
real run waits until the repo is private. Placements are untouched (they live in `world.yaml`).
Save/undo: one command per sync run; undo restores the files the run wrote (kept as a snapshot).
Edge cases: vault path missing (E10 says so, nothing written); a note renamed in the vault (updates in
place via the sync map); a synced note deleted in the vault (listed, archived, never silently
removed); second run with no changes ("nothing to do").

### (h) Preview as a player of campaign X (E11)

Goal: see exactly what campaign X's players will see, before publishing.

1. Top bar **Preview as players**, campaign from the selector. E11 replaces the canvas.
2. A strict player build of the current source runs for campaign X (seconds; a progress bar), with
   its visibility applied and its fog baked. The real player UI (P1–P6) loads in the frame.
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
   privacy, fog, shape, asset audit, run on each campaign's build, plus the cross-campaign check
   (an item hidden in A and shown in B is absent from A).
2. All green: **Commit and open PR** (the agent or Isak pushes; the merge into `main` publishes, to
   GitHub Pages with test content until the hosting move, then to Cloudflare Pages, one access-limited
   path per campaign).
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
in this campaign" (never saying whether it exists elsewhere); a link without a campaign opens P6 on
the test site.

### (p6) Pick a campaign (P6)

On the hosted site each campaign has its own access-limited path, so players arrive by their
campaign's link and see no list of other campaigns **[confirm 1]**. P6 is kept for the public test
site and the editor preview:

1. No campaign in the URL and none remembered: P6 lists campaigns (name, picture, one line). With
   only one campaign, it is skipped.
2. Picking one opens P1 for it and remembers it in the browser.

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
| P6 | Campaign picker | test site and preview only: choose a campaign; skipped when there is one |
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
- **Campaign**: one group of players; its own visibility, fog, map states and published,
  access-limited view. Later, maps of its own.
- **Fog (per campaign)**: per map, reveals minus conceals for one campaign; baked into its images
  before tiling.
- **Visibility**: `player`, `rumor`, `dm`, `hidden` on notes and every `world.yaml` item, as one
  value for every campaign or a value per campaign; missing, invalid, or a campaign not named is
  `dm`; a hidden map hides its subtree in that campaign.
- **Tile pyramid**: the player build's copy of a map image, cut into lossless WebP tiles per zoom
  level, per campaign where fog differs.

## Decisions to confirm with Isak

Settled by the 2026-11-07 follow-up: no DM folder (everything committed, repo private before real
content); raw map images in the repo are fine; campaigns differ by visibility as well as fog.

1. **How players get in [Q].** Proposal: Cloudflare Access, one-time email PIN, one allow list per
   campaign path; no shared campaign picker on the hosted site (P6 becomes the test site's and the
   preview's only).
2. **Per-campaign visibility of synced notes** lives in `world.yaml`'s `notes:` block and wins over
   the vault's folder default; the Publish check lists every such override.
3. **Lossless tiles by default.** A lossy, high-quality tile setting per map only after Isak compares
   one real map at max zoom.
