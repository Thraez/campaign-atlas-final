# Design spec — Obsidian read-only merge ("Sync from Obsidian")

**Date:** 2026-06-16
**Status:** Approved design (DM brainstorm 2026-06-16) — hardened by an adversarial review pass; ready for implementation plan
**Owner:** the DM
**Model used:** Opus 4.8
**Implements:** the brief `2026-06-15-obsidian-readonly-merge-brief.md` (the safety-bounded slice of `2026-05-28-vault-as-source-strategy-brief.md`)
**Companion (next):** one-click Publish (`2026-06-15-one-click-publish-brief.md`) — a separate spec.
**Revision note:** §3/§5/§7/§8/§9 were rewritten after a 4-lens adversarial review (secrecy, data-loss, feasibility, coherence) caught real holes in the first draft. The most important corrections: the merge base is now stated explicitly, visibility is always resolved+persisted, new-entity exposure is gated, and the scan scripts are no longer over-credited.

---

## 1. What we're building (plain language)

You write your world in Obsidian. You bring those notes into the atlas. Then, in the atlas
editor, you do work the vault never sees: you drop pins on maps, mark notes player-visible or
DM-only, and wire up relationships between people and places.

Today, **re-importing a note you've edited in Obsidian silently throws that atlas work away** — it
rewrites the whole note from the vault copy, which never had your pins or visibility. So in practice
importing is a one-way trip you don't dare repeat.

This feature makes re-importing **safe and repeatable**: a single **"Sync from Obsidian"** button
that pulls your updated prose into existing entities while **provably keeping** your pins,
visibility, and relationships, **never writes a single byte back to your vault**, and **never
quietly makes anything visible to players**. The mental model, in one line:

> **Obsidian owns your words. The atlas owns your map. Sync respects the line.**

This serves roadmap goal #1 ("effortless for me to build") and is gated by goal #2 ("rock-solid for
players — never leaks a DM secret").

---

## 2. Decisions locked with the DM

| # | Decision | Choice |
|---|----------|--------|
| D1 | **File include/exclude** | **Saved ignore rules + a per-run checklist.** Set "always ignore these patterns" once; every sync is pre-filtered; you can still untick individual notes per run. *(Re-including a normally-ignored note for one run = edit the rule, or use the "show ignored" toggle — see §8.)* |
| D2 | **Re-sync trigger** | **Point once, then one button.** Configure the vault location once; thereafter a single "Sync from Obsidian" re-reads it (read-only), applies ignore rules, shows the review list. |
| D3 | **Player secrecy direction** | **Never auto-reveal — always ask.** A sync can keep a note hidden silently, but ANY change that would make a note visible to players — *including a brand-new note that asks to be published* — stops for explicit DM confirmation. |
| D4 | **Vault writes** | **None, ever.** The vault is strictly read-only. (Re-affirms the decision against two-way sync.) |
| D5 | **Ownership model** | "Obsidian owns words; atlas owns map." Approved; made precise in §3. |
| D6 | **Summary ownership** | **Obsidian wins** on re-sync. |
| D7 | **Type ownership** | **Two-way:** Obsidian changes flow in, but an atlas-side type edit is not clobbered — a 3-way merge keyed on the last-synced value (§3.6). |
| D8 | **Old ImportPanel** | **Delete it** (folding its useful part into the new Sync panel), which also removes the lingering Export Patch flow. |
| D9 | **Tags/aliases** | **Union** both sides; the DM keeps spoilers out of tags (they ship verbatim — §3.3). |

---

## 3. The merge: ownership model + exact algorithm

A note file is *both* a prose home and an atlas-data home. The merge separates three **namespaces**
inside the file, each with a stated default. **This is the safety core — it is an algorithm, not a
vibe.**

### 3.1 The merge base (the single most important rule)

**The merge always starts from the parsed ON-DISK frontmatter as the base, then overlays only the
recognized vault content keys. It is NEVER the reverse.** Concretely, the result is built as:

```
result = { ...vaultTopLevel,          // (3) Obsidian author properties win, incl. title
           atlas: mergedAtlasBlock }  // (1)+(2) below
result.body = vault.body              // prose always comes from the vault copy
```

where `mergedAtlasBlock = { ...disk.atlas,           // (1) every disk atlas key, verbatim
                            ...vaultContentAtlasKeys, // (2) overlay content keys from vault
                            tags:   union(disk, vault),
                            aliases:union(disk, vault),
                            visibility: resolveVisibility(...) }  // §3.4 — always explicit`

