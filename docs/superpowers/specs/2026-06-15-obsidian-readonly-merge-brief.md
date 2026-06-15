# Design brief — Obsidian round-trip: safe read-only re-import merge

**Date:** 2026-06-15
**Status:** Design-session brief; no edits, no plan yet
**Recommended model:** Opus 4.7
**Recommended skill:** `/ce-brainstorm` then `/ce-plan`
**Estimated session:** 60–120 minutes
**Depends on:** builds directly on `2026-05-28-vault-as-source-strategy-brief.md` — this is the safety-bounded subset that brief asked us to find.
**Caution:** This is the highest-product-upside item in the backlog. It touches the DM's own writing workflow and the player-secrecy invariants. Do NOT bundle with other work. Do NOT skip to code after this session — the goal is a merge-policy decision the human signs off on, then a plan.

## What we're deciding (plain language)

You write in Obsidian. You bring those notes into the atlas. Then, inside the
atlas editor, you do work the vault doesn't know about: you drop pins on maps,
style them, mark notes player-visible or DM-only, and wire up relationships
between places and people. That second layer of work is **atlas-only** — it
lives nowhere in your Obsidian vault.

Today, if you change a note in Obsidian and re-import it, the import treats it
as a fresh write of the whole file. The pins, visibility, and relationships you
added in the atlas can be **silently overwritten** by the older vault copy that
never had them. So in practice the import is "do it once and don't look back" —
which is the opposite of "Obsidian and the atlas, both first-class."

**The question for this session:** *How do we make re-importing a note SAFE —
so it picks up your new prose but never throws away the pins/visibility/
relationships you set in the atlas — while the app stays strictly read-only on
your vault (it never writes back to your `.md` files in Obsidian)?*

This is the slice the strategy brief landed on. Two-way sync — the app editing
your vault files — is explicitly **out of scope**. You decided against that.

## Why it matters for you

- **Both surfaces become first-class.** You keep writing where you write best
  (Obsidian) and keep arranging the world where that's best (the atlas map),
  and moving between them stops being a one-way trip.
- **No more "did I lose my pins?" anxiety.** The whole point is a provable
  "never lose your atlas work" guarantee. A re-import becomes boring and safe,
  so you'll actually use it.
- **Your vault is untouched.** Read-only means the app can never corrupt,
  reformat, or delete your Obsidian notes. The risk lives entirely on the atlas
  side, where we control the data and can test it.

## The crux: atlas-only edits live IN the same file as the prose

This is the technical fact that shapes every option, and it's worth stating
plainly because it's the whole problem.

There is **no separate sidecar store** for atlas data. When you place a pin or
set visibility, that gets written into the entity's `.md` frontmatter under an
`atlas:` block — `atlas.placements[]`, `atlas.visibility`, `atlas.relationships`,
`atlas.profile`, per-pin styling under `atlas.placements[].pin`. The build
pipeline reads exactly those keys (`scripts/build-atlas.ts:471` relationships,
`:472` profile, `:513` placements). So the file on disk is **both** your prose
home **and** your atlas-data home.

The vault copy of that same note does *not* have those `atlas.placements`/
`atlas.relationships` keys — you never typed them in Obsidian. Re-import today
calls `rewriteFrontmatter(row.rawContent, …)` on the *vault* text
(`buildImportChanges.ts:70`), which only patches `id`/`type`/`visibility`/`tags`
and writes the result over the on-disk entity file. **Everything else in the
`atlas:` block that isn't in the vault copy is dropped.** That's the silent data
loss we're designing against.

(The good news: the contributors who built placement-save already solved the
*shape* of this. `canonicalPlacementSave.ts:73 mergePlacementsIntoFrontmatter`
reads the current on-disk frontmatter, merges new placements in, and **preserves
placements on maps not being touched**. A safe re-import needs the same move,
generalized: read on-disk `atlas.*`, overlay vault prose, keep atlas-only keys.)

## The identity key — how do we know two notes are "the same note"?

Merge is only possible if we can reliably match an incoming vault note to the
existing atlas entity. Three candidate keys, with tradeoffs:

- **`atlas.id` in frontmatter (recommended primary).** Build derives identity as
  `parsed.atlas.id || slugify(title)` (`build-atlas.ts:337`). Staging already
  matches on this `resolvedId` (`stagingState.ts:199`). It's stable across
  renames and re-titling *if the DM has set it*. Weakness: most vault notes
  won't have an explicit `atlas.id` until they've been imported once.
- **Slug-of-title (the de-facto fallback).** What you get when `atlas.id` is
  absent. Zero DM effort, but **brittle**: rename the note or change the title
  and the slug changes, so a re-import looks like a brand-new entity and your
  atlas edits orphan. This is the main way "never lose work" could quietly fail.
- **Vault file path.** Stable-ish while you don't reorganize folders, but
  Obsidian users *do* reorganize, and `stagingState` deliberately refuses to
  trust the source path for routing (it's tooltip-only, by design, for security
  — `stagingState.ts:14`). Path as identity fights that invariant.

**Recommendation:** primary key = `atlas.id`; on first import, **stamp a stable
`atlas.id` into the entity we write to disk** so every subsequent re-import has a
durable anchor regardless of later renames in Obsidian. Use slug-of-title only
as a first-contact guess, and when the guess is ambiguous (a title-slug matches
an existing entity that has a *different* `atlas.id`), surface it for review
rather than auto-merging. The id stamp is the linchpin of the whole guarantee.

## Design options

### Option A — Field-level merge with a fixed conflict policy (recommended)

Re-import reads the **current on-disk** entity frontmatter, then merges:

- **Prose (the markdown body) → vault wins.** That's what you came to update.
- **Atlas-structure keys (`atlas.placements`, `atlas.visibility`,
  `atlas.relationships`, `atlas.profile`, pin styling) → atlas wins** and are
  preserved verbatim from disk. The vault copy almost never carries these, and
  when it doesn't, "atlas wins" just means "keep what's there."
- **Shared scalar frontmatter both sides can own (`summary`, `tags`,
  `aliases`)** → policy decision (see open questions); safest default is
  vault-wins on `summary`/body, union on `tags`.
- **True conflict** = the vault copy *also* sets an atlas-structure key to a
  different value than disk (rare, but possible if you edited frontmatter by
  hand in Obsidian). Only these go to a **staging review** row; everything else
  merges silently and safely.

Tradeoff: most predictable and the easiest to make provably safe with tests
(the merge is a pure function over two frontmatter objects). Slightly more code
than today: a real merge step instead of a whole-file overwrite. This is the
natural generalization of `mergePlacementsIntoFrontmatter` and reuses the
existing `baseHash` conflict-guard and `.atlas-backups/<ts>/` safety net on the
save endpoint.

### Option B — Staging-review-everything (manual diff per changed note)

Every re-import that touches an existing entity opens the staging modal showing
a before/after, and nothing is written until you approve each row. Maximum
control, zero silent anything.

Tradeoff: safe but **heavy** — it punishes the common case (you fixed a typo in
one paragraph) with a review gate, which is exactly the friction that makes you
not re-import. Violates the "sleek, hide internals" principle. Good as an
*escape hatch* for true conflicts (it already exists — `rowKind:
"path-collision"` defaults to off and requires opt-in), not as the default path.

### Option C — Two-store split (move atlas data out of the `.md`)

Stop storing `atlas.placements`/`relationships`/`visibility` in the entity
frontmatter; move them to a separate atlas-owned sidecar (e.g. a per-world
`placements.yaml` / overlay file) keyed by entity id. Then a re-import can
overwrite the prose file freely because the atlas data lives elsewhere and is
never in the import's blast radius.

Tradeoff: conceptually the cleanest "never lose work" story — the two
concerns physically can't collide. But it's a **migration of the whole content
model**: the build pipeline, every save path (`canonicalEntitySave`,
`canonicalPlacementSave`, `newEntitySave`), and `apply-placements.ts` all assume
atlas data lives in frontmatter today. High cost, high blast radius, and it
touches the build pipeline (Opus-gated, secrecy-sensitive). Out of proportion to
the slice we agreed on.

