# DM Editor — Unified Entity Foundation (Sub-project B) — Design

**Date:** 2026-05-17
**Owner:** Thraez
**Status:** Approved — pending spec review, then implementation plan
**Program:** DM-editor product-quality overhaul. This is **Sub-project B**. Parts 1–3 and Sub-project A are merged. Sub-project B builds the shared entity-rendering spine so the DM editor and the player site stay visually and behaviourally consistent, maintainable, and extensible. Sub-project D (map editing ergonomics + map honouring the view lens) and Part 4 (visual/art-style polish) follow as separate spec→plan→build cycles.

## Problem

Three concrete gaps, one shared root cause.

1. **The DM cannot preview a hidden, DM-only, or draft entity as a player will see it.** The live player site is the only faithful render, but the player build *excludes* `dm`/`hidden` entities entirely from `atlas.json` and redacts links to them. So the exact entities a DM most needs to check before publishing — the ones not yet player-visible — have no faithful preview anywhere. Sub-project A added an Obsidian-faithful preview of the markdown *body* only; it is not the player's full entity page and does not apply the player's link redaction.

2. **DM/player interaction is inconsistent.** On the player site, clicking a pin or a character opens that entity's bio. In the DM editor, clicking a pin opens the *category panel* (not the bio); there is no pin→bio path and no double-click affordance. The user hit this directly: "I could not double click on the pin or the entity to open their bio in dm mode, but in player mode i could click on the pin or character."

3. **There is no single 'see it as a player' / 'see it with my secrets' switch.** While running a session off the map a DM wants `%%dm notes%%` and secrets visible; while checking publishability they want the faithful player render. Today these are different code paths and surfaces, so the two drift and nothing is consistent.

**Root cause:** the player entity renderer and the DM editor are separate implementations. Consistency, maintainability, and extensibility are impossible while two components must be kept in sync by hand.

## Goals

- One **shared entity renderer** consumed by both the player site and the DM editor. Player vs DM is a parameter, not a fork.
- A **global View lens** — a single `Player view ⇄ DM view` toggle in the editor chrome that every entity surface reads. DM view reveals `%%dm%%` blocks, dm-only fields, and hidden entities; Player view shows the faithful player projection (secrets stripped, links redacted) and works **even for hidden/draft/unsaved entities**.
- **Edit** is an orthogonal per-entity action (Sub-project A's form), reachable in either lens; Save returns to the active lens and uses the one existing Save path.
- **Interaction parity:** clicking (and double-clicking) a pin or a category row in the DM editor opens the entity, exactly as the player site does.
- A **parity test** locks the client player-projection to the build's player output, so drift is a failing test (the discipline that locked Sub-project A's `stripDmBlocks`).
- Three independently-shippable slices, each ending in a full green gate.

## Non-goals

