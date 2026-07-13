# Workflows

How a DM actually uses this tool, day to day.

## The session-prep cycle

```text
Obsidian (or any markdown editor)        npm run dev               git
   │                                         │                       │
   │ author canon, draft NPCs,                │                       │
   │ wikilinks, frontmatter                   │                       │
   ▼                                          │                       │
content/<world>/**.md                         │                       │
   │                                          │                       │
   └──► npm run atlas:build  (DM build) ◄────►│  /atlas    /atlas/edit│
                │                                                     │
                ▼                                                     │
        .local-atlas/atlas.json                                       │
        (full canon, never published)                                 │
                                                                      │
   ──► npm run atlas:publish ──► dist/  ─────────────────────────────►│ git push
        (strict player build + 3 scanners)                            │
                                                                       ▼
                                                              GitHub Actions
                                                              GitHub Pages deploy
```

Typical session-prep loop, 5–15 minutes:

1. Open Obsidian, type up the night's plans into `content/<world>/`.
2. `npm run dev` (if not already running).
3. Visit `/atlas/edit` to drop new pins, draw a region for the goblin warband, route the chase scene.
4. The editor writes your pins, regions, and edits; the dev-mode `/__atlas/save` endpoint saves them straight to disk.
5. Switch to `/atlas` (still in dev). Click the new pins. Do they look right?
6. `npm run atlas:publish` to confirm the strict build is green.
7. `git add . && git commit -m "session prep: red tower job" && git push`.
8. GitHub Pages publishes in ~2 minutes.

## The Creator Cockpit (`/atlas/edit`)

Each tab is a focused tool.

