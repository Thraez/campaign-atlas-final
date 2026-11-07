# Running-app audit (2026-11-07)

Walked http://localhost:8080 as a first-time DM at 1440x900 (+390x844 player pass). Nothing saved,
published, uploaded or synced. Shots in `shots/`.
Test conditions: the world has ONE map (Overview, 6 image layers), 6 pins (3 events, 3 notes), 0 regions,
0 routes, 0 fog reveals, 3 soundscape areas. So region hover, map switching and fog-in-player-view
could not be exercised live. Mid-run another project's vite took port 8080 on IPv6 (atlas `localhost`
gave 404); I continued on 127.0.0.1:8080. Not an atlas bug.

## Player view (`/atlas`)

| Task | Score | Note |
|---|---|---|
| Open atlas | awkward | Map renders, but the opening view is not fitted: map is cropped on the right with a big empty ocean below, plus a "Tap to bring the world to life" toast and "Calm mode off" chip sitting on the minimap (01-player-open) |
| Pan / zoom | works | +/-, minimap, scale bar, URL keeps cx/cy/cz. Deep zoom is very pixelated/blurred (07-legend) |
| Hover place | awkward | Labels are permanent pin captions; no distinct hover state seen (02-hover-place) |
| Click place | works | Click on the marker (not its caption text) opens the note panel + popup (03-click-pin). Clicking via the caption text did nothing in my tries |
| Click region | n/a | Zero regions in this world |
| Read note panel | awkward | Good layout, image, tags, "On this page" list. But the TOC lists "DM Notes / Truth / Plot hooks" headings, a literal `%%` (Obsidian comment marker) shows in the body, and text keeps hard line breaks from the source. Dev server may not be the strict player build, so the DM-heading exposure needs checking with `atlas:build:player` output |
| Search | works | Ctrl+K opens a good palette (maps/recent, type chips, tag chips, highlighted snippet) (06-search). Only 3 notes exist so recall untested |
| Follow link between notes | broken | Every wikilink in all 5 entities is a "Planned link" dashed-gold span with no action (Harwick, Stavall, Sundering, Thornhold...). Only #tag links work. Looks clickable, does nothing |
| Switch maps / layers | broken | Cannot: single map, and no layer toggle in the player UI (Legend only lists pin types) |
| Fog visible | n/a | No fog in data (editor shows Fog disabled, 0 reveals) |
| Deep link | works | `?map=..&entity=edric` opens the panel directly (04-deeplink-entity). Opening an entity flies the camera to max zoom |
| Phone width | awkward | No horizontal scroll; bottom sheet works. But: minimap and toast overlap the sheet and map, two close X marks overlap in the sheet header, Legend overlaps pin captions, title truncates to "Astrath Dee..." (10-phone-open, 11-phone-entity) |

## Editor (`/atlas/edit`)

| Task | Score | Note |
|---|---|---|
| Open | awkward | Opens at max zoom on the word "Deepstone" (or, with Layers off, on blank ocean), not on a fitted map (20-editor-open) |
| (a) Import a map image | awkward | Hidden: header hamburger Menu > Edit map details > "Import Maps (batch wizard)" (6 steps) or the per-layer "Upload images" button. The menu is invisible (see friction 1), so I only reached it via Ctrl+K "map" > "Map settings" (31-editor-mapsettings). ~4 clicks once found. Wizard text says "asset zip you commit to GitHub" while the menu guardrail forbids zip actions: a mixed message |
| (b) Place / move / align a map | awkward | Map details panel > "Adjust map image (off)" toggle, then drag/resize. Layer list shows raw ids ("upload-1778790407722-0-chatgpt-image...") instead of names. Not exercised |
| (c) Nest a map in the world | broken | No control found. Rail has no Maps entry; no parent/child field in Map details > Settings that I could find; grep of src for parent/child map linking finds only a test. Dead end |
| (d) Hide a zone | awkward | Not a "hide" verb. Closest: Regions (rail) > Draw region, then a per-region visibility (player/dm) or Fog. Needs knowing the data model |
| (e) Draw fog | awkward | Rail Fog: master toggle "Fog enabled" (off), then two near-identical blocks: ADD REVEAL (Polygon/Circle) and DRAW FOG (Polygon/Circle), plus "Reveal around pin" with a raw "entity id" text box (22-editor-Fog). 4+ controls to understand before one click |
| (f) Write / link a place note | awkward | Rail Locations > "+ New Location" or "Import .md / paste". Locations says "No locations yet" even though 6 pins exist (they are events/notes), so the DM thinks the world is empty (21-editor-locations). Linking note to pin = Pins tab "Place next" |
| (g) Place a pin | awkward | Header "Place a pin" is disabled until an unplaced entity is picked in the Pins panel. Pins panel lists PLACED (6)/UNPLACED (0) with coordinates as text (22-editor-Pins). No hint on the disabled button |
| (h) See what players see | works | DM view / Player view segmented toggle; shows "Previewing as players see it" (25-editor-playerview). Fog has a separate "Preview fog on map" Visible eye, a second place to look |
| (i) Publish | not run | Rail Publish (bottom group) opens a check tab; I did not open it or press anything. From source: PublishCheckTab with blocking/warning counts. Separate "Save" (writes markdown + rebuilds) is NOT visible in the top bar, which only says "All changes saved" |

