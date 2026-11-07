# PROPOSED, not agreed (draft 2026-11-07, updated with Isak's round-1 answers)

Goals and acceptance criteria for the rebuild. Replaces `docs/GOALS.md` (2026-10-27) once Isak
agrees. Words as in `GLOSSARY.md`; new words (ocean, map tree, frame, campaign, story panel,
monument, DM folder) go there when agreed. Round-1 answers are in `questions-round-1.md`; the flows
are in `ux-flows.md`. Places where the draft still guesses are marked [Q].

## What the atlas is for

One atlas that holds all of Isak's D&D worlds and their maps, joined into one place players can
explore. It is a story engine as much as a map: players open a massive ocean with every world map on
it, zoom from a continent into a city, hover a region to read about it, and find the people, places
and monuments that live there.

The vault is where the DM writes. Sync from Obsidian brings notes in; the browser editor places,
hides, fogs and links them, and can write atlas-only notes; a publish puts a spoiler-safe site on
GitHub Pages, one view per campaign. Only Isak and AI agents use the editor. Players see only the
published site.

The repo is public on purpose, so the site can be tested. Content in the repo today is test
material and its DM notes are scrap. The world name is undecided (`astrath-deeprealm` for now).

## Areas and when each counts as working

### The world model: ocean, worlds, maps, nested maps

- The top level of the atlas is **the ocean**: one seamless canvas, a massive open sea, with every
  world or continent map placed on it at its own position, scale and rotation. Players pan and zoom
  across it with no page change between worlds. There is no index page.
- Below the world level, maps nest: a map can hold child maps (region, city, dungeon), each placed in
  its parent by a frame drawn on the parent. Zooming into a frame (or clicking it, or a pin that
  links to a map) enters the child map; a breadcrumb leads back up. Every map keeps its own image,
  coordinates, scale and zoom range.
- Search and deep links open any map, at any depth, directly.

Working means:

- the build emits every world in `content/`, not only the default one; a test with two worlds shows
  both on the ocean, and panning from one to the other needs no click;
- a test map tree three levels deep (ocean world map, continent, city) builds, and the player site
  opens the city from the continent's frame and returns by the breadcrumb;
- a deep link to a child map opens that map with its breadcrumb filled in;
- no code outside tests assumes `worlds[0]` (a grep in the gate finds none);
- pins, clicks, frames and fog land where they are drawn on every map in the tree and on the ocean
  (the coordinate tests run per map, not only on the first).

### Campaigns

- A **campaign** is one group of players exploring the same atlas. Each campaign has its own fog and
  reveal state over the same maps and notes. Players pick their campaign on the site or arrive by its
  link; the site remembers the choice in the browser.
- The publish builds one player view per campaign. What is fogged in campaign A ships fogged in A
  even if campaign B has revealed it.
- [Q] A campaign changes fog and reveal state only; whether a note or zone is player-visible is the
  same in every campaign (see `ux-flows.md`, decision 3).

Working means: a test with two campaigns that reveal different parts of one map shows each campaign
only its own reveals, in its images, its atlas and its search index; a campaign link opens straight
into that campaign.

### Story and exploration (player view)

- Hovering a region shows a story card: name, summary, picture, its monuments and its people.
- Clicking a region or place opens its story panel: its note, and lists of what is inside it
  (places, people, monuments, child maps).
- People show where they are (a pin or a place) and appear in the panels of the places they belong to.
- A **monument** is a place note of type `monument` with a picture, shown as a featured strip in its
  region's panel and card. Curated story tours come later.
- Links between notes work: a wikilink to a published note opens it; a link to an unpublished note
  is plain text, never a dead "Planned link".

Working means: in the test world, Isak can start on the ocean, reach a city, read a region, a person
and a monument, and follow three links between notes without a dead end; a test checks that every
player wikilink resolves or renders as plain text.

### The editor

The editor is built around the DM's jobs, not around layers and modes. Its first screen (the ocean)
offers: add a map (import an image, place it on the ocean or in its parent), place a pin, hide a zone
or map, reveal fog for a campaign, draw a route, write about a place, preview as a campaign's
players, sync, publish.

- One save state, always visible: saved, saving, or failed with the reason. One save path and one
  undo for every edit, which changes the source (frontmatter, `world.yaml`, the DM folder, image
  assets), never the compiled atlas.
- "Preview as players of campaign X" shows the strict player build of the current edits for that
  campaign: no DM headings, no `%%` text, that campaign's fog baked, hidden zones gone.
- A map opens fitted to the screen; no menu renders under the map.

Working means:

- each job above is one click from the first screen (Isak looks; a browser test clicks each);
- after any edit and a reload, the save state and the data agree (tests per job, checking the files
  on disk, not the response shape);
- the preview passes the same secret and derived-secret scans as a published build (a test);
- Isak can add a new map inside an existing one, hide a zone and write about a town without help.

### Hidden zones and fog

- A zone (region) or a whole map can be hidden from players; a hidden zone or map and everything only
  inside it (pins, routes, child maps) never ship.
- Fog is per map **and per campaign**, baked into that campaign's player images at build time. The
  DM reveals fog in the editor with a campaign chosen; the published site shows each campaign its
  latest reveal. Per-player fog is not a goal.