Starting from disk guarantees **nothing the atlas owns can be dropped**, even keys this spec never
heard of.

### 3.2 Namespace (1) — atlas structure: disk wins, preserved verbatim

Taken wholesale from `disk.atlas` (the `{ ...disk.atlas }` spread), so the merge is **future-proof
and legacy-safe** — it preserves these *and any key not enumerated here*:

- `placements[]` (pins/positions + per-pin styling) **and legacy `atlas.x` / `atlas.y`** (build still
  reads these from raw frontmatter at `build-atlas.ts:510-512` when `placements[]` is empty; they are
  NOT in the typed `AtlasFrontmatter` interface, so an allow-list merge would silently drop a pin —
  the verbatim spread is what protects them)
- `relationships[]`, `profile` (copied as a **whole object** from disk; a vault `atlas.profile` is
  ignored entirely — no field-level profile merge)
- `id` (durable identity; §6)
- `visibility` / `publish` (secrecy; §3.4 + §7)
- any unrecognized / future `atlas.*` key

### 3.3 Namespace (2) — atlas content: vault overlays disk

These atlas sub-keys are authored in Obsidian frontmatter, so the vault copy overlays disk:

- `summary` → vault wins
- `type` → **two-way 3-way merge** (§3.6) — not a simple overlay
- `race`, `date`, `dateValue`, `images`, `canon`, `world` → vault wins
- `tags` → **union(disk, vault)**, then the **inferred type is appended as a tag** to preserve the
  current import behavior (`buildImportChanges.ts:74` does this today via `rewriteFrontmatter`'s
  `tagsAdd`; the new merge must keep doing it — otherwise dropping `rewriteFrontmatter` is a silent
  behavior change)
- `aliases` → **union(disk, vault)**

> **Player-facing channel warning (from the secrecy review).** `tags` and `aliases` ship **verbatim**
> on player-visible entities — the player projection only scrubs `%%…%%` / `:::dm:::` and a fixed
> META_TAGS set (`projectEntityForPlayer.ts:107-108`). A spoiler tag like `is-the-secret-king` is
> neither, so it would be published. Union doesn't *create* this channel (it exists today), but it
> *preserves* a disk spoiler tag across a sync. **Accepted residual risk**, documented here; the DM
> keeps spoilers out of tags/aliases. *(Confirmable §11: stop unioning tags onto player-visible
> entities if you'd rather the tool enforce this.)*

### 3.4 The third namespace — top-level Obsidian properties: vault wins

Real notes carry an open-ended top-level namespace (e.g. `corven.md` has `role`, `campaign`,
`status`, `occupation`, `faction`, `voice`, `appearance`, …) plus the top-level `title`. These are
**author-owned Obsidian properties**: the result takes the vault note's entire top-level object
(`{ ...vaultTopLevel }`), so edits *and deletions* in Obsidian flow through, then sets the merged
`atlas` block over it. Build only consumes two top-level things — `title` (`build-atlas.ts:332`) and
`atlas` — both handled. `title` therefore "vault wins" naturally (a renamed note's new title flows in;
identity stays stable via §6, even though the slug changes).

### 3.5 Visibility is always resolved and persisted

**Never rely on visibility-by-omission.** `build-atlas.ts:345` defaults a note with no
`atlas.visibility` key to **player**. So the merge must compute the *effective* visibility (the value
build would derive from the pre-merge disk state) and write it **explicitly** into the merged
frontmatter on **every** row. The merge must never emit an entity whose `atlas.visibility` is absent.
(See §7 for the rule that decides *which* value, and §9 for the test that proves it.)

> One-line version for the DM: *"Your map structure and your secrecy choices are sacred; everything
> else follows your notes — and the tool always writes down exactly who can see each note, so nothing
> drifts."*

### 3.6 Type — a genuine two-way field (3-way merge)

`type` is special: the DM wants Obsidian changes to flow in **and** atlas-side type edits to stick.
With only two inputs (disk + vault) you cannot tell whether a divergence came from Obsidian or from
the atlas, so the merge keeps a **base**: the sync-map (§5.3) records, per note, the `type` value
**last synced from Obsidian** (`baseType`). Resolution on each sync:

| disk vs base | vault vs base | Result |
|---|---|---|
| unchanged | changed | **vault** (Obsidian changed it → flows in) |
| changed | unchanged | **disk** (you edited it in the atlas → kept) |
| unchanged | unchanged | disk (== vault == base; no-op) |
| changed | changed (and ≠ disk) | **needs-review row** (both changed) — keep disk unless the DM ticks "take Obsidian's type" |
| *(no base recorded — first sync after this ships)* | — | **vault** (import from Obsidian), then record `baseType` |

After every successful sync, `baseType` is updated to the vault's current type. This is the only field
with 3-way semantics in v1; everything else follows §3.2–§3.5. *(All other content keys could adopt
the same pattern later if desired; out of scope now.)*

---

## 4. The re-sync experience (user flow)

**First-time setup (once):**
1. Open the **Sync from Obsidian** panel.
2. **Enter your vault path** — the absolute folder path on this machine (e.g.
   `C:\Users\you\Obsidian\MyWorld`). *(A browser folder-picker can't reveal an absolute path, so this
   is a text field you paste/confirm once; an optional "Browse" prefill may help but you confirm the
   root — see §5.4.)*
3. Optionally add **ignore rules** — glob patterns to always skip (`Templates/**`, `_drafts/**`,
   `**/*.excalidraw.md`). Built-in ignores (`_drafts`, `_dm`, `templates`, …) still apply on top.
4. **Save settings.** Stored *only on this machine*; never committed, never published.

**Every sync after that:**
1. Click **Sync now.** *(Requires the DM build to be loaded — §5.6.)*
2. The atlas reads the vault folder (read-only), skips ignored files, matches each note to its entity.
3. The **review list** appears — the familiar staging table, pre-filtered:
   - **Updated** (prose changed, atlas work kept) — checked by default.
   - **New** (not yet in the atlas) — checked by default, imported **DM-only** unless flagged below.
   - **Needs your OK** (a secrecy increase, or a possible rename) — **unchecked by default**, each
     with a plain reason. Nothing risky happens unless you tick it.
   - You can untick anything; an optional **"show ignored"** toggle lets you pull in a normally-ignored
     note for this run.
4. Click **Import.** The merge runs, the atlas rebuilds, and a summary reports e.g. *"12 updated (pins
   & visibility kept) · 1 new · 1 needs review (skipped)."*

