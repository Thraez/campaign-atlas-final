# Stage A audit: the Campaign Atlas against the 2026-11-07 goals

Date 2026-11-07, `main` at 983b5d0. Three inputs, each with its evidence:

- [audit/code.md](audit/code.md): code and data model (Opus, medium), file:line cited.
- [audit/docs-tracker.md](audit/docs-tracker.md): docs, 68 tickets, the 12 open PRs (Sonnet, medium).
- [audit/running-app.md](audit/running-app.md): a first-time-DM walk of the running app, screenshots in
  `audit/shots/` (Sonnet, medium).

## Verdict in one paragraph

The pipeline and the safety spine are the good half of the app: content reading, visibility,
DM-markup stripping, the safety scans, Sync from Obsidian, search, fog baking, image encoding and the
publish workflow are tested and can be kept. The editor and the map model are the broken half. No
map can sit inside another map, the build emits only one world, and the editor is one 2,200-line page
that edits the compiled atlas and keeps its state in eight places with two save paths. That is why
the same kinds of bug keep coming back after 40-odd fix PRs. The earlier "extract, don't rewrite"
review was right about the pure helpers and wrong about the page: the new goals (a tree of maps
across worlds) would multiply every one of its overlays.

## Goals, one by one

| Goal (Isak, 2026-11-07) | State | Why |
|---|---|---|
| One atlas connecting all worlds and maps | **Missing** | No parent/child, portal or sub-map concept anywhere. The viewer switches maps with a flat Select (`AtlasViewer.tsx:650-662`). Today's "nesting" is six images side by side on one 200,000 × 150,000 px canvas (`world.yaml:14-115`). The schema allows several worlds, but the build emits only `cfg.defaultWorld` (`build-atlas.ts:725, 1110-1121`), and 33 places outside tests assume `worlds[0]`. |
| Hidden zones | **Partly; fails open** | Regions exist, but in `world.yaml` a missing or invalid visibility loads as `player` (`loadWorldConfig.ts:486-489`, checked). PR #110 makes *invalid* values dm; *missing* is still player and is open for Isak. The walk found no "hide this area" task in the editor. |
| Travel | **Partly** | Routes and a ruler exist; travel time beyond route speed is a listed non-goal. |
| Fog of war | **Works, hard to use** | Fog drawing, baking and scans exist (the `dist` fog-scan fix is PR #109). In the editor it needs the data model in your head. There is no per-party fog (non-goal). |
| Notes on every place | **Partly** | Place notes come from markdown or Sync. "Write a place note" isn't a task in the editor; the Locations panel says "No locations yet" while 6 pins exist. |
| Story engine: hover regions, monuments, people | **Thin** | Hover peek cards exist for pins; hovering a region shows only its name. There is no concept of a monument or a showcase. In the player walk, every wikilink in all 5 notes was a dead "Planned link"; only #tags worked. |
| Browser editor stays, but not messy | **Broken UX** | Every feature exists, spread across a rail, a header, a hamburger menu that renders *under* the Leaflet map (only a 1 px sliver shows), and Ctrl+K. The walker reached map import only through Ctrl+K. Save state is unclear: "All changes saved" in the top bar, while panels talk about a Save button. The camera starts at max zoom. |
| Safety spine (old GOALS) | **Mostly holds** | Notes fail closed (ADR-0001). Scans run on publish; fixes for `dist` and fog layers are in PR #109. Gap: `world.yaml` items, above. The published `public/atlas/` holds none of the DM-only notes (checked). |
| Sync from Obsidian (old GOALS) | **Built, never run on the real vault** | Dry run, folder rules and idempotence are coded; the eval found it never ran end to end once (eval-13). |
| Tidemarrow map (old GOALS) | **Not started** | The content is still the Astrath sample: 1 map, 6 pins, 0 regions, 0 routes, 0 fog. |

## Why the editor is hard to work with (structural, not cosmetic)

1. **It edits the compiled output.** The editor loads the DM `atlas.json`, changes it, and maps the
   changes back to frontmatter and `world.yaml` on save. Every new field needs a reverse mapping.
2. **State lives in eight places**: React state (34 `useState`, 12 `useEffect`, 27 ref bridges in one
   component), per-map draft holders, the session store, the calendar, world settings, and others,
   with two save paths. The tracker's commonest bug family is "the draft is kept per page or slot
   while the data is per map or per world": eval-30, 31, 44, 45, 47, 49, and code-retro/09 (wontfix).
3. **The same rule is written in several places that disagree.** Visibility and leak rules
   (audit-01, code-retro/06, eval-46, 50, arch-03/07/08), deep links (eval-38, 35) and the scan list
   (four hand-written copies).
4. **Tests pin the response shape instead of the behaviour**, so a broken flow ships green (eval-13:
   Sync never ran end to end; eval-33: a save that didn't happen).
5. **Tool-first, not task-first, UI.** The DM thinks "add a map", "hide this valley", "write about
   this town"; the editor offers layers, modes and panels.
6. **No faithful preview.** The dev viewer reads the DM atlas, so in development the "player view"
   shows DM headings and `%%` markup (not a leak: the published player atlas is clean, checked).
   "See what players see" needs the strict player projection.

## What is solid and reusable

From `audit/code.md` section F, sizes S/M/L:

- **Keep as-is:** the `src/atlas/content/` core (readNote, visibility, DM markup, projection) and its
  parity tests; every `check-*` scan, the publish orchestrator and the Pages workflow; Sync behind its
  vault adapter; secrets, search, hover peek cards, fog baking, `imageEncoding.ts`; the loopback gate
  and the conflict-checked write contract. About 3,300 test cases in 344 files: the build, scan,
  content, secrets and sync tests carry the safety spine and stay.
- **Refactor (M each):** `build-atlas.ts` into stages that loop over worlds; the save plugin
  (1,956 lines) into a router with one module per route; the viewer, to get map-tree navigation and
  region story panels.
- **Rewrite:** the editor (L), as one document store of commands over the *source* data, with one
  undo, one persistence layer and one save path; the map model (M), as a schema v2 map tree (each map
  framed in its parent, with scale and zoom range), fail-closed visibility for every `world.yaml`
  item, and a migration. The editor's pure helpers (geometry, click intents, save gate) carry over.

Roughly 40–50 % of `src/` and `scripts/` carries over.

## Docs that contradict the new goals

`PRODUCT_SPEC.md` and the old `GOALS.md` say "one DM, one world". `NON_GOALS.md` excludes
multi-map alignment and travel-time beyond route speed, and defers per-party fog.
`KNOWN_LIMITATIONS.md` says one map at a time, with no composite canvas. Stage B rewrites these.

## Not checked

- Runtime: region hover, map switching and fog in the player view. The test world has no regions,
  routes or fog, so the walk couldn't try them.
- The Publish and Sync panels. Auto mode refused a batch that clicked the Publish rail item, so those
  flows are read from source only.
- The internals of `categories/` and `sound-editor/`, and how many real vault notes already carry
  `atlas.placements`.
