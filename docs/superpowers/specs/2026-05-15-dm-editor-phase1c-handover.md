# DM Editor UX Overhaul — Phase 1C Handover (2026-05-15)

Phase 1C of the multi-phase DM editor overhaul shipped. This document hands a
fresh conversation everything it needs to verify what landed, pick up the
small backlog of items that need browser eyeballs (or that surfaced *because*
of Phase 1C), and decide what (if anything) comes next.

If anything here contradicts the design spec
`docs/superpowers/specs/2026-05-15-dm-editor-ux-fixes-design.md`, the spec
wins.

---

## 0. State of the work

**Branch:** `claude/agitated-payne-e21dc1` — PR #11 (open).

**Commits on the branch:**

| SHA | Subject |
|---|---|
| `a7f205a` | Phase 1C: .md import staging modal + DnD overlay + paste-markdown dialog |
| `610fe12` | Phase 1C runtime fix: replace gray-matter with js-yaml in stagingState |

**Tests:** 518/518 pass (`npm test`).
**Type-check:** `tsc --noEmit` clean.
**Lint:** clean for every file touched by this PR.
**Player build:** `npm run build` produces a clean bundle; `atlas:check-secrets` + `atlas:check-derived` both clean against `dist/`.

---

## 1. What Phase 1C added

8 new files + 2 touched. Everything lives behind the editor gate
(`__INCLUDE_EDITOR__`) — the player build tree-shakes it out.

| File | Role |
|---|---|
| `src/atlas/import/stagingState.ts` | Pure state primitive — inference rules, target-path computation, allowlist gate, conflict detection, patch-applier. Uses **js-yaml** for frontmatter (gray-matter crashes in the browser; see §3). |
| `src/atlas/import/ImportStagingModal.tsx` | Radix Dialog table — include checkbox / type select / target path / conflict chip per row. |
| `src/atlas/import/buildImportChanges.ts` | Staged rows → `FileChange[]` for the unified Save endpoint. Reads on-disk hash for overwrite rows via `/__atlas/read`. |
| `src/atlas/import/useMdImportFlow.ts` | Orchestrator hook — modal state, file parsing, commit through unified Save, canon reload after success. |
| `src/atlas/import/useMdDropZone.ts` | Window-level DnD watcher. Folder DnD is explicitly rejected. |
| `src/atlas/import/PasteMarkdownDialog.tsx` | C4 single-file capture — title + type + body → routes through the same staging pipeline. DM-only visibility by default. |
| `src/pages/AtlasPlacementEditor.tsx` (touched) | Mounts the hooks; renders the modal + paste dialog + DnD overlay. |
| `src/atlas/tabs/EntitiesTab.tsx` (touched) | "Import .md files…" picker button + "Paste markdown" trigger. |

**Tests (33 new):** `import-staging-state.test.ts` (24), `import-staging-modal.test.tsx` (5), `build-import-changes.test.ts` (4).

---

## 2. Browser verification — what was confirmed

Manual verification driven through the Claude_Preview MCP at 1440×900 on Windows + dev server:

| Check | Result |
|---|---|
| Entities tab shows **Import .md files…** + **Paste markdown** buttons | ✓ |
| **Paste markdown** dialog opens with title + type select + body fields | ✓ |
| Submitting Paste opens the staging modal with the synthesized row | ✓ |
| Default row state: `included=true`, target path uses inferred folder | ✓ |
| Clicking **Import 1 file** writes the .md to `content/<world>/imports/<slug>.md` with frontmatter intact and visibility=dm | ✓ |
| Editing target path to `content/<world>/_atlas/world.yaml` flips the row red with **Outside allowlist** badge, disables the checkbox, disables the **Import** button | ✓ |
| Cancel closes both dialogs cleanly | ✓ |

Bug found + fixed during verification: **gray-matter crashes in the browser** with "Buffer is not defined". Swapped the staging parser for a regex split + js-yaml. See §3.

---

## 3. Known limitations + open items

### 3.1 Pre-existing: dev-save rebuild lands in `.local-atlas/`, not `public/atlas/`

`scripts/vite-plugin-atlas-save.ts` (line ~605) spawns `npx tsx scripts/build-atlas.ts` for the post-save rebuild. The build script's default output is **`.local-atlas/atlas.json`** (gitignored DM build) — only `--player` writes to `public/atlas/atlas.json`. `loadAtlasContent()` fetches `/atlas/atlas.json` which Vite serves from `public/`.

**Consequence for Phase 1C:** after a `.md` import, `reloadCanon()` re-fetches `public/atlas/atlas.json` which doesn't include the new entity. So the staging modal's **client-side conflict detection** can't see DM-only files the DM imported earlier in the same session. The endpoint's `baseHash` check still 409s on a real stale-base overwrite — but the UI won't warn until the request returns.

This is **pre-existing**, predates Phase 1C, and applies to Phase 1A pin saves too (those work because the entities being updated are already in the player canon). Phase 1C is the first feature that *surfaces* the gap because it creates DM-default new entities.

**Possible fix:** make the dev plugin's rebuild step run the player build alongside, OR have `loadAtlasContent` fetch from `.local-atlas/` when running under `__INCLUDE_EDITOR__`. Either is a 1-day change; not scoped to Phase 1C.

