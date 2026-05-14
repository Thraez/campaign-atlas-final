# Visibility and player safety

The atlas's central job is to ship a player-safe build that **never** leaks DM-only content. This doc covers the visibility states, the stripping mechanisms, the safety scanners, and what "player-safe" actually guarantees.

## The model

Every entity has a `visibility` value. The four valid states:

| Visibility | Meaning | Ships to player build? | Search-indexed? | Mapped? |
|---|---|---|---|---|
| `player` | Canon, revealed | ✓ | ✓ | ✓ (placements) |
| `rumor` | Public but uncertain — players know *of* this, may not know what's true | ✓ | ✓ | ✓ |
| `dm` | DM-only, never published | ✗ | ✗ | ✗ |
| `hidden` | Like `dm`, plus an indication the DM intends to never reveal | ✗ | ✗ | ✗ |

Invalid visibility values are coerced to `dm` (fail-safe). In strict player builds, invalid values fail the build with exit 3.

## Three mechanisms for hiding DM content

### 1. Whole-entity visibility (`atlas.visibility`)

Set in frontmatter:

```yaml
---
title: The Vampire Lord
atlas:
  visibility: dm
---
```

DM and hidden entities are excluded entirely from player builds. Their titles, summaries, bodies, images, and placements do not ship.

### 2. Inline DM blocks (`%% ... %%`)

Obsidian-comment syntax inside an otherwise player-visible entry:

```markdown
The lord-mayor seems honorable.

%% DM NOTE: He secretly funds the cult. %%
```

In player builds: the `%% ... %%` is stripped from the body and from every shipping string (summary, aliases, tags, labels, region/route names, profile.player freeform fields).

If a `%%` is opened but never closed, the build fails with an error — an unclosed comment block can silently leak everything after it.

### 3. Field-level DM callouts (`:::dm ... :::`)

For DM content embedded in an otherwise player-visible entry, a callout-style block:

```markdown
The Sapphire Coast is famous for its pearl divers.

:::dm
The cult of the Drowned Eye controls the dive co-op. Most divers don't know.
:::
```

The editor has a one-click button to wrap a selection in `:::dm ... :::`. In player builds the entire block is stripped — same guarantee as `%% ... %%`, just with a more legible authoring syntax for users who don't know Obsidian's comment notation.

### Cross-references

If a player-visible entry contains a wikilink to a DM-only entity:

```markdown
The mayor's chief advisor is [[Vampire Lord]].
```

…the display text `Vampire Lord` would itself leak the secret name. The build catches this:

- In standard player builds: the link is rendered as `…` (redacted) and the build warns.
- In **strict** player builds (`atlas:build:player`): the build fails with exit 8.

Similarly, player-visible **regions** and **routes** that reference DM-only entities fail strict builds (exits 6 and 7).

## Profiles and relationships

Profiles split into `player` and `dm` halves:

```yaml
atlas:
  profile:
    player:
      known_for: Ferries travelers across the marsh.
    dm:
      secret: He carries a shrine-token under his tongue.
```

`profile.dm` is dropped entirely in player builds. `profile.player.known_for`, `visible_traits`, and `rumors` go through `%%`-stripping in player builds.

Relationships have their own `visibility`:

```yaml
atlas:
  relationships:
    - entity: thornhold
      type: trades_with
      visibility: player
    - entity: deeproot-cavern
      type: secretly_funds
      visibility: dm
```

DM and hidden relationships are stripped. A player relationship pointing at a DM-only entity is treated as a spoiler leak (strict build fails with exit 5).

## The three safety scanners

Every publish runs `npm run atlas:publish`, which chains:

```text
atlas:build:player --strict   # the build itself; exits 3-9 on safety failures
build                         # vite build (excludes editor via __INCLUDE_EDITOR__)
atlas:check-secrets dist                 # scan compiled JS bundle for DM strings
atlas:check-secrets public/atlas         # scan published atlas.json
atlas:check-shape public/atlas/atlas.json # validate artifact structure
atlas:check-derived dist                 # scan for DM strings in vite output
atlas:check-derived public/atlas         # scan for DM strings in atlas.json
```

What each scanner does:

- **`check-no-secrets`** — greps the output for verbatim DM entity titles, ids, and aliases. Catches whole-name leaks.
- **`check-derived-secrets`** — greps the output for DM-only profile values (e.g. the literal string from `profile.dm.secret`). Catches a content-fragment leak even if the entity name doesn't appear.
- **`check-artifact-shape`** — validates the structure of `atlas.json`: no entity has visibility `dm`/`hidden`, no placement points at a missing entity, etc.

If any scanner finds a problem, the publish chain fails before deploy.

## Folder-level exclusion

Folders listed under `exclude` in `atlas.config.json` (default: `_drafts`, `_dm`, `archive`, `deprecated`) are excluded entirely:

- Files in those folders never enter the build pipeline.
- Their titles, ids, and aliases are loaded into the cross-reference index *only* to catch wikilinks from public entries — but they ship nothing.

This means `_dm/Secret-Prep.md` and `_drafts/Wip.md` are safe to keep alongside published content.

## Rumor semantics

`rumor` is "public-but-uncertain." Concretely:

- Rumor entities **do** ship to player builds.
- Rumor entities **are** search-indexed.
- Rumor placements **do** render as pins on the map.
- The viewer renders a `Rumored — uncertain` badge so players can see the canon status.
- A `rumor`-visibility *relationship* on a player entity ships in player builds (it's public info, even if uncertain).

If you want player-visible-but-treat-as-fact, use `visibility: player`. If you want a piece of canon that players have heard of but the DM hasn't confirmed in-fiction, use `visibility: rumor`. If you want DM-only, use `visibility: dm` or `hidden`.

## What player-safe **does** guarantee

- DM-visibility entities and their content do not ship.
- DM-visibility profile/relationship data does not ship.
- `%%` blocks and `:::dm` callouts do not ship in any shipping string.
- Wikilinks from public entries to DM entities are redacted; strict builds fail.
- Player-visible regions/routes referencing DM entities fail strict builds.
- Map names, region names, route names, and labels are `%%`-stripped.
- Stripped DM warnings in player builds have secret names scrubbed.

## What player-safe **does not** guarantee

- **Inferable secrets.** A player can infer that a place is significant if it has a player-visible pin labeled "Vampire's Tomb" — the safety gate does not detect emotional spoilers, only data leaks.
- **External assets.** External URLs (`https://...`) are not scanned. Don't link to a private CDN that publishes DM-only images.
- **Service-worker cache.** A returning player's PWA may serve a cached `atlas.json` from before a visibility flip. Vite's content-hashed asset URLs handle this for code, but to fully unreveal an entity that previously shipped as `player`, publish a new build *and* expect cached clients to need a refresh. See [the caching note in WORKFLOWS.md](WORKFLOWS.md#cache-invalidation).
- **The `git history`.** If you commit `visibility: player` and then change it to `dm`, the old version is still in `git log`. The published site is regenerated, but your repo's history retains it. Use `git filter-repo` if a true scrub matters.

## Recovering from a leak

If a build deploys and you discover a leak after the fact:

1. Fix the canon: change visibility, wrap content in `%%` or `:::dm`, or move the file under `_dm/`.
2. `npm run atlas:publish` to confirm the build is now green.
3. Commit and push. The workflow at `.github/workflows/publish-atlas.yml` will re-deploy in ~2 minutes.
4. For a true cache bust, increment the PWA version in `vite.config.ts` (the build hash usually does this automatically).

See [WORKFLOWS.md](WORKFLOWS.md) for the full rollback flow.

## Tests pinning these guarantees

The Vitest suite under `src/test/` exercises every guarantee above. The headline tests:

- `safety-fortress.test.ts` — end-to-end spoiler-leak gates. Hidden villains, hidden routes, hidden relationships, hidden DM notes; player build must not contain any of them.
- `atlas-region-route-strict.test.ts` — strict player builds fail on region/route leaks (exits 6 and 7).
- `atlas-build.test.ts` — visibility-based entity filtering, `%%` stripping, multi-map placements.
- `cross-reference-leak.test.ts` — wikilink display-text redaction (exit 8).
- `unbalanced-dm-block.test.ts` — unclosed `%%` fails the build.

Run them with `npm test`. A green suite is the precondition for `git push`.