Working means: the fog scan and image-privacy scan pass on every map in the tree, for every
campaign; a test puts a pin inside a hidden zone and finds it absent from every campaign's player
atlas, search index and assets; a pin under a campaign's fog is absent from that campaign's build.

### Travel

- Routes are drawn per map; each shows its distance and travel time from the map's scale and the
  route's speed. A ruler measures any line.
- Each map in the tree has its own scale, so distances on a city map and a continent map are both right.

Working means: a test checks distance and time on two maps of different scale.

### Notes on every place

- Every pin, zone and map can carry a note. "Write about this place" opens its note or creates one.
- Notes synced from the vault are read-only in the editor: the vault owns them, and the editor only
  places and links them. Notes written in the editor are atlas-only notes, owned by the atlas.
- An atlas-only note gets a visibility the DM picks (default `dm`); its storage follows the rule
  under Player safety.

Working means: a test creates a note from a zone in the editor and finds the file with
`atlas.visibility` set, in the right place for its visibility; the editor refuses to change the text
of a synced note; the Locations list counts every placed note.

### Player safety (the spine)

- A note with no visibility, or an invalid one, never ships: it counts as `dm` everywhere. ADR-0001
  stays.
- Every `world.yaml` item (map, layer, frame, region, route, fog reveal, sound area) follows one
  rule, read in one place: missing or invalid visibility counts as `dm`. Fail closed everywhere.
  (Decided 2026-11-07; needs an ADR-0001 addendum when built.)
- A hidden map hides everything under it in the tree.
- **Content storage: only player-visible text is committed.** DM-only notes, DM blocks split out of
  player notes, and DM-only text from `world.yaml` items live in a gitignored local DM folder; the
  build merges them back for the DM build and the editor. The public repo never holds DM text.
  [Q] where that folder lives so it reaches both computers, and whether source images of fogged or
  hidden maps count as DM content (see `ux-flows.md`, decisions 1 and 2).
- What the vault keeps DM-only (`10_DmNotesAndSecrets`, `%%` blocks) never appears in the player
  build, the search index, any shipped asset or any committed file.
- Every safety scan passes before a publish, and the publish workflow stops if one fails. The scan
  list is written once and every caller reads it. A scan of committed content checks that no DM
  markup or DM-visibility note is staged.
- The weekly dependency audit is green.

### Sync from Obsidian

Unchanged from 2026-10-27: `01_Lore`, `02_Regions`, `03_Entities`, `04_Factions` sync; the DM-only
folders, templates, inbox and archive stay out. New: sync writes player-visible text to atlas content
and DM text (DM-visibility notes, `%%` blocks) to the DM folder. Working means: a dry run over the
real vault writes nothing and lists creates, updates and skips; `01`/`02` notes arrive `player`,
`03`/`04` arrive `dm`; title, type and links survive; a second run changes nothing; a renamed note
updates in place; no DM text lands in a committed path; and **Sync has run once end to end on the
real vault** (eval-13 found it never had).

### Publish

A merge into `main` publishes. The editor's Publish job shows what will change for each campaign's
players and the scan results before Isak pushes. Working means: a publish run's log shows every scan
passing for every campaign, and the live site matches the last preview.

### Tooling and the Mac

`npm run gate` passes on the Mac and the PC (typecheck, lint, sharded tests, build, scans); a lone
shard's worker timeout doesn't fail a run whose tests all passed. The generated-path hook works on
both computers. Tests check behaviour (files written, what players see), not response shapes.

## First content

A small made-up three-level test world (ocean world map, continent, city) proves the map tree,
campaigns and fog first; then Tidemarrow with the vault's 16 pins.

## Not now

- Renaming the world: one ticket once the name settles.
- Per-player or per-party fog in the browser, and stored player progress (one baked fog per
  campaign instead).
- A seamless canvas below the world level: cities and dungeons stay nested maps.
- Curated story tours.
- Two-way sync (editing vault notes from the editor).
- Travel calculators beyond route speed; routes that cross maps.
- Multi-user, hosted editing, VTT features, tablet DM mode (`docs/NON_GOALS.md`).

## The 2026-10-27 goals, item by item

| Old item | Now | Note |
|---|---|---|
| Atlas for the whole world, one world | changed | many worlds on one ocean, a map tree below |
| Tidemarrow is the first map, with the vault's 16 pins | changed | second, after the test world |
| Vault fills the atlas through Sync | kept | plus atlas-only notes written in the editor |
| Astrath sample goes once Tidemarrow is in | changed | test content stays until real content replaces it |
| Only Isak and agents use the editor | kept | |
| Missing/invalid note visibility is `dm` | kept | extended to every `world.yaml` item |
| Scans pass before publish, CI blocks | kept | scan list written once; per campaign |
| DM-only folders never ship | kept | and DM text is never committed |
| Weekly dependency audit green | kept | |
| Sync folders, dry run, visibility, round-trip, idempotence | kept | plus one real end-to-end run |
| Pins, clicks, fog land where drawn | kept | on every map in the tree and on the ocean |
| Isak checks the look; `ready-for-human` | kept | |
| Typecheck, lint, test:ci and the hook on both computers | kept | now `npm run gate` |
| Not now: renaming the world | kept | |
| Not now: map-space and editor-draft refactors | dropped | the rebuild does them |
| Not now: multi-user, hosted, VTT | kept | |
