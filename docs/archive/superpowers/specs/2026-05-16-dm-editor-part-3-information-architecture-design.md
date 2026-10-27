# DM Editor Part 3 — Information Architecture & Terminology — Design

**Date:** 2026-05-16
**Owner:** Thraez
**Status:** Draft — pending user approval
**Program:** DM-editor product-quality overhaul, Part 3 of 4 (Part 1 merged; Part 2 designed + planned, not yet executed)

## Problem

Parts 1–2 make the editor correct and lose-proof. They do not make it *legible* or *navigable*. Today:

1. **Eight flat tabs** (Pins · Maps · Regions · Routes · Fog · Entities · Import · Publish) mix world content with map tools on one undifferentiated strip. Nothing reflects how a DM thinks about a world.
2. **"Entities" is a generic flat dropdown.** Every NPC, place, faction, item, and event shares one `<Select>` and one form. There is no per-type browsing and no in-app creation — entities arrive only by importing or pasting markdown.
3. **No way to find anything across the world.** Search, where it exists, is scoped to one screen. A DM who wants "Corven" must first know Corven is an NPC and which tab shows him.
4. **Settings leak engineering vocabulary.** The map-settings panel shows `Unsaved: oceanColor, wrapX, grid`, "Ocean / background color", "Wrap horizontally (planet/longitude)", "Discard local edits" — raw field keys and jargon surfaced to a non-developer.
5. **Map editing has no room to grow.** Part 4's "Inkarnate-grade map ergonomics" has nowhere to live while the canvas is one tab among eight.

The bar for this program is "a product I'd buy on the App Store." For Part 3 that means: the editor is organized the way a DM thinks about a world, every piece of content is findable and creatable in two clicks, and no screen speaks in code.

## Goals

- One coherent editor shell: a thin icon rail + a single on-demand panel over a persistent map, replacing the eight-tab strip.
- Six type-aware content categories with per-type browse and create.
- In-app entity creation that writes a real markdown file and round-trips safely with the DM's Obsidian vault.
- A global command palette: find any entity, run any command, jump to any map or settings section.
- Plain-language world and map settings.
- A tool/category **registry** so adding a tool or category is one declarative entry, not surgery.
- A registry-driven structure that gives Part 4 a clean surface to polish.

## Non-goals

- The fantasy visual skin, icon set, animations, color, type — that is Part 4.
- Full empty/loading/error-state visual design — Part 4. (Part 3 ships a minimal text stub only.)
- Inkarnate-grade drag/snap *feel* on the canvas — Part 4. (Part 3 defines pin↔entity *linkage*, not the drag interaction.)
- Deep keyboard-shortcut polish — Part 4 reserves and refines; Part 3 only defines palette + rail navigation keys.
- A DM "Sessions" content category. Session notes are pure prose with no pin/visibility/publish meaning; they stay in Obsidian. (See §L.)
- Player-submitted notes / contributions. Captured as a future initiative in §L; out of scope here.
- Re-introducing Export, Patch, Zip, save-as-clone, or offline backup in any form (standing rule).
- Autosave. Save remains one explicit button (standing rule).
- Touch / mobile. Desktop + laptop, mouse + keyboard only.

## Confirmed product decisions (this design pass)

