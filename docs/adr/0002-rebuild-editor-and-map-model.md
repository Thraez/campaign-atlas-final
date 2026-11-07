# 0002. Rebuild the editor and the map model in this repo

Status: accepted (2026-11-07)

## Context

The atlas was built for one world with one map at a time, edited in a browser editor whose page
holds the working copy of the data. An audit in November 2026 found that the safety spine works:
the content core, the scan registry, publish, Sync and about 3,300 tests. It also found that the
editor and the map model are the broken half. The editor keeps a draft per page where the data is
per map, and saves by compiling the whole atlas back into source files. That shape has produced the
same family of bugs six times (pins on the wrong map, lost edits, a save state that disagrees with
the files).

Isak's goals changed on 2026-11-07 (`docs/GOALS.md`): one atlas for all his worlds, joined on one
seamless ocean canvas; maps nested below the world level (continent, city, dungeon); several
campaigns over the same atlas, each with its own visibility and its own baked fog; an editor built
around the DM's jobs. Today's model (one world, flat maps, one fog, visibility per note) cannot
hold that. The repo and the GitHub Pages site are public and hold only test material; real vault
content must not be committed while that is so.

## Decision

**Option B: build the new editor and the new map model (schema v2) inside this repo, next to the
old editor, behind the same `__INCLUDE_EDITOR__` gate. Keep the pipeline, the safety scans, Sync
and the tests.** Every ticket still merges on the full local gate.

Schema v2: a top-level ocean with every world's maps placed on it (position, scale, rotation); maps
that nest, each placed in its parent by a frame; campaigns as files that carry per-campaign
visibility and fog; per-campaign note visibility only in `world.yaml`'s `notes:` block, which can
narrow a vault `dm` but never widen it. One resolver reads visibility for every item and note, for
every campaign: missing, invalid, or a campaign not named counts as `dm`. The publish builds one
player output per campaign. The plan, with the schema sketch and the phases, is
`docs/rebuild-2026-11/plan.md` (on branch `rebuild-plan-2026-11` until it merges).

**Stays** (extended, not rewritten): the content core, the scan registry and `check-*` scans (they
learn one directory per campaign), the publish orchestrator, Sync (any target world), search, fog
baking, image encoding, the pure editor helpers, the spine tests.

**Rebuilt:** the map model and loader (v2), the world assembly in `build-atlas.ts` (every world, the
map tree, campaigns), the save endpoint (a router with one module per route), the viewer on a shared
ocean/frame/map-tree canvas, and the editor (a new shell and one command store over the source data,
organised by the DM's jobs).

**Thrown away at retire:** `AtlasPlacementEditor.tsx` and the draft, session, undo and
reverse-compile-save machinery around it, the old rail and tab panels, the Map Import Wizard UI, the
categories panels, v1 `normalizeVis`, `MapDocument.fog`, the flat map `<Select>` and every
`worlds[0]` use.

**Editor-parity cutover rule.** The old editor stays, with its fixes merged, until the new one can do
every job on a written parity list (pins, map images and layers, regions, routes, fog, sound areas,
note editing, world settings and calendar, player keys, Sync, Publish check, paste markdown). Isak
crosses out what he never uses at the start of that phase. Cutover is the last editor ticket: the
migration runs, the before/after diff of every campaign's output is empty, the old save is disabled,
the new editor moves to `/atlas/edit`. Until then the new editor edits only the v2 test world, which
lives in its own content root (`content-next/`), local only, never published, because a mix of v1 and
v2 files fails the build.

**Private hosting before the first real Sync.** Hosting moves to Cloudflare Pages, one project per
campaign, each behind Cloudflare Access with an email PIN, and the repo goes private, before any real
vault content is committed. Until then Sync refuses real writes and the gate fails if `content/`
holds vault files. DM data is then committed in the same files as player data, marked by visibility;
the split that matters is the build, which ships only each campaign's player build.

## Options rejected

- **A. Refactor in place** (95-110 sessions). The editor would be re-keyed per map node and campaign
  with the bug-causing shape kept to the end.
- **A'. Keep the editor shell and slide a store under it panel by panel** (85-100 sessions). Close to
  B in cost, but the page-as-store and the reverse-compile save run beside the new store until the
  last of 14 panels moves, which is where the bugs live; it also stays tool-first, so a task-first
  shell would be a second rewrite. Its cheap part, the friction fixes, is done first anyway.
- **C. A new repo** (100-120 sessions). Safety would be re-earned from zero and the switch would be
  one big step for the players.

## Consequences

- About 80-95 ticket sessions, 7-9 months at light pace, with safe stop points after the quick wins,
  after the shared canvas and after editor parity.
- Two editors coexist for months. The old one only gets fixes; features go in the new one.
- The docs that said one world, no unified canvas, or no multiple view profiles are rewritten
  (`docs/NON_GOALS.md`, `docs/PRODUCT_SPEC.md`, `docs/KNOWN_LIMITATIONS.md`); per-player fog is still not a goal (one baked fog per campaign instead).
- Missing or invalid visibility counting as `dm` for every `world.yaml` item, not only notes, needs
  an addendum to ADR-0001 (ticket R-02).
- Further decisions (schema, resolver, campaign outputs, hosting, tiles) get their own ADRs as they
  are built. Map images stay lossless; tile pyramids come only if a measured problem calls for them.
- The first real Sync waits for private hosting, so `docs/tracker/tidemarrow/` tickets stay blocked
  until then.
