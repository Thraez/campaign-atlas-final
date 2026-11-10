# Visibility and player safety

The atlas's central job is to ship a player-safe build that **never** leaks DM-only content. This doc covers the visibility states, the stripping mechanisms, the safety scanners, and what "player-safe" actually guarantees.

## The model

Every entity has a `visibility` value. The four valid states:

| Visibility | Meaning                                                                 | Ships to player build? | Search-indexed? | Mapped?        |
| ---------- | ----------------------------------------------------------------------- | ---------------------- | --------------- | -------------- |
| `player`   | Canon, revealed                                                         | ✓                      | ✓               | ✓ (placements) |
| `rumor`    | Public but uncertain — players know _of_ this, may not know what's true | ✓                      | ✓               | ✓              |
| `dm`       | DM-only, never published                                                | ✗                      | ✗               | ✗              |
| `hidden`   | Like `dm`, plus an indication the DM intends to never reveal            | ✗                      | ✗               | ✗              |

Invalid visibility values are coerced to `dm` (fail-safe). In strict player builds, invalid values fail the build with exit 3.

`world.yaml` regions, routes and sound-only areas follow the same fail-closed rule: a missing
`visibility` is `dm`, and so is a value that is present but invalid (a typo such as `secret` or
`Player`, empty, `false`); for regions and routes that typo also gets a build warning
([ADR-0001](adr/0001-missing-visibility-is-dm.md), addenda). Ride-on sound areas (`regionId`) take their region's visibility. The editor always writes
an explicit `visibility:` when it saves these items, and draws new ones as `dm`. One helper decides
it everywhere: `worldItemVisibility` in `src/atlas/content/visibility.ts`.

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
- Redaction goes by the link's target only. Author-written text in a link to a shipped note (its display alias or heading, e.g. an alias that names a secret) is not redacted; only the name scan (`check-no-secrets`) covers it, and only for whole names.

Similarly, player-visible **regions** and **routes** that reference DM-only entities fail strict builds (exits 6 and 7).

The player build ships what the per-campaign resolver ([ADR-0004](adr/0004-per-campaign-visibility-and-outputs.md)) decides for campaign `main`, read through the v1 adapter: notes, pins, regions, routes and sound areas, fog included. A region or sound-only area with any part of its area under fog, or a route with any part of its path under fog, doesn't ship (fog between lit corners or waypoints counts). A DM-only item and a shipped one that share a name (rule 8) fail every player build, strict or not, with exit 10, naming both; an orphan `notes:` entry fails any player build with exit 11, naming world and key. A sound area with no id, or an id another area on its map shares, fails a strict player build with exit 22, and every player build drops all areas that id names (an area plays only on its own verdict). All three stay out of the shipped build report.

