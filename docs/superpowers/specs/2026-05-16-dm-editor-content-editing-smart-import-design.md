# DM Editor — Content Editing & Smart Import — Design

**Date:** 2026-05-16
**Owner:** Thraez
**Status:** Approved — pending spec review, then implementation plan
**Program:** DM-editor product-quality overhaul. This is **Sub-project A**, a post-Part-3 corrective initiative. Parts 1–3 are merged; Part 4 (visual & interaction polish) remains unstarted; the "Obsidian vault as live source" idea is deferred (see memory `idea_vault_as_source.md`). Sub-project A fixes two capabilities Part 3 specified but left unfinished, and adds the markdown rendering needed to make in-app editing usable.

## Problem

Two things that were supposed to work do not, and one supporting capability is missing:

1. **Import never persists atlas fields.** `src/atlas/import/stagingState.ts` computes a row's type as `atlas.type ?? "imports"` and commits the file **verbatim** (`content: input.raw`, "Preserved verbatim through the commit"). The richer inference in `src/atlas/import/parseObsidian.ts` (`inferredType`, `suggestedId`, `effectiveVisibility`) is not wired into the staging path that actually runs, and nothing writes inferred values back into the file. Result: a vault note with no `atlas.type` (e.g. `content/astrath-deeprealm/imports/corven.md`, which carries `tags: [npc, …]` but no `atlas:` type) lands on disk unchanged, the build's `categoryForType(undefined)` falls back to **Lore**, and the entity is mis-categorised with no id/visibility.

2. **The "edit" form is a create-only stub.** `src/atlas/categories/EntityEditorPanel.tsx` accepts `mode: "create" | "edit"` but always initialises empty `useState("")`, never loads an existing entity, exposes no `id` field and no body, and `fullFields` is a placeholder. There is no way to open an existing entity (least of all a Lore/untyped one) and fix its frontmatter or prose in-app. The only repair path today is re-importing the file repeatedly.

3. **The editor cannot render markdown.** The DM sees raw source including `%%…%%` blocks and unresolved `![[image]]` embeds. `%%` is correctly stripped from *player* builds by `scripts/atlas/stripDmBlocks.ts` (this is **not** a leak), but the DM editor has no rendered view, so body editing is effectively unusable and images are invisible.

Concrete failing case the user hit: **Corven, Edric, Soreth** import as Lore, get only map pins, and cannot be opened or edited.

## Goals

- Importing a vault note produces an on-disk file with correct, explicit `atlas.id` / `atlas.type` / `atlas.visibility`, inferred from the note's own signals and **confirmed by the DM** before commit.
- Any entity — including Lore and untyped — can be opened in-app, its atlas fields and markdown body edited, and saved through the existing one-button Save with existing conflict protection.
- A live, Obsidian-faithful rendered preview so what the DM writes (here or in Obsidian) renders the same way it ships: images shown, `%%`/`:::dm` hidden, wikilinks styled.
- Exactly one module emits frontmatter, shared by import and edit-save, so the two paths cannot drift and Part 3's Obsidian-Properties-safe YAML contract is enforced in one place.
- Three independently-shippable slices, each ending in a full green gate.

## Non-goals

- Obsidian vault as a live content source (deferred — memory `idea_vault_as_source.md`).
- Rich-text / WYSIWYG body authoring. The body editor is a plain, syntax-aware textarea for *corrections*; heavy prose authoring stays in Obsidian (user-confirmed).
- A second/full-screen editor surface. Everything lives in the Part 3 rail + panel shell (Approach 1, user-approved).
- DM/player UI parity, hover pins, zoom level-of-detail — that is **Sub-project B**.
- Visual/design-system polish, empty/loading/error visuals — that is **Part 4**.
- Re-introducing Export/Patch/Zip or autosave (standing rules).
- A bulk migration script. Re-import or in-app edit each repairs existing files; two easy paths already exist (YAGNI).
- Touch/mobile. Desktop + laptop, mouse + keyboard only.

## Confirmed product decisions