- **Map secret-geometry honouring the lens** (hide/show secret pins, regions, routes, fog in the DM map per the toggle) — that is **Sub-project D**. In B the toggle is global and visible from day one; its reach over the map's secret geometry completes in D. One switch; one more surface obeys it when D lands.
- DM map / pin **rendering** unification, hover-pins, zoom level-of-detail — Sub-project D.
- Direct pin placement; "map locked unless edit-geometry mode" — Sub-project D (the user's pin-placement pain is captured there, not lost).
- Visual / art-style / design-system polish, loading/empty/error visuals — Part 4 (cheap and durable *after* B unifies the components).
- Rich-text/WYSIWYG authoring — unchanged from Sub-project A; heavy prose stays in Obsidian.
- Re-introducing Export/Patch/Zip or autosave (standing rules). No new save path; reading view is read-only.
- Obsidian vault as live source (deferred — memory `idea_vault_as_source.md`).
- Touch/mobile. Desktop + laptop, mouse + keyboard.

## Confirmed product decisions

1. **Brainstormed scope = Sub-project B, the unified entity foundation.** Decomposed from a larger program (B = entity foundation; D = map ergonomics + map lens; Part 4 = visual polish). B first because it is the structural spine the others ride on.
2. **Reuse the real player component.** The DM reading view feeds a *projected* entity into the *actual* player `EntityPanel`, not a lookalike. Maximum fidelity; one component to maintain.
3. **Default view on open = Reading-as-player.** Opening an entity (pin or row click) lands in the player-faithful reading view; one click flips to Edit. Mirrors Obsidian opening in reading view.
4. **Scope boundary = entity experience only.** Map rendering stays as-is in B; the live map is tested in the real player view; map work is D. User-confirmed.
5. **View lens is global, with Edit orthogonal.** A single chrome toggle (`Player view`/`DM view`) is the lens; Edit is a separate axis (lens = how you see; edit = changing one thing). Not a three-way mode picker.
6. **Lens reach in B = entity surfaces; map participation = D.** User-confirmed. The toggle is global and visible everywhere in B and fully drives entity panels/bios and category/rail lists; its effect on the map's secret geometry completes in D.
7. **One Save.** Edits route through the existing unified Save (Sub-project A / Part 2 `baseHash` / Part 3 atomic write). No new save path, no second Save button.
8. **Delete the superseded.** Sub-project A's body-only `EntityBodyPreview` is replaced by the shared `EntityPanel` under the lens and is deleted, not kept behind a caveat (standing rule, memory `feedback_legacy_code_disposition.md`).

---

## A. The seam (the architecture)

Three shared units, each with one purpose, a well-defined interface, and independent testability.

**A.1 `src/atlas/entity/EntityPanel.tsx` — the one entity renderer.**
Extracted verbatim from `AtlasViewer.tsx` (currently lines ~888–1031). Renders title, type label, aliases, summary, image gallery, "show on map", body HTML, tags, backlinks. Props stay exactly as they are today (`entity`, `placements`, `entityById`, `onOpenEntity`, `onClose`, `onShowOnMap`) plus one new optional `readerAffordances?: boolean` (default `true`) that gates *player-personal* UI only — private player notes and handout print — which are meaningless in the DM editor. Default `true` ⇒ the player site is byte-for-byte unchanged. No context/hooks consumed (already true today). The player site imports from the new path; this is a pure move.

**A.2 `src/atlas/content/projectEntityForPlayer.ts` — the client player transform.**
`projectEntityForPlayer(entity, entitiesById): Entity` mirrors the build's player transform from `scripts/build-atlas.ts`: strip `%%…%%` / `:::dm…:::` (reuse Sub-project A's shared `src/atlas/content/stripDmBlocks.ts`), redact wikilinks and relationships whose target is not player-visible (display text → the build's redaction marker, target cleared, marked broken), drop dm-only fields, rebuild `bodyHtml` via Sub-project A's shared renderer (`src/atlas/content/renderEntityMarkdown.ts`). Pure function; no I/O. This is the only logic that must stay in lockstep with the build, and §F.1's parity test makes drift impossible silently.

**A.3 `src/atlas/view/ViewModeProvider.tsx` — the global lens.**
`useViewMode(): { mode: "player" | "dm"; setMode }`. React context at the editor root. The active mode is a **persisted UI preference** (localStorage), *not* Part 2 session "work" — a lens is not unsaved content, it must not inflate the unsaved-count or trip no-loss. A single chrome control toggles it. Every entity surface reads `mode`; `dm` ⇒ render the entity as-is (reveals `%%dm%%`, dm fields, no redaction); `player` ⇒ render `projectEntityForPlayer(entity, …)`.

**Edit** stays Sub-project A's `EntityEditPanel` form, reached by an explicit affordance from the entity surface in either lens. Save → existing unified Save → return to the active lens. Edit is not part of the lens enum.

## B. Slice B1 — Extract & share the renderer + projection engine

- Move `EntityPanel` to `src/atlas/entity/EntityPanel.tsx`; re-point `AtlasViewer.tsx` imports. Add `readerAffordances` (default `true`). Player site visually and behaviourally unchanged.
- Create `projectEntityForPlayer` (A.2), reusing shared `stripDmBlocks` + `renderEntityMarkdown`; add the link/relationship redaction the build performs.
- **Parity test (§F.1):** for every player-visible entity, the client projection equals the player `atlas.json` representation (DOM-normalised). Locks fidelity before anything consumes it.
- Independently shippable: ships as a pure refactor + a new unused-by-UI pure function with a guarding test. Zero user-visible change. Full gate.

## C. Slice B2 — Global View lens + entity surfaces honour it

- `ViewModeProvider`/`useViewMode` (A.3); one `Player view ⇄ DM view` control in the editor chrome; persisted UI preference.
- The entity surface opens in **Reading** = the shared `EntityPanel` (with `readerAffordances={false}`), rendering per the lens: `dm` shows secrets; `player` shows `projectEntityForPlayer` output. Works for hidden/draft/unsaved entities because the projection runs off DM-side data, never the filtered player build.
- Honest indicator in Player lens when the entity's `visibility` ∉ {player, rumor}: a non-blocking "Not yet visible to players" note (so the DM knows this is a future-state preview).
- Category/rail lists honour the lens: `dm`/`hidden` entities listed only in DM view.
- **Edit** affordance flips to Sub-project A's form; Save → unified Save → back to the active lens.
- Delete Sub-project A's `EntityBodyPreview` (and its now-dead tests/wiring); the shared panel under the lens supersedes it. Migrate the "Show DM notes" intent into the global lens.
- Independently shippable: the DM can now preview any entity exactly as a player will see it, and flip to see secrets, from one switch. Full gate.

## D. Slice B3 — Pin / row interaction parity

- DM map pin click **when not placing** → open that entity in the entity surface (Reading, current lens). Double-click on a pin or a category row → same. Matches player-site behaviour.
- Remove the legacy "pin click opens the category panel" stub. Keep the Ctrl-K "Edit {entity}" command (Sub-project A).
- Pin-click-while-placing is unchanged (still anchors a new placement); the placement-mode redesign is Sub-project D.
- Independently shippable: every pin and row is a live door to the entity, consistent with the player site. Full gate.

## E. Dependencies & ordering

- Slices ship **B1 → B2 → B3**; each independently shippable and gated.
- B2 depends on B1 (shared panel + projection). B3 depends on B2 (the entity surface it opens).
- Reuses, unchanged: Sub-project A's `stripDmBlocks`, `renderEntityMarkdown`, `EntityEditPanel`, the one Save path; Part 2 `baseHash`/`SaveStatus`/no-loss; Part 3 rail/panel/registry/`CategoryPanel`/`categoryForType`; the player `EntityPanel` (moved, not rewritten); the build's player transform in `scripts/build-atlas.ts` (the parity oracle, not modified).
- No schema migration. `Entity` shape unchanged; the projection produces a player-shaped `Entity` in memory.
- Sub-project D and Part 4 are downstream and untouched here.

## F. Testing & verification

### F.1 Unit
- **Projection parity (the linchpin):** for every player-visible entity in the DM build, `projectEntityForPlayer(entity, byId)` equals that entity's representation in the player `atlas.json` (DOM-normalised body, redacted links, dropped dm fields, stripped blocks). Drift = failing test.
- Projection of a `dm`/`hidden` entity strips `%%`/`:::dm`, redacts links to non-player targets, drops dm-only fields (no player-build oracle exists for these — covered by the shared code path the parity test exercises).
- `EntityPanel` with `readerAffordances={false}` renders no player-private-notes / handout UI and is otherwise identical (snapshot).
- `useViewMode` defaults correctly, persists, and round-trips; it does **not** register as Part 2 session work (no-loss/unsaved-count unaffected — regression assertion).

### F.2 Regression
- Player site: `AtlasViewer` renders identically after the `EntityPanel` move (existing player tests + snapshot stay green).
- Sub-project A: `EntityEditPanel` load/edit/save, `baseHash`, Discard, SaveStatus still green with the lens present; the deleted `EntityBodyPreview` leaves no dangling import or dead test.
- Part 3: categories, registry, palette, single-instance panel, dismissal still green; the new Edit/Reading affordance and pin/row open path surface via the registry.
- Player build still tree-shakes the editor (`__INCLUDE_EDITOR__`); `npm run atlas:publish` secrets + derived scans clean; **no `%%`/dm content in player output** (projection is preview-only; the build path is unchanged).

### F.3 Full gate (each slice done only when all green)
- `tsc` clean · `npm test` green incl. F.1–F.2 (the two pre-existing `fake-indexeddb` failures excepted; no new failures) · `npm run lint` no new errors · `npm run atlas:publish` scans clean.
- Browser smoke (the done criterion): open a **hidden/draft** entity → it shows in **DM view** with `%%dm%%` visible → flip the global toggle to **Player view** → it renders exactly as the player site would (secrets stripped, links to other hidden entities redacted) with a "not yet visible to players" note → flip back → click **Edit**, fix a line, Save → returns to the active lens, change persisted → on the player site nothing leaked; `npm run atlas:publish` clean. Click a **pin** and a **category row** → both open the entity in Reading view, same as the player site.

## G. Risks & mitigations

- **Projection drift from the build → a perceived or real spoiler.** Highest severity. Mitigation: projection *reuses* the build-shared `stripDmBlocks` and `renderEntityMarkdown`; the §F.1 parity test gates every player-visible entity against the real build output; `atlas:publish` secret/derived scans still gate; the player build path is never modified. Reading view is preview-only and writes nothing.
- **`EntityPanel` extraction regressing the player site.** Mitigation: pure move, imports re-pointed, player-only affordances behind a default-`true` prop, existing player tests + snapshot.
- **Scope creep toward the map.** Mitigation: explicit non-goals; the user-confirmed boundary (entity surfaces in B, map in D); the lens is *designed* global so D adds a surface, not a redesign.
- **Lens mistaken for unsaved work.** Mitigation: the lens is an explicitly persisted UI preference with a regression test asserting it never registers as Part 2 session work.

## H. Independently shippable

B1 alone is a safe refactor that creates the shared spine (no user-visible change, fully tested). B2 alone gives the DM a faithful "see it as a player" / "see my secrets" switch for *any* entity including hidden/draft — the core ask. B3 alone makes every pin and row a consistent door to the entity. Each ships and gates on its own; together they are Sub-project B: one entity renderer, one global lens, consistent across DM and player, with a parity test guaranteeing it stays that way. Sub-project D (map ergonomics + the map honouring the same lens) and Part 4 (visual polish over the now-unified surface) follow as their own cycles.
