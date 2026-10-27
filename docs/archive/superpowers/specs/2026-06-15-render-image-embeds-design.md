# Spec — Render inline image embeds (`![[image.png]]`)

**Created:** 2026-06-15 · **Status:** blessed NICE-TO-HAVE (queue N25) · **Gate:** build-pipeline
(embed conversion ships into `entity.bodyHtml` in `atlas.json` → gate requires
`npm run atlas:publish:integrity-smoke` AND `npm run atlas:publish` green).
**Security-relevant** — embeds inside stripped `%%…%%` or `:::dm…:::` blocks must be absent from
player output — a secrecy regression test is mandatory.

> This is the "render it" half of the dropped-image-embed work. The "flag it" half shipped as **E2**
> (queue unit, spec `docs/superpowers/specs/2026-05-31-dropped-image-embed-flag-design.md`). That
> spec confirmed the mechanism — do not re-derive it; verify the files still match before editing.

## Problem

`![[Portrait.png]]` Obsidian image embeds **silently produce no image in the player view**. The DM
editor (`renderEntityMarkdown`) converts them client-side to `<img>` tags before passing text to
`marked`, so the DM sees portraits. The player viewer and the published player `atlas.json` do not:
`projectEntityForPlayer` and `build-atlas.ts` call `markdownToHtml(tokenized)` directly, with no
prior embed-conversion pass, so `marked` receives the raw `![[…]]` syntax and drops it.

## Key finding (verified 2026-06-15 — confirm still matches before editing)

- **DM editor render path** (`src/atlas/content/renderEntityMarkdown.ts`): applies `EMBED_RE =
  /!\[\[([^[\]\n]+?)\]\]/g` → `![name](resolveAsset(name))` BEFORE calling
  `renderMarkdownBodyToSafeHtml`. Default `resolveAsset` maps to `/atlas/assets/images/{name}`.
  The `stripDmBlocks` call runs before embed replacement (line 16 of `renderEntityMarkdown`), so
  embeds inside DM blocks are never converted — the body they live in is stripped first.

- **Player path (client)** (`src/atlas/content/projectEntityForPlayer.ts`): strips DM blocks (step
  1), then calls `markdownToHtml(tokenized)` directly at step 4 — **no embed conversion**. The
  `![[…]]` syntax reaches `marked` and is dropped.

- **Player path (build)** (`scripts/build-atlas.ts`, ~line 562): same gap — `markdownToHtml(tokenized)`
  is called directly with no embed pre-pass. `entity.bodyHtml` in the published `atlas.json` therefore
  contains no `<img>` for inline embeds.

- **Sanitizer** (`src/atlas/sanitizeHtml.ts`): `img`, `src`, `alt`, `width`, `height`, and `loading`
  are already in `ALLOWED_TAGS` / `ALLOWED_ATTR`. No sanitizer change is needed.

- **Asset pipeline**: `entity.images` (declared in frontmatter) are already copied to
  `public/atlas/assets/images/` by the build and verified by `audit-assets`. This spec does NOT
  build a new vault-image → atlas-asset import pipeline. It renders only embeds whose image files
  are **already present** at the resolved path. An embed pointing to a missing file will produce a
  broken `<img>` (the existing Publish Check `dropped-image-embed` warning from E2 covers this case).

## Goal

`![[Portrait.png]]` in a player-visible entity body renders as an `<img>` in both the player viewer
and the published player `atlas.json`, using the same URL convention already in use
(`/atlas/assets/images/{name}`). DM-block stripping continues to happen before embed conversion so
embeds inside `%%…%%` blocks are never rendered for players.

## Approach

Extract the embed-conversion pre-pass from `renderEntityMarkdown.ts` into a shared pure helper and
thread it into the two gaps.

**Part 1 — shared helper in `renderEntityMarkdown.ts`.**
Export a new pure function `resolveImageEmbeds(md: string, resolveAsset: (name: string) => string): string`
that applies the existing `EMBED_RE` replacement. `renderEntityMarkdown` calls it (same behavior as
today, no regression). The helper is importable by the build and by `projectEntityForPlayer`.

