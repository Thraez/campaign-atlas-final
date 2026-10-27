# Strategy brief — Obsidian vault as live source

**Date:** 2026-05-28
**Status:** Brainstorm-only; no edits, no plan yet
**Recommended model:** Opus 4.7
**Recommended skill:** `/ce-strategy` or `/ce-brainstorm`
**Estimated session:** 60–120 minutes
**Depends on:** nothing
**Caution:** This is the highest-product-upside item in the backlog. Do NOT bundle with any other work. Do NOT skip directly to a plan after this session — the goal is a decision tree, not a roadmap.

## What we're deciding (plain language)

Today: the DM keeps notes in Obsidian, then runs an import to bring them into the atlas. Edits in the atlas don't flow back. There's a longstanding wish (`idea_vault_as_source.md`) to make the vault itself the live source — change the vault, change the world.

**The question for this session:** *What does "live" actually mean here? Is this realistic? What's the smallest version of it that's useful?*

Output is a decision tree with effort estimates per branch, not a roadmap.

## Why a brief, not a plan

This item has multiple plausible shapes, and the wrong one is much more expensive than no decision. The shapes:

- **(a) "Live" = watch the vault folder and rebuild on save.** Existing import pipeline runs on every file save. Atlas refreshes within a few seconds.
- **(b) "Live" = vault is the only source.** No more `world.yaml` master; the vault folder structure IS the world. World metadata moves into a designated note.
- **(c) "Live" = bidirectional sync.** Edits in the in-app editor flow back to `.md` files in the vault. The hardest variant; conflict resolution, locking, swap files.
- **(d) "Live dev / static publish".** Vault is the source for dev; player builds still snapshot to `public/atlas/atlas.json`. No runtime vault dependency in the player site.

The session's job is to pick which of (a)-(d) is the actual goal, and at what cost.

## What to read first

1. **The deferred idea memory:**
   - `idea_vault_as_source.md` — the original framing.

2. **Current import surface:**
   - `src/atlas/import/parseObsidian.ts`
   - `src/atlas/import/buildImportChanges.ts`
   - `src/atlas/import/mapImport.ts`
   - `src/atlas/import/inferType.ts`
   - `src/atlas/import/inferTypeFromTags.ts`
   - `docs/superpowers/plans/2026-05-16-import-folder-mapping.md` (the still-unverified 4-gap plan — relevant context)

3. **The save side (what would have to flow back if (c) is chosen):**
   - `src/atlas/save/canonicalEntitySave.ts`
   - `src/atlas/save/canonicalPlacementSave.ts`
   - `src/atlas/save/newEntitySave.ts`
   - `scripts/vite-plugin-atlas-save.ts`

4. **The build pipeline that today consumes the import output:**
   - `scripts/build-atlas.ts`
   - `README.md` sections "Build modes" and "Save workflow"

5. **Project memory:**
   - `user_role.md` — DM, not a developer; treat at UX/outcome level.
   - `feedback_sleek_ux.md` — sleek, hide internals.
   - `feedback_unified_save_completeness.md` — Save must do everything.

## Questions to bring to the brainstorm

1. **Definition of "live."** Pick (a), (b), (c), or (d) — or define a fifth option. Each has a different cost curve and a different risk profile.

2. **Source-of-truth ownership.** If the vault is live and the in-app editor also exists, which wins on conflict? What does "conflict" even mean — file timestamp? Last-saved-to-disk?

3. **Vault structure assumption.** Does this require the DM to follow a fixed folder/tag convention? If yes, that's a UX cost — Obsidian users style their vaults personally. Can the existing `inferType` heuristics carry the weight?

4. **What's the player-build impact?** Does this change `public/atlas/atlas.json` at all, or is "live" purely an editor-side concern? (Recommendation: the player atlas remains a built artifact — no runtime vault dependency in published worlds.)

5. **What's the minimum viable version?**
   The MVP shape is probably (d): file watcher in dev mode, vault-driven import on save, in-app editor remains the side that flows back. Validate or reject.

6. **What about the 4-gap import-folder-mapping work?**
   That's still UNVERIFIED per the prior `ACTIVE.md`. Closing it is a precondition — vault-as-source assumes import-folder-mapping works.

7. **Failure modes.** What happens during an Obsidian save-conflict? During a swap file present in the vault? During a corrupted YAML frontmatter? The watcher's behavior under each is a real UX decision.

## Expected output of the session

A document — write to `docs/superpowers/specs/2026-05-28-vault-as-source-decision-tree.md` — containing:

- **The chosen "live" definition** with reasoning.
- **A decision tree** showing branches considered and why eliminated.
- **Effort sketches** (S/M/L) per surviving branch.
- **Pre-requisites** (e.g., closing the import-folder-mapping 4-gap, deciding vault structure).
- **Explicit NOT-doing list** — what we are choosing to defer or never build.
- **Recommendation on next step**: either (i) a roadmap for the chosen branch, or (ii) "shelve again because the cost is still wrong."

## Non-goals

- Writing import or watcher code.
- Touching anything under `src/atlas/import/`.
- Promising a delivery timeline.

## Constraints

- This is the *first* session of a multi-phase initiative — Opus is the correct model per CLAUDE.md.
- The DM is the only user; respect their content workflow as it is, not as a developer would idealize it.
- The vault is the DM's primary writing surface; "live" must not introduce a risk of overwriting the vault from the atlas side without explicit consent.

## Why this is separate from the editor re-sequencing brief

The editor brief (`2026-05-28-editor-roadmap-restrategy-brief.md`) is about cleaning up an existing trajectory. This brief is about whether to pivot the whole product model. Bundling them would dilute both.