## Editor controls / modes seen

- Top bar: Back, "Where does this save?" (explains: changes stay in browser until Save, then write to markdown), logo link, "DM only" badge, DM view / Player view toggle, Layers (show/hide map image layers, not a panel), Regions (show/hide overlay), distance ruler (paperclip icon, aria "Toggle distance ruler"), "All changes saved" status, Undo, Redo, "Discard all local pin overrides" (circular-arrow icon, no label), Place a pin, Open player site, hamburger Menu.
- Menu items (invisible on screen): Edit world details, Edit map details, Name the months, Manage assets, Help.
- Left rail, YOUR WORLD: Characters, Locations, Factions, Events, Items, Lore (each: search, + New, Import .md/paste).
- Left rail, ON THE MAP: Pins (All/Unplaced/Placed, type, tag filters, Place next), Regions (Draw region, New region, YAML preview), Routes (Draw route), Fog, Sound (ambient volume, region sound, Draw a sound area, 3 areas).
- Left rail, other: Publish, Player keys, Sync from Obsidian (label truncated to "Sync fro...").
- Not in rail, reachable by Ctrl+K: Map details panel (Import Maps wizard, Layers/Settings tabs, Adjust map image, Upload images, URL layer), world details, assets, calendar.
- Panels cover the left 480px of the map without shifting it. Zoom +/- and minimap bottom-right.
- Modes: DM view / Player view; Adjust map image on/off; draw modes (region, route, fog polygon/circle, sound area); ruler.
- Phrases used for the same thing: "Save", "Publish", "Sync", "All changes saved".

## Top 10 friction points (ranked)

1. Header hamburger Menu is invisible: its dropdown (z-50 inside the header) renders under the Leaflet map, only a 1px sliver shows. It holds Edit map details, Manage assets, World details, Help. Map import and layer alignment are therefore effectively undiscoverable (26-editor-menu).
2. No way to nest/link a map into the world (task c) and no Maps entry in the rail; map import lives in a hidden menu path.
3. Wikilinks between notes are all "planned" dead spans in the player view; the main way to read the world as a web does nothing, yet they are styled like links.
4. No visible Save/Publish flow in the top bar. "All changes saved" while panels say "saved with the editor's Save button"; the real save is behind "Where does this save?" prose and the Publish rail item. A DM cannot tell if work is on disk.
5. Initial camera: player view is not fit-to-map (cropped, empty ocean) and the editor opens at max zoom on one label; entity open flies to extreme, pixelated zoom.
6. Overloaded "Layers"/"Regions" toggles in the header duplicate the rail's Regions and the Map details Layers tab; "Layers" hides the map to blank ocean when clicked, with no label saying it is a visibility toggle (24-editor-layers).
7. Fog UI: "Fog enabled", "Add reveal" and "Draw fog" overlap in meaning; "Reveal around pin" needs a typed entity id; separate "Preview fog on map" eye.
8. "Locations: No locations yet" next to 6 placed pins; panels keyed by entity type hide the placed content (21-editor-locations).
9. Possible DM content in the player panel (TOC headings DM Notes / Truth / Plot hooks; stray `%%`), to verify on the strict player build.
10. Phone: overlapping overlays (minimap, toast, calm-mode chip, doubled close X, Legend over captions); icon-only header buttons (ruler shown as paperclip, unlabeled discard).

## Console errors

- Player and editor: 0 errors, 0 warnings (only the React DevTools info).
- One transient `404` on `/atlas/edit` appeared only while another project's vite held port 8080 (not an app error).

## Verdict

1. The player site is good-looking and usable for reading and searching, but thin: one map, no working links between notes, no regions or fog to try.
2. The editor has every feature a DM needs (pins, regions, routes, fog, sound, import wizard, player preview), but they are split across a rail, a header, a hidden menu and Ctrl+K.
3. A first-time DM cannot import a map, nest it, or confirm a save without help; the hidden menu and missing Save are the blockers.
4. Fog and zone hiding need the data model in your head; verbs like "hide a zone" and "write a place note" do not exist as tasks.
5. Rebuild around task-first entry points (Add map, Place pin, Hide area, Preview, Publish), one visible Save state, and a fitted initial camera.