**Recommendation: Option A**, with Option B's modal reused *only* as the
true-conflict escape hatch. It delivers the safety guarantee, reuses the merge
pattern the codebase already proved, keeps the common case one-click, and avoids
a content-model migration. Revisit C only if hand-edited atlas frontmatter in
Obsidian turns out to be common (it shouldn't be — you set those in the editor).

## Risks — especially vault safety and player-secrecy

- **Atlas-side data loss is THE risk.** Read-only-on-vault removes the scary
  half (your Obsidian files are never written), but a re-import that drops
  `atlas.placements`/`visibility`/`relationships` is silent and only noticed
  later, when a pin is gone or a DM-only note has gone player-visible. The merge
  must be a pure, unit-tested function with an explicit "preserve atlas-only
  keys" contract — round-trip tests that import → add atlas data → re-import the
  same note → assert every atlas key survives byte-for-byte.
- **Player-secrecy regression — the sharp edge.** Visibility lives in the same
  `atlas:` block we're merging. If a vault note has no `visibility` and the
  importer re-defaults it, a note you'd set to `dm` in the atlas could silently
  flip to the parser's default (note the asymmetry: `parseObsidian.ts:180`
  defaults missing visibility to `dm` (safe), but treats `atlas.publish: true`
  as `player`). **Invariant for the merge: never *downgrade* secrecy on
  re-import.** If disk says `dm`/`hidden` and the vault copy is silent or less
  restrictive, disk wins. Any visibility change toward *more* exposure must be a
  reviewed conflict, never silent. After any design here, the player build must
  still pass `npm run atlas:check-secrets` / `check-derived` — re-import must not
  become a backdoor that leaks `%%..%%` / `:::dm..:::` / `visibility: dm`
  content into a player build.
- **Identity drift = orphaned work.** If matching falls back to slug-of-title
  and you renamed the note in Obsidian, the re-import creates a *new* entity and
  your atlas edits stay stranded on the old one — "never lost," but disconnected,
  which feels the same to you. The `atlas.id` stamp-on-first-import mitigation is
  load-bearing; the session must decide it explicitly.
- **Read endpoint scope.** Merge requires reading current on-disk content; that
  path already exists and is allowlisted (`/__atlas/read`, gated by
  `isWritableSourcePath` / `sourcePathAllowlist.ts`). No new write surface to the
  vault is introduced — keep it that way.

## Surfaces / files this would touch (verified against real code)

Import pipeline (the merge lands here):
- `src/atlas/import/buildImportChanges.ts` — today's overwrite (`:70`
  `rewriteFrontmatter(row.rawContent…)`); becomes the merge entry point.
- `src/atlas/import/stagingState.ts` — identity matching (`resolvedId`, `:199`)
  and `rowKind` (`create`/`update`/`path-collision`); add a `conflict` kind.
- `src/atlas/import/useMdImportFlow.ts` — orchestration + the
  `ConflictError`/`baseHash` flow that the merge must keep honoring.
- `src/atlas/import/parseObsidian.ts` — visibility defaulting (`:180`) and id
  derivation (`:209`); the secrecy-asymmetry to respect.
- `src/atlas/import/inferType.ts` — type/identity inference inputs.
- `src/atlas/import/summarizeImport.ts` — add a "merged / preserved" outcome so
  the toast tells you atlas data was kept.

Merge logic to generalize / reuse:
- `src/atlas/save/canonicalPlacementSave.ts` — `mergePlacementsIntoFrontmatter`
  (`:73`) is the proven "preserve untouched atlas keys" pattern to build on.
- `src/atlas/content/frontmatterRewrite.ts` — `rewriteFrontmatter` (`:17`); the
  merge either extends this or sits beside it.
- `src/atlas/save/localFsSave.ts` — `baseHash` conflict guard + backups; the
  safety net the merge rides on (do not bypass).
- `src/atlas/save/sourcePathAllowlist.ts` — read/write allowlist; unchanged,
  must stay the boundary.

