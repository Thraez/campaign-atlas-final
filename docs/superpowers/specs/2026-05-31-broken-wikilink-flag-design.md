# Flag broken wikilinks in Publish Check — design

**Date:** 2026-05-31
**Status:** blessed (human-requested during the E1 merge session) → queued as WANT **E6**
(`docs/automation/continuous-dev-queue.md`)
**Origin:** INBOX item "Planned/broken wikilinks render as dead text → surface in Publish Check"
(`docs/automation/continuous-dev-queue.md`, INBOX section).
**Sibling spec:** `2026-05-31-dropped-image-embed-flag-design.md` (E2) — same surface, same "flag it, don't
fix the renderer" half. Read that first; this spec mirrors it.
**Confidence:** high — reuses pre-computed data, no schema change, no UI change, mirrors an existing check.

## The problem

An Obsidian wikilink whose target doesn't resolve — `[[Ghost Town]]`, `[[folder/Unwritten Note]]`,
`[[Note#Heading]]` — renders to **players as dead, non-clickable text** (a `<span class="atlas-unresolved">`,
see `src/atlas/content/parseWikilinks.ts:40-61`). The DM never notices: their editor renders every wikilink
as a styled span regardless of whether it resolves (`renderEntityMarkdown.ts:29-34`). So a note that reads
fine to the DM shows players a sentence with a broken-looking dead phrase, and nothing warns the DM before
they publish.

The build already *knows* which links are broken — it computes resolution per entity and stores the verdict
— but it deliberately stays silent: `scripts/build-atlas.ts:554-556` counts unresolved links as "normal,
not created yet" and does not warn. That silence is right for the build (many broken links are intentional
WIP placeholders), but it means **the one place a DM does a pre-publish review — the Publish Check — says
nothing about links their players will see as dead text.**

This spec ships the cheap, safe half: **make the dead text visible to the DM in Publish Check**, as a
low-key *suggestion* (not a nagging warning). Actually changing how broken links render in the player view
is a separate, larger decision and is **out of scope**.

## Why this is safe and small (recon — verify before editing)

`entity.links` is already a `ResolvedLink[]` with the resolution verdict pre-computed
(`src/atlas/content/schema.ts:139-144`):
```ts
export interface ResolvedLink {
  target: string;       // raw target text from [[...]]
  resolvedId?: string;  // resolved entity id when known
  display: string;      // alias or target
  broken: boolean;      // true when resolvedId is undefined
}
```
So the check needs **no regex and no body scan** — it iterates `e.links` and filters `link.broken === true`,
exactly the way the existing `wikilink-to-dm` check iterates `e.links` (`validateProject.ts:325-338`). It
reuses the build's own resolution verdict, so it introduces **no new false-positive surface**: if the build
says a link is broken, the player is seeing dead text for it — full stop.

## The fix

Add one check in `src/atlas/yaml/validateProject.ts`, inside the existing per-entity loop
(`for (const e of project.entities)`, ~line 278), immediately **after** the `wikilink-to-dm` block
(~line 339) so the two link checks sit together.

For each **player-visible** entity (reuse the existing guard `playerVisibleVis.has(e.visibility)` —
`playerVisibleVis` is defined at `validateProject.ts:71` as `new Set(["player", "rumor"])`):

1. Collect that entity's broken links: `const broken = (e.links ?? []).filter((l) => l.broken);`
2. If `broken.length === 0`, emit nothing.
3. Otherwise emit **one aggregated `Issue` per entity** (not one per link — keep Publish Check sleek):
   - `severity: "suggestion"` — deliberately the lowest actionable level. Many broken links are intentional
     "I'll write that note later" placeholders; a `warning` would nag. A `suggestion` surfaces them for a
     pre-publish glance without crying wolf. (This is the one real design call in this spec; it is
     **pinned** here — do not promote it to `warning`.)
   - `code: "broken-wikilink"`
   - `category: "yaml"` — the content-completeness bucket (same as `missing-type` / `missing-summary`).
     **Not** `"safety"`: a broken link leaks no DM content, so it is not a safety concern (unlike
     `wikilink-to-dm`, which is). Verify the live `IssueCategory` union before editing
     (`validateProject.ts:14`).
   - `message:` plain language listing the dead targets, e.g.
     ``Players will see dead text for 2 broken links in "Riverbend": [[Ghost Town]], [[Old Mill]].``
     Build the target list from `broken.map((l) => `[[${l.target}]]`)`; cap the inline list at ~3 and append
     `…and N more` if longer, so the message stays short.
   - `hint:` e.g. `Create the linked note, fix the spelling, or remove the link so players don't see dead text.`
   - `scope: { entityId: e.id }` plus a `go-entity` action (`{ kind: "go-entity", label: "Open note",
     payload: e.id }`) so the DM jumps straight to the note. Match the exact `IssueAction` shape at
     `validateProject.ts:16-20`.

No change to the `Issue` interface and no change to `PublishCheckTab` — it already renders any `Issue` with
its severity, hint, and `go-entity` action.

> **Verify before editing:** confirm the live `IssueCategory` values, the `IssueAction.kind` union, and that
> `playerVisibleVis` / the `wikilink-to-dm` block are still where cited. The surrounding checks are the
> template to copy.

## A known, intentional inclusion (not a bug)

The build's tokenizer does **not** strip `#heading` anchors before resolving (`parseWikilinks.ts:3` passes
the full `Note#Heading` string to `resolveByName`), so `[[Note#Heading]]` is marked `broken` even when
`Note` exists — and it **does** render as dead text to players today. Flagging it is therefore **correct**:
the check reports what players actually see. Improving the resolver to honour `#heading` anchors is a
separate change and is **out of scope** here.

## Testing

Extend `src/test/atlas-publish-check.test.ts` (follow the `wikilink-to-dm` test at lines 40-49 — same
`entity({ links: [...] })` construction):

- A player-visible entity with a broken link
  (`links: [{ target: "Ghost Town", resolvedId: undefined, display: "Ghost Town", broken: true }]`)
  produces an issue with `code === "broken-wikilink"` and `severity === "suggestion"`.
- A player-visible entity whose links all resolve (`broken: false`) produces **no** such issue.
- A **DM-only** entity (`visibility: "dm"`) with a broken link produces **no** issue (players never see it).
- An entity with **multiple** broken links produces **exactly one** aggregated issue whose message names the
  targets (assert the count is 1, not N).

Full gate: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` green. This touches only the pure
`validateProject` logic (no build/scan pipeline), so the publish integrity-smoke is **not** required.

## Acceptance criteria

- Player-visible entities with broken wikilinks raise a single `broken-wikilink` **suggestion** per entity
  in Publish Check, naming the dead targets, with a `go-entity` action.
- No issue for DM-only entities, for entities whose links all resolve, and no second issue when an entity
  has several broken links (aggregated, not per-link).
- No `Issue`-shape change and no Publish Check UI change.
- Full gate green.

## Out of scope

- Changing how broken wikilinks render in the player view (still dead text — a separate, bigger decision).
- Fixing `#heading`-anchor resolution in the tokenizer (a resolver change, tracked separately).
- Surfacing the build-level `buildReport.brokenLinks` count anywhere new (it already feeds the
  `passedChecks` "No broken wikilinks in build" line at `validateProject.ts:470`).
- Folding wikilink rendering into the markdown-parity work (item C) — unrelated to this flag.
