# AstrathDeeprealm Atlas — Foundation (Batch 1)

Pivot the project toward an Obsidian-markdown-as-source-of-truth architecture. This first batch implements only the content pipeline and schema — no map editor changes yet.

## Scope (user stories)

- US-0001 Atlas data schema (entities + placements separated)
- US-0101 Parse Obsidian `.md` files into entities
- US-0102 Atlas frontmatter (`atlas.publish`, `type`, `visibility`, `aliases`, `images`, `summary`, `world`)
- US-0103 Wikilinks `[[Name]]` and `[[Name|Display]]`, alias resolution
- US-0104 Generate `public/atlas/atlas.json` (+ basic search index)
- US-1502 Sample content (one world, a few entries, hidden/DM examples)
- US-1503 README documentation for content format

Explicitly out of scope this round: visual editor, globe, AI features, GitHub Action, player-safe build mode (Batch 3), map rendering changes.

## Deliverables

```text
content/                          # Obsidian-style source vault (sample)
  astrath-deeprealm/
    settlements/Thornhold.md
    settlements/Sunhaven.md
    regions/Ravens-Vale.md
    ruins/The-Old-Keep.md
    dungeons/Deeproot-Cavern.md   # visibility: dm (excluded)
    _drafts/Wip-Note.md            # excluded by folder rule

scripts/
  build-atlas.ts                  # node/tsx build script
  atlas/
    parseFrontmatter.ts
    parseWikilinks.ts
    stripDmBlocks.ts
    slugify.ts
    validate.ts

src/atlas/content/
  schema.ts                       # new schema types (Entity, MapPlacement, etc.)
  loader.ts                       # runtime loader for /atlas/atlas.json

public/atlas/
  atlas.json                      # generated
  search-index.json               # generated

atlas.config.json                  # included/excluded folders, default world
README.md                          # updated with content format docs
```

## New schema (TypeScript)

Separate from existing `src/atlas/types.ts` (kept untouched so the current map app keeps working). New file `src/atlas/content/schema.ts`:

- `AtlasProject { version, publishedAt, worlds[], entities[], placements[], assets[] }`
- `World { id, name, defaultMapId? }`
- `MapDocument { id, worldId, name, width, height, layers[] }`
- `MapLayer { id, src, x, y, width, height, opacity, zIndex, rotation? }`
- `Entity { id (slug), title, type, world?, visibility, aliases[], summary?, body (markdown), bodyHtml?, tags[], images[], frontmatter, sourcePath, links[] (resolved wikilinks), backlinks[] }`
- `MapPlacement { id, entityId, mapId, x, y, icon?, label?, visibility }`
- `AssetRef { id, src, type }`

IDs are stable slugs derived from filename (overridable via `atlas.id` frontmatter).

## Frontmatter contract

```yaml
---
atlas:
  publish: true
  type: settlement
  world: astrath-deeprealm
  visibility: player        # player | dm | hidden | rumor
  aliases: [Thorn Hold]
  images: [assets/images/thornhold.webp]
  summary: A red-stone mining city.
---
```

Validation: unknown visibility / missing title / duplicate slug / broken wikilink → warning logged, build continues (errors only on fatal IO).

## Wikilink parser

- Regex over markdown body, replaces `[[Target]]` and `[[Target|Display]]` with internal link tokens.
- Resolves Target against title (case-insensitive) then aliases.
- Records resolved links on entity for future backlinks.
- Unresolved links emit a warning and render as `<span class="broken-link">Display</span>` in `bodyHtml`.

## DM block stripping

`%% ... %%` blocks (single + multi-line) removed before HTML conversion. Counter logged. (Used now for parsing correctness; player-safe filtering itself lands in Batch 3.)

## Build script

`scripts/build-atlas.ts`, run via `npx tsx`. Reads `atlas.config.json`, walks `content/` (excluding `_drafts`, `_dm`, `archive`), parses each `.md` with `gray-matter`, runs wikilink + DM-strip, converts to HTML via `marked`, writes:

- `public/atlas/atlas.json` — full project (sample placements seeded from existing default pins so the current map keeps showing markers).
- `public/atlas/search-index.json` — `[{id,title,type,aliases,tags,summary,excerpt}]`.

Build report printed to stdout: counts of files scanned, included, excluded, warnings, broken links, duplicate slugs, stripped DM blocks.

Add `npm` script: `"atlas:build": "tsx scripts/build-atlas.ts"`.

## Runtime loader (minimal, non-disruptive)

`src/atlas/content/loader.ts` exposes `loadAtlasContent()` that fetches `/atlas/atlas.json`. Not wired into the existing UI in this batch — just available so Batch 2 can render entries. Existing map/store stays as-is.

## Dependencies to add

- `gray-matter` (frontmatter)
- `marked` (markdown → HTML)
- `tsx` (run TS build script)

## README additions

New section "Content format" covering: folder layout, frontmatter fields, wikilinks, DM blocks, how to run `npm run atlas:build`, where output lands, current vs future scope.

## Verification

- `npm run atlas:build` produces non-empty `public/atlas/atlas.json` and `search-index.json`.
- Sample vault includes at least one broken wikilink and one duplicate-slug case (in a commented example) to demonstrate warnings.
- `bun run build` passes (existing app untouched).

## Explicit non-goals this batch

- No changes to `AtlasMap`, `Toolbar`, `SidePanel`, store, or current default sample data flow.
- No GitHub Action.
- No player-safe physical exclusion (visibility filtering happens in JSON output but full Batch 3 hardening comes later).
- No editor export of placements.
