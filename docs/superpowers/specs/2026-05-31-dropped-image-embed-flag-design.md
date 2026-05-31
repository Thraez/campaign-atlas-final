# Flag dropped image embeds in Publish Check — design

**Date:** 2026-05-31
**Status:** blessed → queued as WANT **E2** (`docs/automation/continuous-dev-queue.md`)
**Origin:** dogfooding item #7 ("Stop dropping inline portraits") in `docs/DEVELOPMENT_WANTS.md` — this spec
is the **"flag it" half** the inbox pre-blessed as a WANT (the placement table reads `render = design;
"flag only" = WANT`).
**Backs queue unit:** E2
**Confidence:** high — bounded check in an existing surface, no new UI, no schema change.

## The problem

Obsidian image embeds written as `![[Portrait.png]]` **silently vanish in the player view**, so a note that
looks fine to the DM (whose editor renders the embed) shows no image to players, with no warning anywhere.

Recon confirmed the mechanism (do not re-derive — but verify the files still match):
- The DM editor render path (`src/atlas/content/renderEntityMarkdown.ts`) **does** convert `![[image.ext]]`
  into a normal `<img>`, so the DM sees the picture.
- The **player projection path** (`src/atlas/content/projectEntityForPlayer.ts`) has **no equivalent embed
  conversion** — the raw `![[…]]` reaches `marked`, which drops/garbles it. The embed is effectively lost.

Actually *rendering* vault embeds in the player view is a larger, separate decision ("render = design") and
is **out of scope here**. This spec ships the cheap, safe half: **make the loss visible** so the DM can fix
it before publishing, by adding a Publish Check warning.

## The fix

Add one validation check in `src/atlas/yaml/validateProject.ts`, inside the existing per-entity loop,
alongside the other player-visibility checks (e.g. near `missing-summary` / `dm-block-in-player-body`).

For each **player-visible** entity (reuse the existing visibility guard the neighbouring checks use):
1. Scan the entity's player-safe `body` (the field that already has `%%…%%` DM blocks stripped — so embeds
   that live inside a DM block are correctly **not** flagged) for image-embed syntax:
   `/!\[\[([^[\]\n]+?)\]\]/g`, keeping only matches whose target has an image extension
   (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `avif` — case-insensitive).
2. For each such embed, push an `Issue`:
   - `code: "dropped-image-embed"`
   - `severity: "warning"`
   - `category:` reuse the existing category that groups content-completeness warnings (the one
     `missing-type` / `missing-summary` use — do **not** introduce a new category)
   - `message:` plain language, e.g. ``Image embed `![[Portrait.png]]` won't appear in the player view.``
   - `hint:` e.g. `Add the image through the editor's image field so it's published with the note.`
   - `scope: { entityId: e.id }`, and a `go-entity` action so the DM can jump straight to the note.

No changes to the `Issue` interface or the Publish Check UI are needed — `PublishCheckTab` already renders
any `Issue` with its severity, hint, and `go-entity` action.

> **Verify before editing:** confirm the exact category-string values and the visibility-guard helper in
> the current `validateProject.ts`; the surrounding checks are the template to copy.

## Testing

Extend `src/test/atlas-publish-check.test.ts`:
- A player-visible entity with `body: "![[Portrait.png]]"` produces an issue with
  `code === "dropped-image-embed"`.
- A player-visible entity with **no** embed produces no such issue.
- A **non-image** embed (e.g. `![[Some Note]]`, no image extension) does **not** trigger it.
- (Recommended) an embed that sits inside a `%%…%%` DM block is absent from the stripped player `body`, so
  it does **not** fire — proving we only warn about what players would actually be missing.

Full gate: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` green. This touches only the pure
`validateProject` logic (no build/scan pipeline), so the publish integrity-smoke is **not** required.

## Acceptance criteria

- Player-visible entities with image embeds raise a `dropped-image-embed` warning in Publish Check.
- No false positives on DM-only entities, non-image embeds, or embeds inside stripped DM blocks.
- No UI changes and no `Issue`-shape changes (reuses existing rendering).
- Full gate green.

## Out of scope

- Actually rendering `![[image]]` embeds in the player view (the "render = design" half) — a separate,
  bigger decision; do not build it here.
- The import-time attachment warning (already handled in `parseObsidian.ts`).
- Flagging non-image transclusions.
