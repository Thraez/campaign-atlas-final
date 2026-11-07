# R-04 Adopt the rebuild goals

Status: ready-for-human
Blocked by: none

Isak approved option B on 2026-11-07: rebuild the editor and the map model (schema v2) in this repo behind `__INCLUDE_EDITOR__`, keeping the pipeline, scans, Sync and tests. This ticket makes the docs say so. Docs only; no code.

## What was done

- `docs/GOALS.md` replaced by the agreed rebuild goals (ocean, map tree, campaigns, story, editor, fog, travel, notes, safety, Sync, publish, images). Wording is "agreed", links resolve from `docs/`, Cloudflare Access with an email PIN replaces the open question. Where it says an ADR-0001 addendum is needed, that stays for R-02.
- `docs/adr/0002-rebuild-editor-and-map-model.md`: option B, what stays / is rebuilt / is thrown away, the editor-parity cutover rule, private hosting before the first real Sync, options rejected, consequences.
- Contradicting docs rewritten minimally:
  - `docs/NON_GOALS.md`: "multiple view profiles" and "no unified spatial canvas" no longer hold (campaigns, ocean); per-player fog stays a non-goal; "one (or a few) worlds" now "one or several worlds on one ocean".
  - `docs/PRODUCT_SPEC.md`: "one DM per world" / "one DM running one world".
  - `docs/KNOWN_LIMITATIONS.md`: "player site fully public" is now "for now"; private link mode is planned per campaign; "one map at a time" and "no multi-map composite canvas" are now "today only", replaced by the ocean and map tree.
- Left alone: `GLOSSARY.md` (new words go in when the tickets that build them land), `README.md` (no contradicting sentence; its repo-privacy advice agrees), `docs/CODEBASE_MAP.md` (describes today's code, which stays true until built), `State.md`, tracker issues, `docs/archive/`, `docs/decisions.md`.

## Acceptance criteria

- [x] `docs/GOALS.md` has no "proposed" or draft wording and its links resolve.
- [x] ADR-0002 stands on its own without the rebuild branch.
- [x] No doc outside the closed or archived ones still says there is one world, one map at a time, no unified canvas, or no per-campaign views.
- [ ] Full gate and review (coordinator).
