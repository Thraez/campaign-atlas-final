# Spec — "What's new for players" counts distinct entities (not edit-records)

**Created:** 2026-06-14 · **Status:** blessed WANT (queue F2) · **Gate:** standard (DM-editor publish-summary
only — no build-pipeline touch, no player-projection/secrecy impact).

> Decided by the human 2026-06-14 (was a "handed back" item in `docs/automation/code-quality-log.md`):
> the summary should count **distinct entities**. Clears that handed-back item.

## Problem

The editor's "what's new for players" publish summary badge counts **change-records**, not distinct things.
If one entity is edited in two ways at once (e.g. its title *and* its body), the panel records two change
entries and the summary badge ("N entities changed") counts both — so one entity reads as "2 entities
changed." The neighbouring **maps** and **placements** counts tally records the same way, so they have the
same overstatement.

## Decision

The summary badges should count **distinct entities / maps / placements** (dedupe by underlying id), so each
number means "how many distinct things changed." Fix **all three** counts together so they stay consistent
(fixing only the entity count would make it disagree with the map/placement counts).

The detailed change **list** is unchanged — it still shows every individual change. Only the **summary
numbers** change.

## Root cause / where

- `src/atlas/publish/computeAtlasDiff.ts` — emits one record per change; the summary tally counts records.
  Adjust the summary to count distinct ids (entity id / map id / placement id) rather than record count.
- Trace where the badge/summary consumes the diff (the publish/build-report panel) to confirm it reads the
  summary counts, not `.length` of the record list.

## Files (expect)

- `src/atlas/publish/computeAtlasDiff.ts` — distinct-id counting for the summary.
- The consumer that renders the badge numbers (publish/build-report panel) — only if it derives counts
  itself instead of using the summary.
- `src/test/atlas-diff.test.ts` — extend.

## Done when

- An entity with both a title and a body change counts as **1** entity in the summary badge (a test asserts
  this); maps and placements likewise count distinct ids.
- The detailed change list is unchanged (still lists every change).
- Gate green (sharded vitest; tsc; eslint). ~1 run.
