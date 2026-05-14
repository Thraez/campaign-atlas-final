# Mistmoor — seed world example

A minimal, generic-fantasy starter world for `campaign-atlas-final`. Copy
it into `content/` and you have a buildable atlas with one map, a few
entities, a calendar, and the recommended folder layout — ready to be
filled in with your own world.

This folder lives under `examples/` precisely so the build does not pick
it up. Nothing here is part of any real build until you copy it into
`content/`.

## How to use it

1. **Copy** the folder into `content/`, renaming it to whatever world id
   you want. The folder name becomes the world id.

   ```sh
   cp -r examples/seed-world content/mistmoor
   ```

   (On Windows PowerShell: `Copy-Item -Recurse examples/seed-world content/mistmoor`.)

2. **Point the build at it.** Edit `atlas.config.json` at the repo root
   and set `defaultWorld` to your new world id:

   ```json
   {
     "defaultWorld": "mistmoor",
     ...
   }
   ```

3. **Build.** From the repo root:

   ```sh
   npm run atlas:build
   ```

   Then `npm run dev` to open the editor, or `npm run build` for a
   player-safe production bundle.

4. **Add a map image.** The seed world ships with no map image (just the
   ocean color and a 100-px square grid). Drop your own image into
   `public/atlas/assets/maps/` and uncomment the `layers:` block in
   `_atlas/world.yaml`.

## What each file demonstrates

| File | What it shows |
| --- | --- |
| `_atlas/world.yaml` | World config: one 2000x1500 map with a square grid, an empty `regions`/`routes`/`fog`, and a simple 4-month calendar with epoch `AE`. Commented examples show region and route shapes. |
| `settlements/Pinemoot.md` | Player-visible settlement with a placement at (1000, 750), aliases, summary, tags, and a wikilink to `[[Captain Ren]]`. |
| `npcs/Captain-Ren.md` | Player-visible NPC with no placement and a full `profile` block (player half plus DM half with a `secret:` field — the DM half is stripped from player builds). |
| `factions/The-Watch.md` | Player-visible faction entity, no placement. |
| `events/The-Founding.md` | Player-visible event dated `0-1-1` — year 0 of the calendar defined in `world.yaml`. |
| `_dm/Hidden-Cult.md` | DM-only entity under the `_dm/` exclude folder. Demonstrates the two layers of protection: the folder is excluded by `atlas.config.json`, and the entity itself has `visibility: dm`. Should never appear in a player build. |
| `_drafts/WIP-Idea.md` | A draft note under the `_drafts/` exclude folder, also marked `publish: false`. Excluded from every build. |

## Frontmatter cheatsheet

The minimum a publishable entity needs:

```yaml
---
title: Display Name
atlas:
  publish: true
  type: settlement      # or npc, faction, event, region, ruin, item, ...
  visibility: player    # or dm, hidden, rumor
---
```

See the long-form schema docs in the repo `README.md` under
"Entity frontmatter".

## Safety notes

- `_dm/` and `_drafts/` are excluded by the default `atlas.config.json`.
- Player builds also strip `profile.dm` and any `%% DM NOTE: ... %%`
  comment blocks from the markdown body.
- Run `npm run atlas:publish` to do a full build with the secret and
  derived-content scans before sharing the output with players.
