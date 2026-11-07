# Round 1 questions for Isak (after Stage B)

Five questions, each with a recommendation. The draft goals are in `GOALS-proposed.md`; the full
candidate list (7) with options is in `questions-candidates.md`. Answers go under each question.

## 1. How do worlds and maps connect?

A) one seamless zoomable canvas for everything; B) separate maps linked by clickable portals;
C) a map tree: each child map sits in a frame on its parent, and you zoom into the frame to enter it,
with a breadcrumb back.

**Recommendation: C.** It feels like one atlas, while each map keeps its own scale, so the build, fog
and safety rules stay simple. A would turn the build and fog into a tiling engine.

Answer:

## 2. Fog of war: one shared state, or per party?

A) per party, stored on a server; B) per party, stored in each player's browser; C) one fog state
per map shared by all players, baked at publish, plus the per-browser "visited" marks that exist.

**Recommendation: C.** You reveal by publishing; no server, and the safety scans can check it.

Answer:

## 3. Where do place notes come from?

A) Sync from Obsidian only; B) Sync, plus notes written in the editor that live only in the atlas
(vault notes stay read-only in the editor); C) two-way: the editor edits vault notes too.

**Recommendation: B.** "Write about this place" works in the editor, without two-way sync.

Answer:

## 4. Where does real DM text live once your real vault syncs, with the repo public?

Today the published site is scanned, but anything committed to the public repo can be read on
GitHub. A) commit everything, as now; B) commit player-visible text only, and keep DM-only notes
in a gitignored local folder; C) a separate private content repo.

**Recommendation: B.** The site and repo stay public; DM secrets never reach GitHub.

Answer:

## 5. A `world.yaml` entry with no visibility: player or dm?

Today a region or route in `world.yaml` with no `visibility` loads as `player`
(`scripts/atlas/loadWorldConfig.ts:486-489`). You answered the invalid case already: invalid counts
as dm (PR #110). Choosing dm would hide nothing today: the atlas's `world.yaml` has 0 regions and 0
routes, and its 3 sound areas all say `player` explicitly.

**Recommendation: dm**, like notes (ADR-0001), so hidden zones fail closed. The redesigned editor
writes a visibility whenever it creates a zone.

Answer:

## Defaults taken unless you say otherwise

- The top of the atlas is an index page of worlds now, with an overview map later.
- A "monument" is a place note of type `monument` with a picture, shown in its region's panel.
  Curated story tours come later.
- First real map: a small made-up three-level test world proves the map tree, then Tidemarrow.

## Isak's answers (2026-11-07, asked in the rebuild-planning session)

1. **Seamless canvas for the world map**, zooming in when going into cities etc. "I love the idea
   of having a massive open ocean with lots of world maps." So: one seamless top-level canvas (an
   ocean with every world/continent map placed on it), and nested child maps (cities, dungeons) that
   you zoom into. A hybrid of A and C.
2. **Fog: one baked fog per campaign.** Per-party-in-browser would be ideal but is overkill; shared
   baked fog works if several settings can each have their own. Follow-up answer: one fog (and reveal
   state) per campaign over the same atlas; players pick their campaign or get its link.
3. **Sync + editor notes** (recommended): vault notes sync in read-only; the editor writes
   atlas-only notes.
4. **DM-only text in a gitignored local folder** (recommended); only player-visible text is
   committed to the public repo.
5. **dm** (recommended): a `world.yaml` entry with no visibility loads as dm. Needs an ADR-0001
   addendum when built.

Defaults (index page, monument type, test world first) were not objected to; Q1's answer changes the
first: the top of the atlas is the ocean canvas, not an index page.

## Follow-up, same day (Isak)

Q4 is reversed: public is only for testing. Before real content is published, hosting moves to
Cloudflare with access for his players and the repo goes private, so DM data is committed (marked by
visibility) and raw map images are no concern. Campaigns differ by visibility from the start (later
perhaps by maps too). Map compression is open: he zooms in a lot. See the top note in `plan.md`.