A hidden region hides what is inside it or reaching into it (ADR-0004 rule 9). On a map that ships, a region hidden for its own sake (its visibility, or a linked note that doesn't ship) is a *hiding region*; one hidden only by fog or only by this rule is not. These don't ship, with reason `in-hidden-region`: a pin inside a hiding region or on its edge; a route with any point inside one, or any segment crossing into it, touching it or running along its edge; and a sound-only area or region that shares interior with one without wholly containing it. A child map whose frame does the same doesn't ship either (`frame-in-hidden-region`), and takes its whole subtree with it. "Wholly contains" means strictly inside, sharing no boundary, so an area identical to the hiding region hides. Hidden wins over a shipped region covering the same point. A hiding region with fewer than 3 finite points, or with no area, can't be tested (in v1, neither can a region the world loader drops, a repeated id or one short of 3 points, unless it is marked `visibility: player`): it hides everything on its map that this rule tests, and fails every player build with exit 12, naming map and region. A note whose every pin this rule hides still ships if its own visibility says so; the build warns, naming the note and the region. These messages stay out of the shipped build report too. `npm run atlas:tree` lists each shipped map's hidden items and why.

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

## The safety scanners

Every publish runs `npm run atlas:publish`, which chains:

```text
atlas:snapshot                # copy the current atlas.json to .last-published.json as a rollback baseline
atlas:build:player --strict   # the build itself; exits 3-11 on safety failures
build                         # vite build (excludes editor via __INCLUDE_EDITOR__)
atlas:scan                    # runs all eight safety scanners + audit-assets in parallel (scripts/atlas/publish-orchestrator.ts)
```

`atlas:scan` runs `publish-orchestrator.ts`, which fans out to eight safety scanners (each checked against both the `dist` bundle and `public/atlas`, except `check-shape`, which only checks `public/atlas/atlas.json`, `check-player-files`, which only checks `dist`, and `check-vault-content`, which checks `content/`) plus `audit-assets`.

What each scanner catches:

- **`check-no-secrets`** (`npm run atlas:check-secrets`) — greps the output for verbatim DM entity titles, ids, and aliases. Catches whole-name leaks.
- **`check-derived-secrets`** (`npm run atlas:check-derived`) — greps the output for DM-only profile values (e.g. the literal string from `profile.dm.secret`). Catches a content-fragment leak even if the entity name doesn't appear.
- **`check-artifact-shape`** (`npm run atlas:check-shape`) — validates the structure of `atlas.json`: no entity has visibility `dm`/`hidden`, no placement points at a missing entity, etc.
- **`check-image-privacy`** (`npm run atlas:check-image-privacy`) — catches two image-specific leak vectors a text scan can't see: leftover EXIF/IPTC/XMP metadata on a shipped image, and a filename that itself contains a derived-secret name.
- **`check-fog-safety`** (`npm run atlas:check-fog`) — re-derives the fog boundary from the source `world.yaml` and asserts the player artifacts don't leak it: the original (un-redacted) layer PNG, unstripped fog geometry, a player pin inside the fogged area or a region or route with any part of its area or path inside it (exit 15), a shipped sound-only area with any part of its area inside it (exit 21), or a redacted PNG that's still opaque at a fogged pixel.
- **`check-player-secrets`** — verifies no secret plaintext, passphrase, character key, or unstripped `{{secret:}}` marker reached the player artifacts. Runs only inside the orchestrator — there is no standalone `atlas:check-player-secrets` npm alias.
- **`check-player-files`** — fails when `dist/atlas/atlas.json` is missing from a built `dist/` or `dist/atlas/` holds any file outside the player allowlist (`scripts/atlas/playerFiles.ts`: the atlas JSON, images anywhere under `atlas/` except `assets/audio/`, the hashed audio `atlas.json` references, and empty `.gitkeep` files; not the audio manifest, which only the editor reads). Vite copies all of `public/atlas/` into `dist/`, so a DM file dropped there (a `world.yaml`, a note) would otherwise ship. The player build's prune plugin already removes such files; this scan fails closed if one gets through. Runs only inside the orchestrator.
- **`check-vault-content`** (`npm run atlas:check-vault-content`, exit 19) — while `atlas.config.json` has `"hosting": "public"`, fails when `content/` holds a note from the DM's vault (Sync's `atlas.source: vault` marker, the sync map, or a hash match against this machine's vault) or any symlink. It doesn't look at maps, images or `world.yaml`. Details: [IMPORT_EXPORT.md](IMPORT_EXPORT.md), "Hosting guard".

Separately, **`audit-assets`** (`npm run atlas:audit-assets`) isn't a safety scanner — it's a content-quality check: oversize images, orphaned files, and broken asset references.

If any scanner finds a problem, the publish chain fails before deploy.

**A missing artifact fails the scan (R-03).** Every run through the scan registry
(`scripts/atlas/scanRegistry.ts`) is a publish run: `atlas:scan` runs only inside `atlas:publish`
(so inside `npm run gate`) and the deploy workflow, and the editor's Publish check reads the same
list. Each scan names the artifacts it reads: the player `atlas.json` (`dist/atlas/atlas.json` or
`public/atlas/atlas.json`) for the artifact scans, plus `atlas.config.json` and `content/` for
`check-derived-secrets` and `check-image-privacy` (the secret names come from it) and
`atlas.config.json` for `check-fog-safety`; `content/` for `check-vault-content`; and
the store's `atlas.json` and `assets/` plus `content/` for `audit-assets`. When one is missing or
empty, the scan fails with exit 20 and names the path, without running: a publish never passes on
"0 files checked". Run by hand (`npm run atlas:check-secrets dist` and the like), a scan still
skips a dir that isn't built yet. Tests: `scanRegistry.test.ts`.

**Every campaign's dirs (R-15, ADR-0004).** The registry reads the campaign list from the loaded
model (`loadAtlasModel`, through the `atlas.config.json` the scan context names), so there is no
second list of dirs. v1 content is one campaign, `main`, on `dist` and `public/atlas` (14 tasks,
as above). v2 content gives each campaign its built site `dist-campaigns/<id>/` and its store
`.atlas-campaigns/<id>/atlas/`; every per-artifact scan (and `audit-assets`, a size budget per
store) runs once per campaign per layout, labelled with the dir (`check-fog-safety
dist-campaigns/a`) and requiring that campaign's player `atlas.json`, so a listed campaign with no
output fails the publish. A v2 run also scans `dist` and `public/atlas` (campaign `(legacy)`):
the build still writes them and the deploy ships `dist`, until R-19 retires them.
`check-vault-content` runs once. If the model can't load, the
orchestrator exits 1 and the editor's Publish check errors: the registry never runs on zero dirs.

**One store per campaign (R-17, ADR-0004).** On v2 content, `npm run atlas:build:player` builds
every campaign (`--campaign <id>` builds one) and writes each to its own store,
`.atlas-campaigns/<id>/atlas/` (`--out <dir>` moves the root; a store under `public/` is refused).
A store holds `atlas.json`, `search-index.json` and `assets/`: copies, never links, of exactly the
map images and audio its `atlas.json` names (maps under `assets/maps/<sha256-16><ext>`, byte for
byte, so they stay lossless; audio under `assets/audio/<hash>.ogg`). No asset dir is shared, and
`assets/` is replaced on every write. If any campaign fails, no store is written. Each
`atlas.json` names only its own campaign (`campaign: {id, name}`); the DM build carries every
campaign file instead. v1 output is unchanged.

What the resolver hides for a campaign (maps that are `dm` or `unknown`, their frames, subtree and
images; pins, routes and sound areas inside a hidden region) is absent from that store. The
resolver's must-not-ship set goes to `.atlas-campaigns/<id>/must-not-ship.json`, beside the store
and never inside it: `{campaign, ids, names, paths, pinLocations, otherCampaigns}`.
`check-derived-secrets` reads it (`--must-not-ship <file>`; the registry passes it for every v2
campaign dir and requires the file, and an unreadable file fails closed) and fails with 12 on any
of its ids or names as a whole word, or any of its paths (compared with `normalizePath` on both
sides). `check-fog-safety` reads a v2 campaign's fog from the campaign file. `audit-assets`
requires `assets/` only when the store's `atlas.json` names a file there.

A note body that links a hidden item (a hidden map or world, or any must-not-ship id or name, as
in `[[Hookhaven]]`) has that link redacted to `…`, as a link to a hidden note is, and the link
counts as a cross-reference leak: a `--strict` build fails with exit 8. Entity images and embedded
assets in v2 notes aren't published per campaign yet: the player build fails closed on one. Tests:
`src/test/build/campaign-stores.test.ts` (sentinels listed in `content-next/README.md`).

## Folder-level exclusion

Folders listed under `exclude` in `atlas.config.json` (default: `_drafts`, `_dm`, `archive`, `deprecated`) are excluded entirely:

- Files in those folders never enter the build pipeline.
- Their titles, ids, and aliases are loaded into the cross-reference index _only_ to catch wikilinks from public entries — but they ship nothing.

This means `_dm/Secret-Prep.md` and `_drafts/Wip.md` are safe to keep alongside published content.

## Rumor semantics

`rumor` is "public-but-uncertain." Concretely:

- Rumor entities **do** ship to player builds.
- Rumor entities **are** search-indexed.
- Rumor placements **do** render as pins on the map.
- The viewer renders a `Rumored — uncertain` badge so players can see the canon status.
- A `rumor`-visibility _relationship_ on a player entity ships in player builds (it's public info, even if uncertain).

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
- **Service-worker cache.** A returning player's PWA may serve a cached `atlas.json` from before a visibility flip. Vite's content-hashed asset URLs handle this for code, but to fully unreveal an entity that previously shipped as `player`, publish a new build _and_ expect cached clients to need a refresh. See [the caching note in WORKFLOWS.md](WORKFLOWS.md#cache-invalidation).
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
- `safety-fortress.test.ts` ("strict player build fails with exit 8 on cross-reference leak") — wikilink display-text redaction (exit 8).
- `safety-fortress.test.ts` ("unbalanced %% delimiter fails the build with exit 1") — unclosed `%%` fails the build.
- `sync-safety.test.ts` — what Sync from Obsidian leaves out, and that a `10_DmNotesAndSecrets` note never reaches the player build.

Run them with `npm run test:ci`. A green suite is the precondition for `git push`.