The vault is only ever read.

---

## 5. Architecture

The merge is a **pure, client-side function** over two parsed frontmatter objects (disk + vault),
composed into the existing import → save flow. The server only does file I/O. This keeps the
safety-critical logic unit-testable in isolation.

```
[Sync now]  (precondition: DM build loaded — §5.6)
   │
   ├─(read-only)→ GET /__atlas/vault-scan?vaultRoot=…   ← NEW dev-only endpoint (§5.1)
   │                walks vault, applies ignore globs server-side, returns { relPath: content }
   │
   ├─ build staging rows + classify (identity §5.3; secrecy/rename flags §5.5)
   │     using the loaded DM-canon visibility map (id → effective visibility + sourcePath)
   │
   ├─ for each update/merge row at commit time:
   │        GET /__atlas/read  ← existing, reads on-disk entity (content/ only)
   │        mergeImportFrontmatter(diskParsed, vaultParsed)  ← NEW pure fn (§3, §5.7)
   │        re-verify secrecy against the fresh disk read (defense in depth — §7)
   │        → FileChange { content: merged, baseHash: sha256(freshDiskRead) }
   │
   ├─ review list (existing ImportStagingModal + orthogonal needsReview flag — §8)
   │
   └─ commit → saveAtlasPatchToLocalFs → POST /__atlas/save  ← existing
                 baseHash conflict guard + .atlas-backups/<ts>/ + atomic write (unchanged)
```

### 5.1 Vault reader — new read-only endpoint

- **New:** `GET /__atlas/vault-scan?vaultRoot=<abs-path>` in `scripts/vite-plugin-atlas-save.ts`,
  beside `/__atlas/read` and `/__atlas/save`.
- **Read-only, dev-only, never in player builds:** the plugin is `apply: "serve"` (`:911`) so it's
  physically absent from `npm run build`, and every request passes the existing `isAllowedDevRequest()`
  (loopback host + origin) gate. No `vite.config.ts` change needed.
- **Behavior:** recursively walk `vaultRoot`, return `{ files: { [relPath]: content } }` for `.md` files
  only, **after applying the saved ignore globs server-side** (so ignored files never leave the reader).
- **Path safety (`isReadableVaultPath`, new, in `sourcePathAllowlist.ts`, kept SEPARATE from the
  content/ write allowlist):** resolve both `vaultRoot` and each candidate with `path.resolve`; require
  the resolved candidate to be contained in `vaultRoot` using a **separator-aware boundary check**
  (`resolved === root || resolved.startsWith(root + path.sep)`) — never a raw `startsWith` (or a sibling
  `…/vault-secrets` slips past `…/vault`); reject `..`, reject symlinks that resolve outside the root,
  `.md` only. **This allowlist grants no write capability of any kind.**