1. **Approach 1** — finish inside the existing rail/panel shell; maximal reuse of existing inference + read/save plumbing.
2. **Edit scope** — atlas fields **and** markdown body editable in-app. Safe because `content/` is a repo copy, never the DM's vault.
3. **Body editor depth** — corrections + live preview; not WYSIWYG.
4. **Import confirms type explicitly.** Inference pre-fills the per-row type; any row whose type was not already explicit in `atlas.type` is visibly flagged "confirm type" so nothing imports as Lore by accident.
5. **Type is written to both `atlas.type` and the root `tags:` array** (deduped; existing tags preserved) so the file is self-describing in Obsidian and consistent on re-import.
6. **Safe visibility default** — missing/invalid visibility ⇒ `dm`; `publish: true` ⇒ `player`. Nothing auto-publishes.
7. **One Save.** Edit-save routes through the existing unified Save (`localFsSave` / `/__atlas/save`), Part 2 `baseHash` conflict detection, Part 3 atomic temp-write contract. No new save path, no second Save button.

---

## A. Shared frontmatter contract (foundation for Slices 1 & 2)

A single module — `src/atlas/content/frontmatterRewrite.ts` (new) — owns the only operation that emits frontmatter:

```
rewriteFrontmatter(rawFile: string, atlasPatch: AtlasFieldPatch): string
```

- Parses `rawFile` with the existing `src/atlas/import/frontmatter.ts` (`parseFrontmatter`) into `{ data, content }`.
- Deep-merges `atlasPatch` into `data.atlas` (creating the `atlas:` block if absent). Only keys in the patch are touched; existing `atlas.placements`, `atlas.summary`, etc. are preserved.
- Leaves every root-level field (`title`, `role`, `race`, `tags`, `aliases`, `campaign`, …) and the entire body **byte-for-byte unchanged**, except the explicit `tags:` augmentation in Slice 1 (decision 5), which is itself expressed as part of the patch.
- Re-serialises via the existing `stringifyFrontmatter` in `frontmatter.ts` in an Obsidian-Properties-safe form (quoted strings, no multiline scalars) — Part 3 §C contract, enforced here once.

`AtlasFieldPatch` = `{ id?, type?, visibility?, summary?, kind?, tagsAdd?: string[] }`. `tagsAdd` appends to root `tags:` (array-normalised, deduped, order-stable).

Unit-tested for losslessness: parse→rewrite with an empty patch is the identity transform modulo YAML re-emission that itself round-trips through `parseFrontmatter`.

## B. Slice 1 — Smart import that persists atlas fields

### B.1 Inference precedence for `atlas.type` (first match wins)

1. Explicit `atlas.type` present and non-empty → used as-is, row **not** flagged for confirmation.
2. **`tags:` (root array) contains a recognised type keyword** → that type. Mapping module `src/atlas/import/inferTypeFromTags.ts` (new), keyword→type:
   - `npc`, `character`, `person` → `npc`
   - `faction`, `guild`, `organization`, `organisation` → `faction`
   - `item`, `artifact`, `weapon`, `armor`, `armour` → `item`
   - `event` → `event`
   - `settlement`, `city`, `town`, `village`, `capital`, `port`, `region`, `ruin`, `dungeon`, `cave`, `temple`, `shop`, `hazard`, `landmark`, `location` → the matching place type (reuse the keyword as the type where it is already a known place type; otherwise `location`)
   - `lore` → `lore`
   First recognised tag in array order wins.
3. Folder name via the existing `inferTypeFromPath` (`src/atlas/import/inferType.ts`).
4. Fallback **`lore`** — explicit catch-all. The literal string `"imports"` is never used as a type again.

`atlas.id` = existing `atlas.id`, else slug of title/filename (reuse the slug logic already in `stagingState.ts` / `parseObsidian.ts`, which mirrors `scripts/atlas/slugify.ts`).
`atlas.visibility` = existing valid value; else `dm`; `publish: true` ⇒ `player` (reuse `parseObsidian` visibility logic).

### B.2 Persistence (the actual fix)

`StagingRow` gains resolved fields `{ resolvedType, resolvedId, resolvedVisibility, typeWasExplicit: boolean }`, computed in `stagingState.ts` using B.1 (replacing the `atlas.type ?? "imports"` line). On commit, `src/atlas/import/buildImportChanges.ts` sets each change's `content` to `rewriteFrontmatter(row.rawContent, patch)` where `patch = { id, type, visibility, tagsAdd: [type] }` — **not** `input.raw`. Inference is no longer display-only. `rawContent` (the original file text) is preserved on the row for this.