### 3.2 Pre-existing: gray-matter is still imported by `parseObsidian.ts` and `canonicalPlacementSave.ts`

Phase 1C only fixed gray-matter in **stagingState.ts**. The other two call sites still `import matter from "gray-matter"`:

- `src/atlas/import/parseObsidian.ts` — used by the existing **Import tab** (full-vault import wizard). If a DM uses that flow, it'll hit the same `Buffer is not defined` crash. The Import tab predates Phase 1C and was apparently never exercised through this path.
- `src/atlas/save/canonicalPlacementSave.ts` — used by the unified Save flow when pin placements need to be written. Phase 1A landed and the PR claims this works; either the path is also broken at runtime and no one's noticed, or there's some indirection that avoids the toBuffer codepath. **Worth a quick browser test** before relying on Phase 1A save.

**If you decide to fix this holistically:** either install `buffer` and shim it via a Vite plugin/define, or write a tiny `parseFrontmatter` + `stringifyFrontmatter` helper based on js-yaml and replace all three call sites. The js-yaml approach is what stagingState already does.

### 3.3 Spec §H gates that still need browser eyeballs

Unit tests cover the logic; these are the visual / interaction checks that can't be driven from vitest:

- [ ] **File-picker happy path** — click *Import .md files…* in the Entities tab, pick 3 `.md` files; staging modal opens with three rows. Uncheck one, click Import 2. Confirm the two land on disk; the third doesn't.
- [ ] **DnD overlay** — drag 3 `.md` files over `/atlas/edit` (not via the toolbar). Confirm the *"Drop .md files to stage for import"* overlay appears; releasing opens the staging modal.
- [ ] **DnD reject** — drag a non-`.md` (e.g. a `.png`). Confirm the **Only .md files supported** toast and that the modal does NOT open.
- [ ] **Frontmatter `path` tooltip** — paste an import whose YAML head sets `path: somewhere/else.md`. Hover the "source suggested path" link in the row; confirm the tooltip shows the ignored path.
- [ ] **Conflict overwrite + backup** — once §3.1 is resolved (or in a session that doesn't reload between), import a file whose target conflicts. Confirm the row defaults unchecked, re-checking flips the chip, committing produces a backup in `.atlas-backups/<ts>/...`.

I drove the first set (Paste happy path + allowlist + cancel) through Claude_Preview but didn't have a clean way to script real DnD events through the MCP.

---

## 4. Recommended first move for the next conversation

1. **Browser-smoke the four manual gates in §3.3.** Editor at 1440×900, dev server `npm run dev`, use real `.md` files in a `/tmp/` scratch folder.
2. **Decide on the §3.1 dev-rebuild gap.** Either:
   - File it for a separate PR (probably the right call — it's an orthogonal concern affecting Phase 1A too), OR
   - Fix it inline: easiest is to have `vite-plugin-atlas-save.ts` run `tsx scripts/build-atlas.ts --player` in addition to the DM build, then keep `loadAtlasContent` pointed at `public/atlas/`. Costs an extra ~1s per save.
3. **§3.2 gray-matter cleanup** is worth doing once verified. Same fix pattern as `stagingState.ts` — replace `import matter from "gray-matter"` with a regex + `yaml.load` for the parse side, and synthesize the output by hand for the stringify side.

---

## 5. Out of scope (still, as in the original spec)

Don't pull these in without explicit user direction:

- **Phase 2** (separate spec): pin drag on map, right-click context menus, marquee select, cross-session persistent undo, snap-to-grid, opt-in true autosave, layers-panel polish.
- **Phase 3** (separate spec): "Publish to live site" button — git commit + push from the editor.
- **Playwright suite** — user direction; revisit later.
- **Landing-page redesign, Timeline visual axis, Browse type-filter chips, Player-mode build audit.**

---

## 6. Key contracts (unchanged from Phase 1A — included for reference)

### Allowed import target folders

Hard-coded in `stagingState.ts`:

```
content/<world>/{places,people,factions,items,events,regions,imports}/<slug>.md
```

Anything else is `pathAllowed: false` and the row is uncheckable + red.

### Type → folder mapping

```
settlement, ruin, dungeon, location, map_note → places
npc                                            → people
faction                                        → factions
item                                           → items
event                                          → events
region                                         → regions
* (anything else, including missing)           → imports
```

### Save payload (one entry per imported row)

```jsonc
{
  "path": "content/<world>/<folder>/<slug>.md",
  "content": "---\n…full file body…\n",
  "kind": "entity-md",
  "baseHash": null         // or "sha256:<hex>" for explicit overwrites
}
```

The endpoint enforces 200 / 207 / 400 / 409 / 423 / 500 exactly as documented in the design spec §C.

### Frontmatter `path` is IGNORED

Per spec §H — the source file's own `path:` field is exposed only as a tooltip on the staging row. The target on disk is always the computed `content/<world>/<folder>/<slug>.md`. This is what stops a malicious or sloppy file from steering itself into `_atlas/world.yaml` or another world.

### Conflict default

A row whose target already exists on disk defaults `included: false` with a *"Will overwrite — explicit confirm required"* chip. Re-checking the checkbox is the only way to opt in; the chip then reads *"Will overwrite — existing file backed up"*.