- **Size guard:** cap aggregate response (e.g. ≤ ~25 MB) and per-file size (reuse `MAX_FILE_BYTES`);
  past the cap, return a clear error naming the offending size rather than a giant payload. *(For very
  large vaults, a future optimization is frontmatter-first + lazy body load; not v1.)*
- **Proof of read-only:** GET-only handler, `fs.readFile` exclusively, no `fs.write*` in the vault path.
  A test asserts the *write* allowlist (`isWritableSourcePath`) rejects the vault root and anything
  outside `content/`.

### 5.2 Ignore-rule engine (new dependency)

- The built-in `IGNORED_FOLDERS` (`inferType.ts:34-58`) is **segment-equality only** — it cannot
  express `Templates/**` or `**/*.excalidraw.md`. The spec's glob UX therefore needs a real matcher.
- **Add `picomatch` as an explicit dependency** (tiny, zero-dep, the de-facto glob engine; likely
  already transitively present). Specify the dialect = picomatch defaults, **case-insensitive**
  (matching the existing folder-name behavior), patterns matched against the **vault-relative POSIX
  path**.
- **Composition:** a file is skipped if it matches ANY DM glob OR its path hits a built-in
  `IGNORED_FOLDERS` segment. The shared ignore predicate must live somewhere importable by both
  `scripts/` (server walk) and `src/` (UI preview), e.g. `src/atlas/import/ignoreRules.ts`.

### 5.3 Identity & matching (never silently orphan, never silently duplicate)

`atlas.id` is the durable anchor and is **already stamped** into every on-disk entity on import/save
(`buildImportChanges.ts:71`, `newEntitySave.ts:39`, `canonicalEntitySave.ts:74`). The vault copy
usually lacks it, so matching precedence per vault note is:

1. **Explicit `atlas.id` in the vault note** → that entity.
2. **Sync-map hit** — `.local-atlas/sync-map.json` records, per note,
   `{ [vaultRelPath]: { id, baseType } }` after each successful sync (`baseType` is the last-synced
   Obsidian type, used by the §3.6 two-way merge); a note at the same path re-syncs deterministically
   even if its title changed.
3. **Exact title-slug** (`slugify(title)`, identical to `build-atlas.ts:337` / `stagingState.ts:198`).
4. **No match** → candidate **new** entity.

**Routing/stamping reconciliation (critical fix).** A match from (1) or (2) **overrides the
vault-derived `resolvedId`** for *both* the target path and the stamped id: the row routes to the
matched entity's **current `sourcePath`** and the merged `atlas.id` stays the **matched entity's id**,
never the vault title-slug. (Today routing keys purely on `existingById.has(resolvedId)`; the sync-map
must feed that lookup, or a renamed note resolves to a new slug, misfiles as `create`, and the build
silently drops it as a duplicate slug — `build-atlas.ts:337-343`.)

**Collision guard.** Any candidate-new row whose post-build slug/id equals an **existing** entity id is
forced to a needs-review row (never a silent create). A build duplicate-slug skip must surface in the
import summary, not just stderr.

**File-rename handling (scoped for v1 — no fuzzy heuristic).** The common renames are covered
deterministically by (1) and (2). A *full file rename in Obsidian* (path **and** title both change)
will appear as a new note plus an orphaned old entity. For that case the review list offers a manual
**"link this note to an existing entity"** dropdown (opt-in, off by default) so the DM explicitly says
"this replaces X"; on confirm it becomes a merge row and updates the sync-map. **No automatic "closely
resembles" matching** — that was under-specified and risked false nags; deferred.

**Orphans (entities with no vault note this run).** Listed **informationally** ("3 entities have no
matching note — left as-is"). They are never auto-deleted and never auto-fused into a rename. (Vault
deletions are a non-goal — §12.)

### 5.4 Vault path capture & configuration storage

- **Vault path is an absolute string the DM enters/pastes** (browser folder-pickers expose only
  `webkitRelativePath`, never an absolute path). Stored in `.local-atlas/editor-settings.json`
  (`.local-atlas/` is already in `.gitignore`):
  ```ts
  interface EditorLocalSettings {
    vaultPath?: string;     // absolute path on this machine
    ignoreGlobs?: string[]; // picomatch patterns; on top of built-in IGNORED_FOLDERS
    lastSyncAt?: string;    // ISO; for the panel's "last synced" line
  }
  ```