### B.3 Staging UI

The existing staging modal already renders an editable `inferredType` dropdown and supports `updateStagingRow({ inferredType })`. Extend it minimally:

- Show resolved **id**, **type**, **visibility** per row; all editable pre-commit (visibility via a 4-value select: player/dm/hidden/rumor).
- Rows where `typeWasExplicit === false` show a "confirm type" affordance (a visible badge + the type select focused/required) so the DM actively chooses; an unconfirmed inferred-Lore row is visually distinct from a confident one.
- A one-line per-row note: e.g. *"type from tag 'npc'"*, *"type from folder 'npcs'"*, *"no signal — defaulted to Lore, please confirm"*.
- Default visibility stays `dm`; nothing auto-publishes from import.

### B.4 Backfill of existing broken files

No script. Re-importing Corven/Edric/Soreth as **update** rows runs the same rewrite and repairs them; Slice 2 also repairs them by hand. Both paths covered by tests.

## C. Slice 2 — Real edit panel for any entity

### C.1 Reachability

Every category panel row (`src/atlas/categories/CategoryPanel.tsx`) — **including Lore and untyped** — gets an Edit action. A Ctrl-K command "Edit {entity}" is added to the Part 3 registry/palette. No entity is a dead-end.

### C.2 Load

On open, `GET /__atlas/read?path=<entity.sourcePath>` (endpoint already exists; `buildImportChanges` uses it). Response raw `.md` is split via `parseFrontmatter` into atlas fields + body. If `sourcePath` is empty (player-mode atlas loaded) the panel shows the existing player-atlas warning state instead of a broken editor.

### C.3 Edit

`EntityEditorPanel.tsx` is rebuilt so `mode:"edit"` is real:

- Structured atlas fields: **id**, **type/kind**, **visibility**, **summary**, **tags**. Hydrated from the loaded file. Works with no type (untyped/Lore) — type is just an editable field, never a gate.
- A plain, monospace, syntax-aware **body** textarea (corrections use case). The existing `src/atlas/DmMaskingTextarea.tsx` is evaluated for reuse for the `%%`-aware editing affordance.
- The progressive "More details" disclosure from the current stub is kept for the fuller profile fields.

### C.4 Save

Build exactly one `FileChange` via §A `rewriteFrontmatter` (atlas patch from the form) plus the edited body, routed through the existing unified Save: `saveAtlasPatchToLocalFs` → `/__atlas/save`, Part 2 `baseHash` conflict detection, Part 3 atomic temp-write + backup. No new save path. Changing `id` is permitted but surfaced in the existing `DiffPreviewModal` (it can relocate the file / change the slug); the diff preview already shows path + content changes.

## D. Slice 3 — Obsidian-faithful live preview

### D.1 Surface

A live preview pane beside the body editor in the same panel. The Part 3 panel is already user-resizable with a ½ cap; add a **wide/focus** expand for the edit+preview case so body editing is not cramped (still within the existing single-panel shell — no new route).

### D.2 Render contract (mirrors the build/player interpretation)

- `%%…%%` and `:::dm…:::` **hidden by default**, using the **exact** `stripDmBlocks` logic from `scripts/atlas/stripDmBlocks.ts` (single source of truth — extract/share it; do **not** write a second stripper). A DM-only **"Show DM notes"** toggle reveals them in the preview only. Player builds are unaffected — stripping there is the build's job and is unchanged. A test asserts the preview's hidden-set is identical to `stripDmBlocks` output.
- `![[image.ext]]` and `![](path)` resolved to the actual asset path so **images render**. Resolution reuses the attachment logic already in `parseObsidian.ts` (`extractAttachments`) / the asset path convention `public/atlas/assets/...`.
- `[[wikilink|alias]]` rendered as a styled reference; targets resolvable against the known entity set are linked, unresolved ones are visibly marked (reuse `parseObsidian` `extractWikilinks` + `broken` flagging).
- Standard markdown: headings, bold/italic, lists, blockquotes, tables, fenced/inline code.

### D.3 Renderer reuse