**Part 2 — wire into `projectEntityForPlayer`.**
After step 1 (`stripDmBlocks`) and before step 2 (`tokenizeWikilinks`), apply
`resolveImageEmbeds(body, defaultResolveAsset)` where `defaultResolveAsset` maps to
`/atlas/assets/images/{name}` (same default as `renderEntityMarkdown`). The `ProjectionContext`
does not need to carry a custom `resolveAsset` — the build and the client agree on this path.

**Part 3 — wire into `build-atlas.ts`.**
The build processes entity body markdown starting at `noDm` (the DM-stripped body). Add the same
`resolveImageEmbeds(noDm, defaultResolveAsset)` call before the `tokenizeWikilinks` pass. The
resulting `entity.bodyHtml` in the player `atlas.json` will then contain `<img>` tags, and the
`img` tag already survives `sanitizeAtlasHtml`.

**Autonomy guard — do NOT expand into asset-import architecture.**
This spec renders embeds for images that are **already in the atlas asset path**. If wiring the helper
into the build pipeline requires building a new vault-image-copy pipeline (vault `![[]]` → copy file
→ `public/atlas/assets/images/`), that is a separate, larger decision. Ship the render change only;
the Publish Check warning from E2 already flags embeds whose files are absent, so missing files
degrade gracefully to a broken image tag (no crash, no new DM leak). Do not invent asset-import
logic to repair that. Hand back if the pipeline expansion becomes load-bearing for this change.

## Secrecy edge cases (mandatory — name these explicitly)

| Case | Expected behaviour | How it is enforced |
|---|---|---|
| Embed inside `%%…%%` DM block | Absent from player body and `bodyHtml` | `stripDmBlocks` runs before `resolveImageEmbeds` in both paths |
| Embed inside `:::dm…:::` block | Same | `stripDmBlocks` handles both syntaxes |
| Embed in a `visibility: dm` entity | Entity excluded from player build entirely | `filterEntitiesForLens` / build's `secretEntityIds` — unchanged |
| `resolveAsset` URL in player `atlas.json` | Image path only (`/atlas/assets/images/name`), not the DM source vault path | Default resolver is hard-coded; vault path never enters the output |

**Mandatory secrecy regression test:** a player-visible entity whose body is
`"%%\n![[secret.png]]\n%%\n\nPublic text."` must, after `projectEntityForPlayer`, have a
`bodyHtml` that contains no `<img>` and no `secret.png`. This proves that DM-block stripping
precedes embed conversion. Also verify that `"![[public.png]]\n\nPublic text."` (no DM block)
produces an `<img src="…/public.png"` in `bodyHtml`.

## Files

- `src/atlas/content/renderEntityMarkdown.ts` — extract embed pre-pass into exported
  `resolveImageEmbeds(md, resolveAsset)` helper; `renderEntityMarkdown` continues to call it (no
  behavior change).
- `src/atlas/content/projectEntityForPlayer.ts` — import `resolveImageEmbeds`; apply it to `body`
  after `stripDmBlocks`, before `tokenizeWikilinks`.
- `scripts/build-atlas.ts` — import `resolveImageEmbeds`; apply it to `noDm` before the
  `tokenizeWikilinks` pass in the entity rendering loop.
- `src/test/content/renderEntityMarkdown.test.ts` — the mandatory secrecy regression test (embed
  in `%%` block absent from player output) + a positive render test (bare embed → `<img>` in player
  `projectEntityForPlayer` output).
- `src/test/content/projectEntityForPlayer.test.ts` (or nearest equivalent) — extend with the same
  two assertions at the `projectEntityForPlayer` level to lock the player-path contract.

## Done when

- `![[Portrait.png]]` in a player-visible entity body produces `<img src="/atlas/assets/images/Portrait.png"`
  in the rendered player view (via `projectEntityForPlayer`) AND in the published player `atlas.json`
  `entity.bodyHtml` (via the build).
- An embed inside a `%%…%%` block is **absent** from player output — the mandatory secrecy regression
  test proves this.
- DM editor render (via `renderEntityMarkdown`) is unchanged — existing tests still pass.
- `img` already allowed in `sanitizeAtlasHtml`; no sanitizer change needed or made.
- No new vault-image-copy pipeline introduced (autonomy guard respected).
- Gate green: TypeScript clean, ESLint clean, all tests green (sharded vitest),
  `npm run atlas:publish:integrity-smoke` green, `npm run atlas:publish` green. ~1–2 runs.