| Tab | What it does |
|---|---|
| **Pins** | Drop, drag, retype, recolor pin placements. Multi-select for bulk operations. |
| **Maps** | Add image layers, set opacity/zindex, define scale, grid, ocean color. |
| **Regions** | Draw polygon regions, color them, set per-region visibility. |
| **Routes** | Draw waypoint-based routes (foot/horse/ship/fly), with travel-time speed. |
| **Fog** | Paint reveals + draw fog (conceals) over a map; set a soft-edge width. When fog is enabled on a map, the player build redacts that map's image layers behind a feathered alpha mask, strips the fog geometry from the player atlas, and excludes any pins/routes/regions that fall in fog. The player viewer paints the map's ocean color behind the redacted image. |
| **Sound** | Draw sound areas over a map and attach a looping ambience to each; set volume and visibility. See [Ambient sound](#ambient-sound) below. |
| **Entities** | Edit entity frontmatter, profile, relationships. One-click `:::dm` insert for field-level visibility. |
| **Import** | Drop in a folder of markdown, classify into ignored/wiki-only/placeable/published, get patches. |
| **Publish Check** | Pre-flight dashboard: counts, warnings, last-publish diff, strict-build summary. |

### Save plugin (writes to disk)

Save writes your editor changes straight back to the vault on disk:

- The save endpoint is `/__atlas/save` and is **on by default in `npm run dev`** via `scripts/vite-plugin-atlas-save.ts`.
- It only writes inside `content/` and `public/atlas/assets/`. Anything outside the configured `contentRoot` is rejected.
- It does **not** ship to production. The plugin is excluded from `npm run build`.

### Save-conflict handling

If you edit a frontmatter field in Obsidian (or rebuild externally) while the editor is open, the editor's snapshot of canon is stale. Two layers of protection:

1. **External rebuild banner.** The editor polls `atlas.json` every 30 seconds; if `publishedAt` changes (meaning a rebuild ran outside the editor), an orange banner appears: *"Canon rebuilt externally — Reload canon"*. Clicking **Reload canon** discards any cached project and refetches.
2. **Intelligent merge on save.** When saving placements, the canonical save reads the entity's `.md` file from disk via `GET /__atlas/read?path=...` and merges only the per-map placements you actually edited. Placements on maps you didn't touch are preserved exactly. If Obsidian moved a placement on the *same* map you're editing, the editor wins — there's no per-placement diff UI yet.

For the safest workflow:

- Save the editor's pending changes before doing major Obsidian frontmatter edits.
- When the external-rebuild banner appears, reload before continuing.
- Use git as the canonical undo.

## Undo in the editor

There is no in-editor undo/redo stack yet. The canonical undo is git:

1. Find the file in `git status`.
2. `git checkout content/<path>` to discard your latest save.
3. Click **Reload canon** in the editor (the orange banner) to pick up the reverted file.

Unsaved drafts (pins you've dragged but not clicked Save on) live in `localStorage` under `atlas-placement-overrides-v3`. Closing the tab keeps them; clearing browser data discards them. The yellow "unsaved changes" banner at the top of the editor surfaces this.

## Ambient sound

The **Sound** tab (rail shortcut `S`) adds looping atmosphere to a map. Draw a sound area over part of the map — or attach one to an existing region — then pick a loop from the audio picker (it lists the files in `public/atlas/assets/audio/`), and set its volume and visibility. Three seamless starter loops ship: `wind-hollow`, `water-trickle`, and `cavern-drone`. Give an area a **player-visible** visibility and players hear it when they pan into that part of the map; keep it **DM-only** and it never reaches the player build. Save writes the sound areas into `world.yaml` alongside every other placement.

In the player viewer, a mute/volume control persists the visitor's preference. Because browsers block audio autoplay, ambience does not start on page load — it begins on the visitor's first interaction with the page (the viewer surfaces an "enable sound" control for that first gesture).

## Import wizard (`/atlas/edit` → Import tab)

For a folder of existing Obsidian markdown:

1. Drop the folder into the import tab.
2. Each file is classified:
   - **Ignored** — under an excluded folder, or `publish: false`.
   - **Wiki-only** — no `atlas.placements`, ships as a wiki entry but no pin.
   - **Placeable** — has `atlas.placements` or legacy `atlas.x/y`.
   - **Player-published** — visible to players.
3. The wizard surfaces conflicts (duplicate titles, missing placements, frontmatter shape issues).
4. On commit, every import writes an **import-batch record** to `atlas/import-batches/<timestamp>.json`. This lists every file created or modified. Use it to:
   - Audit what an import did.
   - Roll a batch back: the editor's Import tab has a "remove this batch" affordance that deletes / restores files atomically, warning if any have been modified since the import.

## Rollback flow (production)

If a published build leaks DM content or breaks the player site:

1. **Identify** the offending commit: `git log --oneline -10`.
2. **Revert** it: `git revert <sha>`. This creates a new commit that reverses the change — preferable to `git reset` for shared branches.
3. **Push**: `git push`. GitHub Actions re-runs the publish workflow.
4. **Verify** the deployment: visit the player site, hard-refresh, check the leaked content is gone.

For an emergency offline-style rollback, you can also:

1. `git checkout <last-known-good-sha> -- public/atlas/atlas.json public/atlas/search-index.json`
2. `git commit -m "emergency rollback to <sha>"`
3. `git push`

But this is fragile — the canon and the artifact diverge. Prefer `git revert`.

## Cache invalidation

The published player site is a PWA. Returning players may have a cached `atlas.json`. After an emergency unreveal:

- Vite's content-hashed asset URLs ensure JS / CSS bundles are cache-busted automatically.
- `atlas.json` is fetched at runtime; on first PWA load after a deploy, the service worker fetches the new version. The next page load uses it.
- For a guaranteed fresh load on returning clients, increment the PWA version in `vite.config.ts` (the `pwa` plugin config). This forces a service-worker update on next visit.

Players in offline mode will continue to see the cached version until they reconnect. There is no remote kill switch — by design.

## Authoring discipline

Habits that prevent painful sessions:

- **Run `npm run atlas:publish` before every push.** The publish chain is your safety net.
- **Keep `_dm/` for unfinished schemes.** Anything that would embarrass you if a player saw it goes here.
- **Use `:::dm` for paragraph-level DM notes inside an otherwise-published entry.** Reserve `%%` for inline DM remarks.
- **Set `atlas.id` on first publish.** This makes renaming safe — wikilinks and placements key off the id, not the filename.
- **Commit small.** One session-prep change per commit makes `git revert` painless.
- **Don't hand-edit `public/atlas/atlas.json` or `.local-atlas/`.** They're generated. A `PreToolUse` hook blocks AI agents from doing this; humans get a confusing diff if they try.

## When the player site is broken

Diagnose in this order:

1. Look at the latest GitHub Actions run. Did the publish workflow fail? Read the log — the safety scanners print actionable messages.
2. Locally: `npm run atlas:publish`. Does it succeed? If not, the canon is broken — fix the source.
3. Locally: `npm test`. Does the suite pass? A regression in build/scan logic shows up here.
4. Compare `public/atlas/atlas.json` on the deployed site (open `https://yourusername.github.io/<repo>/atlas/atlas.json`) against your local build. If they differ, a deploy step is stale.

If you can't fix it in <10 minutes, rollback (above) and investigate offline.
