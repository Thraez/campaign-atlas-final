# Spec — Fix README editor-rail drift

**Created:** 2026-06-15 · **Status:** blessed WANT (queue I4) · **Gate:** docs-only (no code change).

## Problem

The README's "DM Creator Cockpit" section (lines ~693–774) lists the editor panels as:
Pins, Maps, Regions, Routes, Fog, Entities, Import, Publish Check.

The live rail — defined in `src/atlas/shell/railRegistry.tsx` (`buildRailItems`) — is:
**Characters, Locations, Factions, Events, Items, Lore, Pins, Regions, Routes, Fog, Save, Publish.**

Four named items no longer match:

| README says | Reality |
|---|---|
| **Entities** (one tab) | Six separate category tabs: Characters / Locations / Factions / Events / Items / Lore |
| **Maps** | Not a rail item — opened from the hamburger menu (Map Details) |
| **Import** | Not a rail item — opened from the hamburger menu (Import) |
| **Publish Check** | Rail item is now named **Publish** |
| *(missing)* | **Save** is now a rail item (keyboard shortcut Ctrl+S) |

A DM reading the README cannot match what they see in the actual editor.

## Verified real rail (confirmed 2026-06-15)

Source: `src/atlas/shell/railRegistry.tsx`, function `buildRailItems`, lines 41–54.

```
Content group:  Characters (1)  Locations (2)  Factions (3)  Events (4)  Items (5)  Lore (6)
Map group:      Pins (P)  Regions (R)  Routes (T)  Fog (F)
System group:   Save (Ctrl+S)  Publish
```

Menu-reachable panels (hamburger / command palette — NOT rail icons): Map Details, Import, World Details.

## Approach

Documentation-only update to `README.md`. Rewrite the "DM Creator Cockpit" panel list and the per-panel
capability bullets to match the live rail:

- Replace the flat eight-item list with the grouped structure above (Content / Map / System / Menu).
- Rename and expand the "Entities" section into the six category tabs (Characters through Lore), noting
  that each tab has a browse view and a create-new form.
- Move "Maps" and "Import" to a "Menu-only panels" subsection with a note that they open via the
  hamburger (☰) menu.
- Rename "Publish Check" → "Publish."
- Add "Save" as a system rail item.
- Preserve all existing per-panel capability bullets; they describe real behavior that is unchanged.

No code is touched. No build pipeline is involved.

## Secrecy notes

None. This is a docs-only change; no code paths, no entity projection, no player/DM content distinction.

## Files

- `README.md` — the "DM Creator Cockpit" section (~lines 693–774).

No other file is touched.

## Gate

Docs-only. No TypeScript, no ESLint, no Vitest, no atlas safety scan required. Standard git flow: edit,
commit, merge. Confirm visually that the README renders correctly (headings, table) before merging.

## Done when

- The README "DM Creator Cockpit" panel list matches the live rail exactly: Characters, Locations,
  Factions, Events, Items, Lore, Pins, Regions, Routes, Fog, Save, Publish — each with its group noted.
- Maps and Import are documented as menu-only panels (not rail icons).
- Publish Check is renamed to Publish throughout.
- Save is listed as a system rail item with its Ctrl+S shortcut.
- No code files are modified; the gate is docs-only. ~1 run.