Build / secrecy contract (read-only context for this design; do NOT casually
edit — Opus-gated):
- `scripts/build-atlas.ts:337/471/513` — id derivation + where atlas data is read.
- `src/atlas/save/canonicalPlacementSave.ts:12` (doc-comment) — the original
  frontmatter merge rules documented there (`apply-placements.ts` no longer exists
  as a separate script; the rules now live in `mergePlacementsIntoFrontmatter`).
- **Gate (required before shipping):** `npm run atlas:publish:integrity-smoke`
  then `npm run atlas:publish` — both must pass clean.
- `npm run atlas:check-secrets` / `atlas:check-derived` — the player-secrecy
  gate the output must still pass.

Secrecy pipeline (the implementation must not bypass these — reuse, don't reinvent):
- `src/atlas/content/projectEntityForPlayer.ts` — entity-level DM-field scrub;
  any entity the merge produces must still pass through this on the player path.
- `src/atlas/view/filterEntitiesForLens.ts` — lens-level visibility filter.
- `src/atlas/content/stripDmBlocks.ts` — body-level `%%...%%` / `:::dm:::` removal.
- `src/atlas/entity/EntityReadingView.tsx` (`hideBroken`) — broken-link hiding.
- `src/test/content/projectEntityForPlayer.test.ts` +
  `src/test/entity/player-preview-leak-regression.test.tsx` — extend the
  leak-regression suite with a re-import scenario: entity starts player-visible,
  gets re-imported from a vault copy that has no visibility key, assert it stays
  player-visible and no DM content escapes.

Tests (where the "never lose work" guarantee gets proven):
- `src/test/build-import-changes.test.ts`, `src/test/import-staging-state.test.ts`
  — extend with round-trip "preserve atlas-only keys" + "never downgrade
  secrecy" cases.

## Open questions for the human

1. **Identity key.** Confirm `atlas.id` as primary + **stamp-on-first-import**.
   Accept slug-of-title only as a first-contact guess? What's the UX when a
   title-slug guess collides with a *different* existing `atlas.id` — auto-skip,
   or force a review row?
2. **Conflict policy for shared scalars.** Body/prose = vault-wins is settled.
   But `summary`, `tags`, `aliases`: vault-wins, atlas-wins, or union? (Proposed:
   vault-wins on `summary`, union on `tags`/`aliases` — confirm.)
3. **What counts as a "true conflict" worth a review gate?** Proposed: only when
   the vault copy sets an `atlas.*` *structure* key to a value different from
   disk. Everything else merges silently. Agree, or wider?
4. **Secrecy direction rule.** Ratify "never downgrade visibility silently on
   re-import; any move toward more exposure is a reviewed conflict." Is there any
   case where you'd *want* the vault to re-open a note to players automatically?
5. **Provability bar.** Is a passing round-trip test suite (import → add
   placements/visibility/relationships → re-import → assert preserved) enough to
   call the "never lose work" guarantee met, plus a green `check-secrets` run?
6. **Where does the merge live** — extend `rewriteFrontmatter`, or a new
   `mergeImportFrontmatter` beside it that composes the existing placement-merge?
   (Affects how much existing test surface we reuse.)

## Non-goals

- The app writing back to your Obsidian vault (two-way sync). Decided against;
  this brief assumes read-only on the vault, full stop.
- A content-model migration (Option C / atlas data out of frontmatter) — unless
  Q3 surfaces that hand-edited atlas frontmatter in Obsidian is actually common.
- A vault file-watcher / "live" rebuild — that's the broader vault-as-source
  decision tree from the 2026-05-28 brief, deferred separately.
- Touching the build pipeline beyond reading its identity/secrecy contract.

## Why this is separate from the 2026-05-28 strategy brief

That brief asked "what does 'live' mean, and what's the smallest useful
version?" and pointed at file-watchers and bidirectional sync as the expensive
branches. This brief **is the answer to its "smallest useful version" question**:
a re-runnable, read-only, merge-safe re-import. It does not re-litigate whether
to go live; it builds the one safe step everyone already agreed on.