- **New dev endpoints required (not endpoint-free like `importFolders`).** The existing `/__atlas/read`
  is hard-gated to `content/` by `isWritableSourcePath`, so it **cannot** read `.local-atlas/`. Add a
  narrow read/write route (or one parameterized) for **exactly** `.local-atlas/editor-settings.json`
  and `.local-atlas/sync-map.json` (literal filenames, no traversal, no globbing), gated by
  `isAllowedDevRequest`. These are machine-local, DM-build-only, and excluded from player builds the
  same way the rest of the editor is.

### 5.5 The review-state model (orthogonal flag, not new rowKinds)

To avoid rippling the closed `rowKind` union (`create`/`update`/`path-collision`) through every switch
(`buildImportChanges.ts:66` baseHash branch; `summarizeImport.ts:27-29` buckets), model the new states
as an **orthogonal `needsReview?: { reason: "secrecy-increase" | "rename-link" | "type-conflict" }`
flag** on the row, leaving `rowKind` for routing. A confirmed `rename-link` row takes the
**update/baseHash** code path (it merges into an existing file); a `type-conflict` row (§3.6) merges
either way — ticking it just chooses Obsidian's type over the atlas type. `summarizeImport` gains an explicit **`needsReview`** bucket
(counted whether or not included) so the toast wording in §4 is derivable.

### 5.6 Precondition — the DM build must be loaded

Matching (§5.3) and the secrecy gate (§7) both need each entity's **effective visibility** and
**sourcePath**, which only exist when the editor has loaded the **DM build** (`.local-atlas/atlas.json`,
served at `/atlas/atlas.json`). On a fresh/degraded worktree the editor falls back to the **player**
atlas (no DM/hidden entities, `sourcePath` stripped) — in which state every hidden-entity re-sync would
misfile as a new entity *and* bypass the gate. **Sync must refuse to run** if the DM build isn't loaded
(`existingById` empty or sourcePath-stripped), with a clear "rebuild in DM mode first" message,
mirroring the existing `CanonicalSaveError` guard.

### 5.7 The merge engine

- **New pure function** `mergeImportFrontmatter(diskParsed, vaultParsed)` in
  `src/atlas/import/mergeImportFrontmatter.ts`, implementing §3 exactly (disk-base spread of
  `disk.atlas`, vault overlay of content keys, union tags/aliases + type tag, vault top-level namespace,
  resolved explicit visibility). Pure, no I/O, fully unit-testable.
- **Integration point:** `buildImportChanges.ts:66-75`. Today, for `rowKind === "update"`, it reads the
  on-disk file (`:67`) for `baseHash` but rewrites from `row.rawContent` (vault text) via
  `rewriteFrontmatter` (`:70`) — the data-loss line, and also the line where `row.resolvedVisibility`
  (vault-derived) currently sets visibility. New behavior:
  - **update / confirmed rename-link** rows: parse the **fresh** on-disk frontmatter, call
    `mergeImportFrontmatter`, serialize via `stringifyFrontmatter`, emit a `FileChange` with a
    `baseHash` computed from that same fresh read (so the conflict window is commit-time, not
    stale staging-time — addresses the multi-row stale-base concern).
  - **create** rows: no atlas data to preserve, but **visibility defaults to `dm`** and is written
    explicitly; a vault note requesting player exposure becomes a `secrecy-increase` needs-review row
    (§7), imported as player only if ticked.
  - **path-collision** rows: unchanged (OFF by default).
- **The editor visibility dropdown and `row.resolvedVisibility` are ignored for sync rows** — disk
  visibility is authoritative (§7). The dropdown that exists in `ImportStagingModal` must be disabled
  for update rows in the sync flow, or the gate is bypassable via the UI.
