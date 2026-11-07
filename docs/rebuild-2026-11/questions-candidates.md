# Candidate questions for Isak (from GOALS-proposed.md)

Draft 2026-11-07. Seven candidates; the orchestrator picks at most 5 for round 1, counting the
`world.yaml` missing-visibility question already in `questions-round-1.md`. Each links to a [Q] in
`GOALS-proposed.md`.

## 1. How do worlds and maps connect?

Why it matters: this sets the map model (schema v2), the viewer's navigation and the editor's
"add a map" job. One canvas needs shared world coordinates, tiling and level of detail across
very different image sizes; linked maps need only a frame per child in its parent.

- A. Linked maps: each map is its own image; a child sits in a frame on its parent; click to go in,
  breadcrumb to go out.
- B. One zoomable canvas: every map placed in one coordinate space; zooming in swaps to the child image.
- C. A, with a zoom transition into the frame so it feels like B.

**Recommendation: C.** It looks like one atlas but keeps A's simple model, which the audit says the
build and fog can carry.

## 2. What is the very top of the atlas?

Why it matters: it decides whether there is a map above the worlds (with its own image, frames and
fog) or a plain page, and what the site's front door is.

- A. A cosmology or overview map with a frame per world.
- B. An index page with a card per world.
- C. B now, A later when there is art for it.

**Recommendation: C.** No overview art exists yet; the map tree lets an overview map slot in later
without a schema change.

## 3. Is fog and progress per party, and is it stored?

Why it matters: per-party state multiplies every map's fog by parties and needs a place to keep it
(the site is static, with no accounts). One shared state is today's baked fog.

- A. One fog state per map, shared by all players; the DM reveals and republishes.
- B. One fog state per party (several campaigns in one world), chosen by a party key on the site.
- C. A, plus per-browser "visited" marks for each player (no server).

**Recommendation: C.** It keeps fog baked and safe, and the per-browser part already exists
(`visited/`).

## 4. What is a "monument", an "example" and a "story"?

Why it matters: it decides whether the build needs new content types or curated objects (tours,
chapters), or only a type and a layout in the story panel.

- A. A monument is a place note of type `monument` with a picture; "examples" are the notes listed
  in a region's panel. No new objects.
- B. A, plus curated tours: an ordered list of places a player can step through.
- C. Something else Isak describes (a sample of what he imagines).

**Recommendation: A now, B later.** A needs no new data; tours can be added on top once regions
are story surfaces.

## 5. Where do notes come from: Sync only, or the editor too?

Why it matters: if the editor writes notes, it needs a markdown editor and rules for who owns a
note; if it edits vault-synced notes, the next Sync must not overwrite or fight those edits.

- A. Sync only; the editor places and hides notes but doesn't write text.
- B. The editor can create atlas-only notes (for a place with no vault note); vault notes stay
  read-only in the editor and are edited in Obsidian.
- C. The editor edits any note, and Sync merges both ways.

**Recommendation: B.** It covers "write about this place" without two-way sync, the riskiest part.

## 6. Where does real DM text live once the real vault syncs, with the repo public?

Why it matters: the published site is scanned, but anything committed to the public repo is
readable on GitHub. Real DM notes (`dm` visibility, `%%` blocks) would be public the moment they are
committed. This changes Sync's target and what CI builds from.

- A. Accept it: the repo stays test-only, and real content never goes in it (the site shows test content).
- B. Split: only player-visible text is committed; DM-only notes and DM blocks stay in a gitignored
  local folder that the editor and the DM build read.
- C. Move real content to a private repo that the publish workflow checks out.

**Recommendation: B.** It keeps one public repo and the current publish, and the safety scans can
check the committed tree as they check the player build.

## 7. Is Tidemarrow still the first real map?

Why it matters: it sets what the first build after the rebuild proves. Tidemarrow pulls in the real
vault (and question 6); a test world can prove the map tree without real content.

- A. Yes: Tidemarrow with its 16 vault pins, first.
- B. A made-up test world with a three-level tree first, then Tidemarrow.
- C. Another world or map Isak names.

**Recommendation: B.** The map tree and editor jobs can be tested on scrap content before real lore
enters a public repo.
