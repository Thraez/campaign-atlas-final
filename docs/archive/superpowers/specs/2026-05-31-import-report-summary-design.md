# Clearer import report — post-import summary — design

**Date:** 2026-05-31
**Status:** blessed → queued as WANT **E4** (`docs/automation/continuous-dev-queue.md`)
**Origin:** dogfooding inbox "Clearer import report" (Tier 4 / N4) in `docs/DEVELOPMENT_WANTS.md`
**Backs queue unit:** E4
**Confidence:** medium — bounded and low-risk, but the exact presentation is a UX taste call; easy to
adjust. Built to the DM's stated preference for **sleek, minimal, one-touch** flows (no extra mandatory
click).

## The problem

After a vault import, the only feedback is a single toast — *"Imported N file(s) and rebuilt the atlas."*
The DM can't see **what** actually came in versus what was skipped or couldn't be read. If three of eight
notes were quietly skipped (left unchecked, a path collision, or a parse error), the count alone hides it.

Recon (verify it still matches): all per-row outcome data is already present on the `StagingRow[]` array in
`src/atlas/import/useMdImportFlow.ts` at the success point (~the `toast.success` call); the save call
returns only an aggregate `{ saved, rebuilt, rebuildError }`, but the breakdown is fully derivable from the
staged rows. No new data fetching is required.

## The fix — an enriched, plain-language result summary (no new blocking step)

Keep the existing single-toast flow (sleekest; matches the rest of the app). After a successful commit,
compute a breakdown from the staged rows and show it as the toast's structured **description**, so one
glance tells the DM what happened. Do **not** add a mandatory modal result step.

Add a pure helper, e.g. `summarizeImport(rows: StagingRow[]): ImportSummary`, that buckets rows into
plain-language outcomes (collapse the internal categories into terms a DM understands):

| Plain label | Derived from |
|---|---|
| **Added** | `rowKind === "create"` and included |
| **Updated** | `rowKind === "update"` and included |
| **Replaced** | `rowKind === "path-collision"` and included (overwrote an existing file; backup kept) |
| **Skipped** | included `=== false` (DM unchecked it, or an unconfirmed path collision) |
| **Couldn't be read** | `parseError` present, or outside the allowlist (`pathAllowed === false`) |

Then render the toast like:
- Title: `Imported {saved} note(s)` (keep the existing rebuilt/rebuild-failed handling untouched).
- Description: a compact line, only mentioning non-zero buckets, e.g.
  `3 added · 1 updated · 1 replaced · 2 skipped`.
- If any note **couldn't be read**, surface that distinctly (amber/warning tone, longer duration) so it's
  not lost — e.g. `1 couldn't be read — check the source file.`

Copy stays plain (name things by what they do for the DM; no internal terms like "path-collision" or
"rowKind"). Preserve every existing failure/conflict toast exactly as-is.

> **Verify before building:** confirm the current `StagingRow` field names (`rowKind`, `included`,
> `parseError`, `pathAllowed`) and the exact insertion point in `useMdImportFlow.ts`; reuse the rows already
> in scope.

## Testing

Unit-test `summarizeImport` against a mixed `StagingRow[]` covering every bucket (added / updated / replaced
/ skipped-unchecked / parse-error / outside-allowlist) and assert the counts and the non-zero-only label
list. Toast rendering itself does not need heavy testing — the logic is in the pure helper.

Full gate: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` green. DM-only, additive — no build/scan
pipeline impact.

## Acceptance criteria

- After an import, the DM sees a plain-language breakdown (added / updated / replaced / skipped, and a
  distinct "couldn't be read" line when relevant) without any extra required click.
- Counts match the staged rows; only non-zero buckets are shown.
- Existing success / rebuild-failure / conflict toasts are unchanged.
- Full gate green.

## Out of scope

- A dedicated modal result screen or an import "history" view.
- Changing what the import actually does (routing, conflict handling, rebuild).
- Per-file expandable detail — the one-line summary is the deliverable; richer detail can be a later want
  if the DM asks for it.