- **Conflict guard + backups reused, not reinvented:** the `FileChange` rides
  `saveAtlasPatchToLocalFs` → `/__atlas/save` (baseHash stale/exists/missing guard +
  `.atlas-backups/<ts>/`, atomic rename, partial-write rollback). **Same-target collisions** (two vault
  notes → one entity) are detected during staging and surfaced as a per-row warning ("two notes map to
  the same entity — pick one") so they don't fail the whole batch with an opaque duplicate-path 400; a
  friendly toast branch is added for that 400 as a backstop.

---

## 6. Identity stamping — already solved, must be preserved

No new stamping is required. The merge must simply **not recompute `atlas.id` from the title on
update** — `atlas.id` comes verbatim from disk (it's in the disk-base spread, §3.2). The build's
derivation (`build-atlas.ts:337`, `parsed.atlas.id || slugify(title)`) then keeps the entity stable
regardless of Obsidian renames.

---

## 7. The player-secrecy invariant (D3, made concrete and honest)

Player-visible tiers = `{player, rumor}`; hidden tiers = `{dm, hidden}` (verified at
`projectEntityForPlayer.ts:15`, `filterEntitiesForLens.ts:4`). The rule operates on **effective**
visibility (post-default, §3.5), not the literal key.

**This is a deliberate behavioral change, stated plainly.** Today an update row's visibility flows from
the *vault* (`stagingState.ts:163-167` → an editable dropdown → `rewriteFrontmatter`). The sync flow
**inverts** that: on update rows, **disk visibility wins** and the vault copy cannot change it silently.

- **Update rows:** result visibility = disk effective visibility, by default. A vault copy that is
  silent, equal, or *less* exposed → disk wins, silently and safely.
- **Exposure increase = the only thing that asks.** If disk is `dm`/`hidden` **and** the vault copy
  would make it player-visible (`visibility: player|rumor` or `publish: true`) → a `secrecy-increase`
  needs-review row (OFF by default, plain reason "This will make *X* visible to players"). Applied only
  if the DM ticks it. **A re-sync can never silently increase player exposure.**
- **New rows:** default `dm` (written explicitly); a vault request for player exposure is a
  `secrecy-increase` row too — so a brand-new `publish: true` note is **not** auto-published (closes
  the new-entity hole from review).
- **Commit-time re-verification (defense in depth):** because the review list is classified against the
  loaded DM-canon while the merge reads fresh disk at commit, the merge re-checks: if the fresh disk
  read shows an exposure increase that wasn't a ticked `secrecy-increase` row, it refuses that row
  rather than exposing. (Handles a `.md` hand-edited between build and sync.)
- **Wikilink redaction is NOT independent defense** — it consumes the same `secretIds` set derived from
  disk visibility (`projectEntityForPlayer.ts:60-69,86-97`). It holds *because* the merge preserves the
  target entity's dm visibility. The honest guarantee is single-rooted: **preserve each entity's
  effective on-disk visibility exactly.**

**What the existing scans do and DON'T prove (corrected from the first draft):**

- `npm run atlas:check-secrets` (`check-no-secrets.ts`) matches only **four hard-coded fixture
  sentinels** + editor-code fingerprints. It proves the *fixtures* didn't ship and the *editor* didn't
  ship. It **cannot** detect real DM prose in an un-stripped `%%…%%` / `:::dm:::` block. Do not credit
  it with gating arbitrary leaked prose.
- `npm run atlas:check-derived` (`check-derived-secrets.ts`) derives the must-not-appear name list from
  the **same post-merge disk files** it then scans. So a merge bug that flips an entity's disk
  visibility makes that entity *not* derived as secret — the scanner goes blind to the exact regression
  this feature most risks. It is downstream of the merge and **cannot self-check it.**
- **The real proof lives in tests (§9):** the projection pipeline (`projectEntityForPlayer` →
  `stripDmBlocks` → `filterEntitiesForLens`) runs on every player-path entity (unchanged), plus new
  merge-level tests that assert byte-equal visibility preservation and a pre/post secret-ID diff.

**Ship gate (still required, with corrected expectations):** `atlas:publish:integrity-smoke` +
`atlas:check-secrets` + `atlas:check-derived` green on the player build — as a backstop, not the
primary proof.

---

## 8. The review surface

Reuse `ImportStagingModal` + `useMdImportFlow` + `stagingState`. Additions:

- **`needsReview` flag** (§5.5) with reason `secrecy-increase` | `rename-link`, both default
  **unchecked**, opt-in via `updateStagingRow`. Note the real inclusion gate is
  `included = !parseError && pathAllowed && <ticked>` (`stagingState.ts:301-302`) — *not* verbatim; for
  a `rename-link` row whose target is the matched entity's `sourcePath`, verify that path satisfies
  `isAllowedTargetPath` (which requires exactly 4 segments — a deeply-nested entity path would be
  rejected; handle gracefully).
- **Per-run checklist (D1):** every surfaced row has its checkbox; ignore rules pre-filter, with the
  optional "show ignored" toggle for one-run inclusion.
- **Visibility dropdown disabled** on sync update rows (§5.7).
- **Summary (`summarizeImport.ts`):** add the `needsReview` bucket + a "merged / atlas data kept"
  outcome so the toast reads e.g. *"12 updated (pins & visibility kept) · 1 new · 1 needs review
  (skipped)."*

---

## 9. Safety guarantees and how each is proven

| Guarantee | How it's proven (the test is the proof — not the scanners) |
|-----------|-----------|
| **Merge base is disk** | Unit: disk has unknown `atlas.fooBar` + top-level `role` + legacy `atlas.x/atlas.y`; vault omits all → assert all survive byte-for-byte; assert body/summary/top-level props update from vault. |
| **Never lose atlas work** | Round-trip: import → add placements/relationships/profile/pins → re-sync a vault copy lacking them → every atlas-structure key survives verbatim; profile copied whole (disk `profile.dm {secret:A}` + vault `{secret:B}` → result `{secret:A}`). |
| **Never lose vault words** | corven-shaped note: disk top-level `status: stale`, vault `status: active` → result `active`; a property deleted in vault is absent in result. |
| **Type two-way (§3.6)** | base=npc: (vault→faction, disk=npc) → faction; (vault=npc, disk=location) → location kept; (vault→faction, disk=location) → needs-review row, disk kept unless ticked; no base → vault wins + base recorded. |
| **Visibility never drifts** | Disk note with NO visibility key + no publish (effective player) → merged output contains an **explicit** `atlas.visibility`. Disk `dm` + vault silent/`publish:true` → stays `dm` (no row) / produces a `secrecy-increase` row (OFF), never a silent change. Assert disk effective visibility byte-equals pre-merge for every update row. |
| **Never auto-expose (incl. new notes)** | New vault note `publish:true` → imported `dm`; becomes player only after ticking its `secrecy-increase` row. Pre/post **secret-ID diff**: snapshot secret ids before sync, assert none moved secret→player without a ticked row. |
| **DM prose really is stripped** | New targeted test: merged player-visible entity whose vault body has a **real (non-sentinel)** `%%…%%` and `:::dm:::` block → player projection strips both (proves the pipeline, which the sentinel scanner cannot). |
| **Wikilink redaction holds** | Re-sync a player-visible note linking a DM entity → DM entity still in `secretIds` post-merge AND the link renders redacted. |
| **Never write the vault** | GET-only vault-scan; `isReadableVaultPath` read-only with separator-aware containment + traversal/symlink tests; assert the *write* allowlist rejects the vault root. |
| **Never silently orphan/duplicate** | Identity: sync-map match overrides slug → routes to entity file, merged id == disk id, no create. A new note slug-colliding an existing id → forced needs-review, not silent create. |
| **Re-runs can't clobber** | baseHash computed at commit-time read; stale-base surfaces a conflict for that row; `.atlas-backups/<ts>/` retained. |
| **Build/player parity holds** | `projectEntityForPlayer-build-parity.test.ts` stays green; ship-gate scans green (backstop). |

---

## 10. Files touched (verified against current code)

**New:**
- `src/atlas/import/mergeImportFrontmatter.ts` — the pure merge (§3, §5.7).
- `src/atlas/import/ignoreRules.ts` — shared picomatch + built-in ignore predicate (§5.2).
- `src/atlas/sync/SyncPanel.tsx` (+ a settings hook) — the "Sync from Obsidian" UI.
- `.local-atlas/editor-settings.json`, `.local-atlas/sync-map.json` — machine-local, gitignored.

**Modified:**
- `scripts/vite-plugin-atlas-save.ts` — add read-only `GET /__atlas/vault-scan`; add narrow
  read/write routes for `.local-atlas/editor-settings.json` + `sync-map.json`.
- `src/atlas/save/sourcePathAllowlist.ts` — add read-only `isReadableVaultPath` (separator-aware) +
  the `.local-atlas` literal-filename allowlist; **leave the write allowlist untouched**.
- `src/atlas/import/buildImportChanges.ts:66-75` — route update / rename-link rows through
  `mergeImportFrontmatter`; commit-time baseHash; explicit visibility; keep the type-as-tag stamp.
- `src/atlas/import/stagingState.ts` — `needsReview` flag + reasons; identity precedence (sync-map /
  atlas.id override of `resolvedId` for routing + id); thread an **id→{visibility, sourcePath}** map
  into `StagingContext` (sourced from the loaded DM canon, `project.entities`); same-target collision
  detection.
- `src/atlas/import/useMdImportFlow.ts` — `openWithVaultScan()` beside `openWithFiles()`; DM-build
  precondition guard; friendly toasts for duplicate-path 400 and the precondition.
- `src/atlas/import/summarizeImport.ts` — `needsReview` bucket + "merged/kept" outcome.
- `src/atlas/shell/railRegistry.tsx` + `AtlasPlacementEditor.tsx` — mount the Sync panel as a system
  rail item.
- **`src/atlas/import/ImportPanel.tsx` — DELETE (DM-approved, D8):** it is a *second*, still-wired
  import surface (`AtlasPlacementEditor.tsx:1505`) containing the **Export Patch** download
  (`exportPatches`/`exportSafeAll`/`downloadText`, `:206-222`) that was ordered removed 2026-05-16, plus
  the only `webkitdirectory` picker. Its useful concept folds into the new Sync panel; the component and
  its Export-Patch flow are removed, per the "decisively remove legacy code" rule. Unmount it from
  `AtlasPlacementEditor.tsx` and remove any now-dead helpers (`parseObsidian` export-patch path,
  `exportPatches`/`downloadText`) that no other surface uses (verify before deleting).
- `package.json` — add `picomatch` (§5.2).

**Read-only contract (do NOT casually edit — Opus/secrecy-gated):** `scripts/build-atlas.ts` (identity
`:337`, atlas-key reads incl. legacy `:510-513`, visibility default `:345`), the secrecy pipeline
(`projectEntityForPlayer`, `filterEntitiesForLens`, `stripDmBlocks`), the scan scripts.

**Tests:** `src/test/import/mergeImportFrontmatter.test.ts` (new — the §9 matrix);
`import-staging-state.test.ts` / `build-import-changes.test.ts` (extend: identity precedence,
needsReview, collisions, commit-time baseHash); `player-preview-leak-regression.test.tsx` (extend:
re-import scenario + real-block strip); a vault-scan endpoint test (containment/traversal/symlink/
ignore-globs/size-cap/never-writes).

---

## 11. Decisions for spec review — RESOLVED (2026-06-16)

All four open questions were answered by the DM and folded in:

1. **Summary ownership** → **Obsidian wins** (D6, §3.3).
2. **Type ownership** → **two-way 3-way merge** — Obsidian flows in, atlas edits stick (D7, §3.6).
3. **ImportPanel** → **delete it**, removing the leftover Export Patch flow (D8, §10).
4. **Tags/aliases** → **union**; DM keeps spoilers out of tags (D9, §3.3).

Everything else (disk-base merge, explicit-visibility resolution, identity precedence, picomatch,
typed vault path, new config endpoints, deletions-as-non-goal, manual rename-link) is decided
engineering. **No open questions remain — the spec is ready for the implementation plan.**

---

## 12. Non-goals

- **Two-way sync / any write to the vault.** Read-only, full stop.
- **Vault deletions.** A removed/absent vault note **leaves its atlas entity untouched** (orphans are
  listed informationally, never auto-deleted). Surfacing/cleaning orphans is out of scope for v1.
- **Fuzzy rename detection.** v1 uses deterministic matching + a manual link control; no
  similarity heuristic.
- **A content-model migration** (atlas data out of frontmatter — brief Option C).
- **A live file-watcher / auto-rebuild on vault save** (the broader vault-as-source decision).
- **Large-vault streaming/pagination** (size-capped instead for v1).
- **Touching the build pipeline** beyond reading its identity/secrecy contract.
- **Usability by other DMs** (explicit roadmap non-goal).

---

## 13. Implementation sequencing (for the plan)

1. **Merge engine + secrecy core (no UI):** `mergeImportFrontmatter` (disk-base, explicit visibility,
   union+type-tag, top-level namespace, whole-profile) + `buildImportChanges` integration (commit-time
   baseHash, create-row dm default, exposure gate) + the full §9 test matrix + leak-regression
   extension. **Lands "never lose work" and "never auto-expose" provably, before any UI.**
2. **Identity hardening:** sync-map, precedence override of `resolvedId`, collision guard,
   manual rename-link, DM-build precondition + tests.
3. **Vault reader + ignore engine + config:** `/__atlas/vault-scan` (containment, size cap), picomatch
   `ignoreRules`, `.local-atlas` endpoints + settings, vault-path field + endpoint tests.
4. **The Sync panel UI:** rail item, one-button flow, "show ignored", disabled visibility dropdown,
   summary wording; **delete `ImportPanel`** (D8) and unmount it.
5. **Ship gate:** `atlas:publish:integrity-smoke` + `atlas:check-secrets` + `atlas:check-derived` green;
   full sharded test suite green.
