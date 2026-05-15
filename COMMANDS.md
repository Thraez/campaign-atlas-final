# Commands reference

Every useful command in this project, grouped by what you're trying to do.
Each entry shows the npm script you'd type and the matching launcher in
[`bin/`](bin/) — double-click that launcher to run the command without `cd`-ing
into the repo.

> **Tip:** for the launchers, see [`bin/README.md`](bin/README.md) for how to
> pin them to your Desktop, taskbar, or Start menu.

---

## 1. Daily authoring

Your one-two punch for editing the world.

### `npm run dev` &nbsp;·&nbsp; `bin/dev.cmd`

Starts the Vite dev server with the full editor and the local `/__atlas/save`
endpoint mounted. Visit `http://localhost:8080/atlas` for the player view or
`/atlas/edit` for the visual editor. Use this for everyday authoring — pins,
regions, routes, fog, layers. Leave it running; rebuilds are instant.

### `bin/open-editor.cmd`

Opens `http://localhost:8080/atlas/edit` in your default browser. Assumes
`dev.cmd` is already running. One-click way to jump into the visual editor.

### `npm run atlas:build` &nbsp;·&nbsp; `bin/atlas-build.cmd`

Re-scans `content/` and regenerates `public/atlas/atlas.json` and
`public/atlas/search-index.json` with **DM content included**. The dev server
runs this automatically after a Save, so you rarely invoke it manually — handy
when you've edited markdown outside the editor (e.g. directly in Obsidian) and
want the atlas to pick it up.

---

## 2. Publishing (before pushing to GitHub)

### `npm run atlas:publish` &nbsp;·&nbsp; `bin/atlas-publish.cmd` &nbsp;⭐

**The one to click before `git push`.** Full publish chain — seven steps in
order:

1. `atlas:snapshot` — saves a baseline of the current atlas for diffing.
2. `atlas:build:player` — strict player atlas (DM content stripped).
3. `build` — Vite production build of the player site into `dist/`.
4. `atlas:check-secrets dist` — scans `dist/` for DM-sentinel leaks and editor
   fingerprints (`AtlasPlacementEditor`, `/__atlas/save`, etc.).
5. `atlas:check-secrets public/atlas` — same scan on the player atlas itself.
6. `atlas:check-shape public/atlas/atlas.json` — structural assertions on the
   player atlas (required fields, no DM-only blocks, etc.).
7. `atlas:check-derived dist` &nbsp;+&nbsp; `atlas:check-derived public/atlas` —
   ensures derived fields don't leak DM content.
8. `atlas:audit-assets` — confirms every referenced asset actually exists.

If every step exits 0, the build is safe to commit and push. Any non-zero exit
means **don't ship**.

### `npm run atlas:build:player` &nbsp;·&nbsp; `bin/atlas-build-player.cmd`

Just step 2 of the publish chain — the strict player atlas, without the rest of
the checks. Use when you want to inspect `public/atlas/atlas.json` for what
players will see, without doing a full Vite build.

### `npm run build` &nbsp;·&nbsp; `bin/build.cmd`

Player-safe production Vite build into `dist/`. Tree-shakes the editor and the
local-save endpoint out via `__INCLUDE_EDITOR__` and the save plugin's
`apply: "serve"`. Use when you want to test the production bundle locally
without re-running the full publish chain.

---

## 3. Safety checks & audits

Run these individually when you want to verify something fast.

### `npm run atlas:check-secrets <dir>` &nbsp;·&nbsp; `bin/atlas-check-secrets.cmd`

Sentinel scan over `<dir>` (the launcher passes `dist`). Fails if it finds DM
sentinels or editor fingerprints. The single most important guardrail for
"did I accidentally publish DM content to players".

### `npm run atlas:check-derived <dir>` &nbsp;·&nbsp; `bin/atlas-check-derived.cmd`

Like `check-secrets`, but for derived/computed fields rather than raw
sentinels. The launcher passes `dist`.

### `npm run atlas:check-shape <atlas.json>` &nbsp;·&nbsp; `bin/atlas-check-shape.cmd`

Structural assertions over the player atlas JSON — required keys, expected
types, no DM-only branches. The launcher checks `public/atlas/atlas.json`.

### `npm run atlas:audit-assets` &nbsp;·&nbsp; `bin/atlas-audit-assets.cmd`

Walks every asset reference in the atlas and confirms the file actually exists
under `public/atlas/assets/`. Catches broken image links before players see a
404.

### `npm run lint` &nbsp;·&nbsp; `bin/lint.cmd`

ESLint over the whole repo. Run before committing TypeScript/React changes.

### `npm test` &nbsp;·&nbsp; `bin/test.cmd`

Vitest run, one-shot. Used by CI.

---

## 4. Snapshots & backups

### `npm run atlas:snapshot` &nbsp;·&nbsp; `bin/atlas-snapshot.cmd`

Saves a baseline of the current atlas state. Used as step 1 of `atlas:publish`
so you can diff the next build against the previous one. Safe to run any time.

### `npm run atlas:backup` &nbsp;·&nbsp; `bin/atlas-backup.cmd`

Backs up the atlas state. Run before any large refactor of `content/` or
`world.yaml` you might want to roll back.

---

## 5. Setup

### `npm install` &nbsp;·&nbsp; `bin/install.cmd`

Installs dependencies. Run on a fresh clone, after pulling changes that touch
`package.json` or `package-lock.json`, or after a Node version bump.

---

## 6. Less common

### `npm run build:editor` &nbsp;·&nbsp; `bin/build-editor.cmd`

Production build with the editor **included**. Rarely needed — prefer
`npm run dev` for editing. Only useful if you want a deployable build that
contains the editor (e.g. an internal DM-only deploy).

### `npm run build:dev`

Vite build in development mode. Mostly a debugging tool — no launcher.

### `npm run preview` &nbsp;·&nbsp; `bin/preview.cmd`

Serves the `dist/` folder over HTTP for local inspection. Run after `build` to
see exactly what GitHub Pages will serve.

### `npm run test:watch` &nbsp;·&nbsp; `bin/test-watch.cmd`

Vitest in watch mode. Good companion when refactoring scripts under
`scripts/` or `src/atlas/`.

---

## Cheat sheet

| I want to… | Click |
|---|---|
| Edit pins / regions / routes | `bin/dev.cmd` then `bin/open-editor.cmd` |
| Rebuild atlas after editing markdown in Obsidian | `bin/atlas-build.cmd` |
| Ship to GitHub Pages | `bin/atlas-publish.cmd`, then commit & push |
| Sanity-check a player build for DM leaks | `bin/atlas-check-secrets.cmd` |
| Verify every map / portrait / asset exists | `bin/atlas-audit-assets.cmd` |
| Snapshot before a risky edit | `bin/atlas-backup.cmd` |
| Fresh clone setup | `bin/install.cmd` |

---

## Adding a new command

1. Add the npm script to [`package.json`](package.json).
2. Copy any `.cmd` in [`bin/`](bin/) and change the `call npm run <name>` line.
3. Add a section to this doc under the right group.

The launcher template lives in [`bin/README.md`](bin/README.md).
