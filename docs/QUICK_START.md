# Quick start: zero to published in 10 minutes

This is a linear setup path: clone, run dev, see the seed world, swap in your own world, publish to GitHub Pages. The full design rationale lives in [README.md](../README.md) — that's a reference, not a tutorial.

## Prerequisites

- Node 20+ and npm.
- A GitHub account (only required if you want to host the player site).
- (Optional) Obsidian, for authoring canon. The vault is plain markdown — any editor works.

## 1. Clone and install (2 min)

```bash
git clone <your-fork-or-this-repo>
cd campaign-atlas-final
npm install
```

## 2. Run dev mode and open the editor (1 min)

```bash
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

- `/atlas` — the player viewer (what your players will see).
- `/atlas/edit` — the **Creator Cockpit**, the DM tool. This route only exists in `npm run dev`. The published player build physically excludes it (see `__INCLUDE_EDITOR__` in `vite.config.ts`).

## 3. Try the seed world (1 min)

A generic seed world ships under `examples/seed-world/`. To run the build against it, edit `atlas.config.json`:

```json
{
  "contentRoot": "examples/seed-world",
  "defaultWorld": "seed"
}
```

Then run:

```bash
npm run atlas:build
```

This writes `.local-atlas/atlas.json` — the full DM build (with secrets). Reload `/atlas` to see the seed map.

To produce a player-safe build (DM content stripped):

```bash
npm run atlas:build:player
```

This writes `public/atlas/atlas.json` — what the player site will serve.

## 4. Swap in your world (5 min)

1. Create a folder under `content/` for your world, e.g. `content/my-world/`.
2. Inside, create `_atlas/world.yaml` (use `examples/seed-world/_atlas/world.yaml` as the template).
3. Put your map image under `public/atlas/assets/maps/`.
4. Reference it from `world.yaml`:
   ```yaml
   maps:
     - id: my-world-overview
       name: Overview
       width: 4000
       height: 3000
       layers:
         - id: overview
           src: /atlas/assets/maps/my-map.png
           x: 0
           y: 0
           width: 4000
           height: 3000
           opacity: 1
           zIndex: 1
   ```
5. Update `atlas.config.json`:
   ```json
   { "contentRoot": "content/my-world", "defaultWorld": "my-world" }
   ```
6. Create your first entity at `content/my-world/settlements/Foo.md`:
   ```markdown
   ---
   title: Foo
   atlas:
     type: settlement
     visibility: player
     placements:
       - mapId: my-world-overview
         x: 1500
         y: 1200
   ---
   A red-stone trading post.
   ```
7. Re-run `npm run dev`. Click the pin.

## 5. Publish to GitHub Pages (1 min, after setup)

The workflow at `.github/workflows/publish-atlas.yml` runs on every push to `main`:

1. Builds the strict player atlas.
2. Runs three safety scanners (`atlas:check-secrets`, `atlas:check-derived`, `atlas:check-shape`).
3. Deploys `dist/` to GitHub Pages.

To enable: in your repo's Settings → Pages, set Source to "GitHub Actions". Push to `main`. Wait ~2 minutes.

If the workflow fails on a safety scanner, the build does not deploy — your players will not see leaked content.

## Daily workflow after setup

```bash
# Edit your canon in Obsidian (or any markdown editor).
# Run the editor to drop pins, draw regions, etc.
npm run dev

# Before pushing, verify a clean strict build:
npm run atlas:publish

# All green? Commit and push.
git add . && git commit -m "session prep" && git push
```

If `npm run atlas:publish` fails, fix the canon. **Never hand-edit `public/atlas/atlas.json`** — it's generated. A pre-tool hook blocks this for AI agents; humans should respect the same rule.

## What to read next

- [Visibility and player safety](VISIBILITY_AND_PLAYER_SAFETY.md) — how DM content is hidden from the public build.
- [Workflows](WORKFLOWS.md) — session prep cycle, save plugin, save-conflict handling.
- [Import / export](IMPORT_EXPORT.md) — bringing in an existing Obsidian vault, patches, backups.
- [Known limitations](KNOWN_LIMITATIONS.md) — what's intentionally not supported.
- [Non-goals](NON_GOALS.md) — what we have decided not to build.