If a player-side entity/markdown renderer exists it is reused (bonus: begins the DM/player parity that is Sub-project B). Otherwise a small Obsidian-aware renderer module is created and shared with the player path. The §D.2 contract is fixed regardless of which; the choice is an implementation detail recorded in the plan.

## E. Dependencies & ordering

- Slices ship in order **1 → 2 → 3** but each is independently shippable and independently gated.
- Slice 2 depends on §A (shared frontmatter module) — §A lands as part of Slice 1.
- Reuses, unchanged: `/__atlas/read`, `/__atlas/save`, `localFsSave`, Part 2 `baseHash`/`DiscardConfirmModal`/`SaveStatus`, Part 3 rail/panel/registry/`CategoryPanel`, `categoryForType`, `parseFrontmatter`/`stringifyFrontmatter`, `stripDmBlocks`.
- No schema migration. `Entity.type` stays a freeform string; categories remain the derived Part 3 view.
- Part 4 and Sub-project B are downstream and untouched here.

## F. Testing & verification

### F.1 Unit
- §A round-trip: `rewriteFrontmatter` with empty patch is lossless through `parseFrontmatter`; a patch touches only the `atlas:` block + `tagsAdd`; body byte-identical.
- B.1 precedence table, table-driven, including **Corven, Edric, Soreth** fixtures → `npc`; explicit `atlas.type` wins over tags; tags win over folder; no-signal → `lore` with `typeWasExplicit=false`.
- B.2: committed import content equals `rewriteFrontmatter(raw, patch)`, never `raw`, for a no-`atlas.type` fixture; `tags:` contains the type, deduped, prior tags kept.
- C: read→edit→save→reparse is lossless; untyped/Lore entity is loadable and editable; `id` change produces a relocating `FileChange` surfaced in the diff.
- D: preview hidden-set is byte-identical to `stripDmBlocks`; `![[img]]` resolves; `[[wikilink]]` styled, broken ones marked; "Show DM notes" toggle reveals only in preview.

### F.2 Regression
- Part 2: `baseHash` conflict, Discard, SaveStatus still green with the new edit-save.
- Part 3: categories, registry, palette, panel single-instance + dismissal still green; new Edit action and Ctrl-K command surface via the registry.
- Player build still tree-shakes the editor (`__INCLUDE_EDITOR__`); `npm run atlas:publish` secrets + derived scans clean; no `%%` content in player output.

### F.3 Full gate (each slice done only when all green)
- `tsc` clean · `npm test` green incl. F.1–F.2 · `npm run lint` clean · `npm run atlas:publish` scans clean.
- Browser smoke: import Corven → confirm type prompt appears → lands as **Character** with correct `atlas.id/type/visibility` and `tags` updated → open in edit panel → fix a body line → preview shows his image and hides his `%%` DM notes (toggle reveals) → Save → reload → change persisted, player build still clean.

## G. Risks & mitigations

- **Frontmatter corruption of the DM's notes.** Highest severity. Mitigation: the single §A module, lossless round-trip tests, Obsidian-Properties-safe emission, and the standing fact that `content/` is a repo copy (vault never touched). Edit-save reuses Part 3 atomic temp-write + Part 2 backup.
- **Inference mis-categorising silently.** Mitigated by explicit per-row type confirmation (decision 4) and the "confirm type" flag on non-explicit rows; the DM always sees and can override before commit.
- **Preview/stripper drift causing a perceived (not actual) leak.** Mitigated by sharing the *exact* `stripDmBlocks` code and a byte-identity test; player stripping path unchanged.
- **Scope creep into Sub-project B / Part 4.** Renderer reuse may *touch* player code; the fence is "reuse read-only or extract shared; no parity/LOD/visual work here." Stated in §D.3 and Non-goals.

## H. Independently shippable

Slice 1 alone makes imports correct (fixes the categorisation bug). Slice 2 alone makes every entity editable (fixes the dead-end). Slice 3 alone makes the editor legible (images, hidden DM notes). Each is shippable on its own; together they close Sub-project A. Done = §F.3 green for all three. Sub-project B (DM/player parity, hover, zoom LOD) and Part 4 (visual polish) follow as separate spec→plan→build cycles.