1. **Six categories:** Characters, Locations, Factions, Events, Items, Lore. The granular `type` (settlement, ruin, dungeon, port, npc…) becomes a *kind* field **inside** an entity — it still drives pin presets and profile fields — never its own navigation bucket.
2. **Create flow:** one progressive form. Quick fields (name · summary · visibility · kind) with a "More details" reveal for full profile + relationships. Save writes a real `.md` into the correct category folder; the file round-trips with Obsidian. Import / paste stays available alongside it. No export button.
3. **Shell:** a thin left icon rail — each item is an icon + a legible caption + a hover tooltip with its keyboard shortcut. One rail; a divider separates the six content icons from the map-tool icons (Pins, Regions, Routes, Fog). Save and Publish pin to the rail bottom.
4. **Panel over map:** the map canvas is the persistent backdrop. A rail icon opens one panel docked at ≈⅓ width (user-resizable, width remembered, hard cap ½). It overlays the map; it never replaces it or shrinks it to uselessness. Dismiss four ways: click the map background, click the active rail icon, the panel ✕, or Esc. The dismissing click is absorbed — it does not also act on the map. Only one panel is open at a time.
5. **Command palette (Ctrl-K):** one entry point that surfaces entities, commands, settings sections, named maps, and recent items. VS Code-style optional prefix to filter to commands. Not entity-only.
6. **Count badges** on rail icons (e.g. Locations 47; Pins unplaced count).
7. **Pins linkage:** explicit placed/unplaced indicator; clicking a pin opens its entity panel; an entity panel offers "show on map" (pans, does not auto-zoom on open).
8. **Curated ☰ menu:** world/map details + help only. It explicitly excludes every export/clone/backup/offline item (hard-rule guardrail).
9. **Publish home:** a rail icon at the bottom, near Save, visually separated. It opens a Publish panel showing the safety-scan result and the "Publish player site" action.
10. **Friendlier settings:** plain labels + one-line helpers; no raw field keys; no panel-local status or discard (those defer to Part 2's single surface).

---

## A. The editor shell

### A.1 Rail + panel + persistent map

Replace the `<Tabs>` strip in `src/pages/AtlasPlacementEditor.tsx` with:

- A **persistent map canvas** that is always mounted and always interactive (pan/zoom) — including while a panel is open over the still-visible map area.
- A **thin left icon rail**. Top group: the six content categories. Divider. Next group: the map tools (Pins, Regions, Routes, Fog). Bottom (pinned, sticky): Save + status, Publish. Each item: icon + legible caption + hover tooltip carrying the keyboard shortcut.
- **One panel** that opens from the active rail item, docked left over the map at a user-resizable width (default ≈⅓, min readable, hard cap ½). The width persists (via Part 2's session/local persistence). When closed, the map is full-bleed.
- A collapsible **Layers** panel on the right, shown only in a map-tool context (Pins/Regions/Routes/Fog), listing Pins/Regions/Routes/Fog/Base map.
- A top bar: world/map title, the ☰ menu, and — when the panel is collapsed — breadcrumb context ("Characters › Corven").

### A.2 Dismissal and single-panel rule

The open panel closes on: map-background click, active-rail-icon click, panel ✕, or Esc. The closing interaction is absorbed (a background click that closes the panel does not also place a pin or move the map). Opening any rail item closes the current panel first — never two panels.

### A.3 Rail overflow

On short viewports the rail scrolls vertically within the content+map region while Save and Publish stay pinned (sticky) at the bottom, always reachable. No horizontal overflow, no label truncation.

### A.4 The registry

A single declarative array is the source of truth for the rail and palette:

```
RailItem = { id, group: 'content' | 'map' | 'system',
             label, icon, shortcut, badge?: () => number,
             panel: Component }
```

Adding a category or tool is one entry. The rail, the command palette, and badge counts all read this registry. Tab components keep their existing public APIs (§I); only their host changes from a `TabsContent` to a registry `panel`.

## B. Six categories and the entity model

### B.1 Categories are a view over `type`

`Entity.type` stays a freeform string (no schema migration). A pure mapping groups every known `type` into one of six categories:

- **Characters** ← npc and character-like types
- **Locations** ← settlement, capital, village, region, ruin, dungeon, cave, port, temple, shop, hazard, mystery, resonance_site, player_base, and other place-like types
- **Factions** ← faction
- **Events** ← event
- **Items** ← item
- **Lore** ← everything else / untyped (explicit catch-all; nothing is unreachable)

The mapping is total and lives in one module with a unit test asserting every preset `type` and the empty/unknown case resolve to exactly one category. The granular `type` remains the *kind* shown and edited inside the entity (a dropdown), and still drives pin presets and profile fields exactly as today.

### B.2 Category panel

Each category panel: a search box (scoped to that category), a list **defaulting to recently-modified order** (not alphabetical), and pinned bottom actions **＋ New {Category-singular}** and **Import .md / paste**. Empty state is a minimal one-line stub — *"No characters yet — ＋ New Character or Import"* — not a blank field. (Full empty-state visuals are Part 4.)

## C. Create / edit flow and the Obsidian-safe write contract

### C.1 Progressive form

**＋ New** opens one form: name, one-line summary, visibility, kind. A **More details** disclosure reveals the full profile and relationship fields (the existing `EntityForm` sections). The same form edits an existing entity. No separate "quick" vs "full" modes.

### C.2 Write contract (vault safety)

Creating or editing an entity writes through the existing unified Save (`canonicalEntitySave` / the save plugin). Part 3 holds this contract, because Part 3 is the first feature that *creates* files the DM also edits in Obsidian:

- **Atomic write:** the save path writes to a temp file then renames, never exposing a partially written file to Obsidian's watcher. This is a hard Part 3 requirement; the plan's first step audits whether the existing plugin already satisfies it and, if not, makes it so before any create flow ships.
- **Obsidian-Properties-safe YAML:** frontmatter is emitted in a form Obsidian's Properties parser accepts — quoted strings, no multiline YAML scalars, no unsupported types — so Obsidian does not silently reformat and drop fields the atlas depends on.
- **Frontmatter, not prose:** the editor owns frontmatter and may write a minimal body on creation. Editing an entity updates frontmatter only; it never overwrites a prose body the DM authored in Obsidian.
- **Conflict detection is delegated, not reinvented:** disk-vs-loaded divergence reuses Part 2's existing `baseHash` conflict mechanism and its single human-readable "a file changed on disk" status. Part 3 adds no second conflict path.
- **Correct folder:** a new entity's file lands in the category's content folder (e.g. Characters → `…/npcs/`), matching the existing on-disk taxonomy, so it is immediately a normal Obsidian note.

## D. Global command palette (Ctrl-K)

One overlay, one entry point. With no input it shows recent items. Typing matches, across the whole world:

- **Entities** — any of the six categories, jump to its panel.
- **Commands** — Save, Publish, New {category}, Discard, open a settings section, toggle the Layers panel, etc.
- **Maps** — named maps as jump targets.
- **Settings** — jump straight to a settings section.

A leading `>` filters to commands only (VS Code convention); most users type without prefixes and the palette ranks across kinds. The palette reads the registry for commands and categories. It is keyboard-first and fully operable without the mouse.

## E. Pins ↔ entity linkage

- The Pins panel keeps its placed / unplaced / all filter; each row carries an **explicit** placed-or-unplaced indicator (not an implied absence).
- Clicking a pin on the map opens that entity's panel.
- An entity panel offers **Show on map**: it pans to the pin. It does **not** auto-pan or auto-zoom merely because a panel opened — the DM controls the viewport.
- Per-pin icon/color overrides are unchanged (existing presets + overrides).
- Drag-from-rail-to-place and snap *feel* are explicitly Part 4; Part 3 delivers only the linkage and indicators above.

## F. Friendlier world / map settings

Relabel the map-settings panel (`src/atlas/MapSettingsPanel.tsx`) and give world settings a plain home reachable from the ☰ menu.

| Today (jargon) | Part 3 (plain + one-line helper) |
|---|---|
| "Canvas size" / Width / Height | **Map size** — "Width and height in pixels. Matches your uploaded map image." |
| "Ocean / background color" | **Background color** — "Fills behind the map and any area the map doesn't cover (e.g. open ocean)." |
| "Wrap horizontally (planet/longitude)" | **Wrap east–west** — "For whole-planet maps, so the east edge meets the west." |
| "Grid overlay" + kind/size/color/opacity | **Grid** — On/off, then Style (Square / Hex), Cell size, Line color, Opacity. |
| "Unsaved: oceanColor, wrapX, grid" | *(removed)* — folds into Part 2's single honest unsaved count. The panel shows no status string of its own. |
| "Discard local edits" (panel-local) | *(removed)* — Part 2 provides the one global Discard. No per-panel discard. |

World details (world name and similar `world.yaml` fields) get the same plain-label + helper treatment, opened from the ☰ menu.

## G. Curated ☰ menu and Publish

- **☰ menu** contains only: Edit world details, Edit map details, Help. It **must not** contain Export as image, Save as clone, Export as composite, Offline backup, Recovery-export, or any download-a-file action. A code-level guardrail (a comment + a test asserting the menu item set) prevents drift back toward the removed export era.
- **Publish** is a rail item at the bottom. Its panel shows the result of the player-safe build + secret/derived scans ("✓ no DM content leaked" / "✗ blocked: N issues") and the explicit "Publish player site" action. Publish is not Save and is visually separated from it.

## H. Terminology boundary (Part 3 vs Part 4)

Part 3 owns the vocabulary **inside the IA it rebuilds**: category names, rail/panel/menu copy, create-flow copy, command-palette copy, and the settings labels in §F. Leftover jargon on surfaces Part 3 does not restructure — e.g. the "Reload to see the new canon" save-conflict toast — is Part 4's "remove remaining jargon" sweep. This boundary is stated so neither part assumes the other did it.

## I. Dependencies & ordering

- **Part 3 executes after Part 2.** §C's delegation to the `baseHash` conflict mechanism and §F's removal of the panel-local status/discard both assume Part 2's unified `EditorSession` + single `SaveStatus`/Discard exist. Sequence: Part 2 ships → Part 3 builds on it.
- **Frozen tab-hook APIs.** `useRegionDraft`, `useRouteDraft`, `useFogDraft`, `useMapLayers`, and the pin override state keep their exact public APIs (Part 2 already froze these). Part 3 changes only where their components are *hosted* (registry panel instead of `TabsContent`), not their behavior.
- **No schema migration.** `Entity.type` stays freeform; categories are a derived view (§B.1).

## J. Testing & verification

### J.1 Unit
- Category mapping is total: every preset `type` and the unknown/empty case maps to exactly one of the six (table-driven).
- Registry drives rail + palette + badges: adding a fake registry entry surfaces it in all three.
- Command palette: entities, commands, maps, settings, recent; `>` prefix filters to commands; keyboard-only operation.
- Panel: open/close via all four dismiss paths; dismissing click absorbed (no map side-effect); single-panel invariant; width persists and is clamped to ½.
- Settings relabel: rendered labels are the plain strings; no raw field key (`oceanColor`/`wrapX`/`grid`) appears in the DOM.
- Write contract: new entity lands in the right folder; YAML round-trips through an Obsidian-Properties-style parse without field loss; edit updates frontmatter and preserves an existing prose body; atomic-write path used.
- ☰ guardrail test: the menu item set equals the allowed set; no export/clone/backup entries.

### J.2 Regression
- Every former tab works as a registry panel with unchanged behavior (Pins/Maps/Regions/Routes/Fog/Entities/Import/Publish).
- Pin↔entity: click pin opens entity; "show on map" pans without auto-zoom; placed/unplaced indicator correct.
- Part 2 untouched: no-loss invariant, single status surface, and Discard still green with the new shell.

### J.3 Full gate (Part 3 is done only when all green)
- `tsc` clean.
- `npm test` (Vitest) green, including J.1–J.2.
- `npm run lint` clean.
- `npm run atlas:publish` — secrets + derived scans clean; player build unaffected (editor still tree-shaken via `__INCLUDE_EDITOR__`).
- Browser smoke (desktop): rail navigates all six categories + map tools; ＋ New writes a real `.md` in the right folder and it opens cleanly in Obsidian; Ctrl-K finds an entity, a command, a map, a settings section; panel resizes and all four dismissals work with the click absorbed; settings show plain labels only; Publish panel shows scan result; ☰ has no export items.

## K. Risks & mitigations

- **Shell refactor blast radius.** Mitigated by frozen tab-hook APIs (§I) and the registry seam: components move host, not behavior; the regression suite (J.2) is the tripwire.
- **Obsidian vault corruption.** The §C write contract (atomic write, Properties-safe YAML, frontmatter-only edits, delegated conflict detection) is the mitigation; J.1 tests it directly. This is the highest-severity risk because it touches the DM's own files.
- **Scope creep into Part 4.** Every visual/feel item is explicitly fenced (§ Non-goals, §E, §H). Part 3 ships structure and words, not paint.
- **Category mapping gaps.** The total-mapping test (J.1) plus the Lore catch-all guarantees no entity is unreachable.

## L. Out of scope — captured future initiative

**Player-submitted notes / party journal.** A future "Part 5"-class initiative, not designed here. Recorded so it is not lost:

- The player site is a static published build with no backend; it cannot accept writes directly.
- The only architecture-safe *cheap* version is linking the published player site to an external GitHub Discussion as a party journal — zero build-pipeline change, no DM-content path inverted.
- A structured player-notes system (players adding session recaps / NPC theories that feed back toward content) is a separate project with its own trust boundary and moderation model; it must not be bolted onto the Part 3 IA work.
- DM session notes remain in Obsidian; they are not a content category (no pin/visibility/publish semantics).

## Independently shippable

Part 3 is self-contained on top of Part 2: it restructures the editor shell, adds type-aware categories and creation, the command palette, pin linkage, and plain settings, and leaves Part 4 a clean, registry-driven, jargon-bounded surface to polish. Done = §J.3 fully green.
