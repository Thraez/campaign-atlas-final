# Commands reference

Every script in `package.json` that a person runs, grouped by what you're trying to do. Hooks that
run by themselves (`predev`, `prepare`) are left out.

Run each one from the repo folder with the npm command shown; that works on the Mac and on
Windows. Some also have a **Windows-only** launcher in [`bin/`](bin/): double-click it to run the
command without opening a terminal. [`bin/README.md`](bin/README.md) explains how to pin them.

---

## 1. Daily authoring

### `npm run dev` · Windows: `bin/dev.cmd`

Starts the Vite dev server with the full editor and the local `/__atlas/save` endpoint. Open
`http://localhost:8080/atlas` for the player view or `/atlas/edit` for the editor. Leave it
running; it rebuilds as you go. Before it starts, `predev` makes sure a DM atlas exists.

### Open the editor · Windows: `bin/open-editor.cmd`, `bin/launch-editor.cmd`

`open-editor.cmd` opens `http://localhost:8080/atlas/edit` in the browser while `dev` is running.
`launch-editor.cmd` does all of it: `atlas:build`, then opens the editor, then `dev`. On the Mac,
run `npm run dev` and open the address yourself.

### `npm run atlas:build` · Windows: `bin/atlas-build.cmd`

Re-reads `content/` and writes the atlas **with DM content** to `.local-atlas/` (gitignored; the
editor reads it from there). The dev server does this after every Save; run it yourself after editing markdown
outside the editor.

---

## 2. Publishing

### `npm run atlas:publish` · Windows: `bin/atlas-publish.cmd` ⭐

**Run this before pushing to `main`** (a push to `main` publishes the site). In order:

1. `atlas:snapshot`: saves a baseline of the current atlas for diffing.
2. `atlas:build:player`: the strict player atlas, DM content stripped.
3. `build`: the player site into `dist/`.
4. `atlas:scan`: the 12 safety scans below, over `dist/` and `public/atlas/`.

Exit 0 means it's safe to commit and push. Anything else: don't ship.

### `npm run atlas:build:player` · Windows: `bin/atlas-build-player.cmd`

Step 2 alone. Use it to see in `public/atlas/atlas.json` exactly what players get.

### `npm run atlas:scan`

Step 4 alone: runs every scan below at once on what's already built.

### `npm run build` · Windows: `bin/build.cmd`

The player-safe production build into `dist/`. The editor and the save endpoint are left out
(`__INCLUDE_EDITOR__`). For a GitHub Pages path, set `ATLAS_BASE=/campaign-atlas-final/` first.

### `npm run build:player`

The same build in Vite's `production` mode, by name.

### `npm run preview` · Windows: `bin/preview.cmd`

Serves `dist/` locally, to see what GitHub Pages will serve. Run it after `build`.

---

## 3. Safety scans

`atlas:scan` runs all of these. Run one alone when you want a fast answer. Each takes a folder
(`dist` or `public/atlas`); the Windows launchers pass `dist`.

| Command | Windows launcher | What it catches |
| --- | --- | --- |
| `npm run atlas:check-secrets <dir>` | `bin/atlas-check-secrets.cmd` | DM sentinels and editor fingerprints. The most important guard. |
| `npm run atlas:check-derived <dir>` | `bin/atlas-check-derived.cmd` | DM content leaking through derived fields. |
| `npm run atlas:check-shape <atlas.json>` | `bin/atlas-check-shape.cmd` | A player atlas with the wrong structure or DM-only blocks. |
| `npm run atlas:audit-assets` | `bin/atlas-audit-assets.cmd` | Referenced images and maps that don't exist; orphan files. |
| `npm run atlas:check-image-privacy <dir>` | `bin/atlas-check-image-privacy.cmd` | Image metadata that shouldn't ship (GPS, author). |
| `npm run atlas:check-fog <dir>` | `bin/atlas-check-fog.cmd` | Anything under fog that reached the player build. |
| `npm run atlas:check-player-secrets <dir>` | `bin/atlas-check-player-secrets.cmd` | Unstripped `{{secret:}}` markers or character-secret plaintext. |

### `npm run atlas:publish:integrity-smoke`

Checks the scans themselves: feeds each one a planted leak and confirms it still fails. Run it
after changing a scan or the publish chain.

---

## 4. Code checks

### `npm run verify`

`typecheck:all`, then `lint`, then `test:ci`: everything a change needs before it's done.

### `npm run typecheck:all`

TypeScript over the app (`npm run typecheck`) and over `scripts/` (`npm run typecheck:scripts`). Each
also runs alone.

### `npm run lint` · Windows: `bin/lint.cmd`

ESLint over the repo.

### `npm run format` and `npm run format:check`

Prettier over `src/` and `scripts/`: `format` rewrites the files, `format:check` only reports.
The pre-commit hook runs `format:check`.

### `npm run test:ci` · Windows: `bin/test.cmd`

The whole test suite in 4 shards (about 3 minutes). One unsharded `vitest run` runs out of
memory. A shard that only hits vitest's worker timeout, with every test passing, is re-run once.
`npm test` runs this too.

### `npm run test:watch` · Windows: `bin/test-watch.cmd`

Vitest in watch mode. Use it on a few files at a time (`npm run test:watch -- src/test/…`), not the
whole suite.

### `npm run test:coverage`

Vitest with a coverage report. Unsharded, so give it a folder or file.

---

## 5. Images, maps and audio

### `npm run images:optimize`

Converts PNG/JPEG images to WebP and updates the references. It replaces the originals. Safe to
run again. The encoding rules live in `src/atlas/assets/imageEncoding.ts`.

### `npm run maps:optimize`

Makes WebP twins of oversized map PNGs under `public/atlas/assets/maps` and points `world.yaml` at
them. Maps stay lossless; the PNG is kept.

### `npm run audio:transcode`

Makes the `.ogg` and `.m4a` copies of the starter-ambience WAVs that ship to players. Needs
`ffmpeg`.

---

## 6. Snapshots and backups

### `npm run atlas:snapshot` · Windows: `bin/atlas-snapshot.cmd`

Saves a baseline of the current atlas, for diffing the next build. Step 1 of `atlas:publish`.

### `npm run atlas:backup` · Windows: `bin/atlas-backup.cmd`

Zips `content/`, the atlas assets and the build config into `backups/<timestamp>.zip`. Add
`-- --keep N` to keep only the newest N. Run it before a large change to `content/` or
`world.yaml`.

### `npm run atlas:restore -- --restore <zip> --out <dir>`

Unpacks a backup into a new, empty folder. It refuses to write into a folder that has files.

---

## 7. Setup and other builds

### `npm install` · Windows: `bin/install.cmd`

Installs dependencies. Run it on a fresh clone and after `package.json` or the lock file changes.

### `npm run build:editor` · Windows: `bin/build-editor.cmd`

A production build **with** the editor. Rarely needed; never publish it.

### `npm run build:dev`

A Vite build in development mode, for debugging the build.

---

## Cheat sheet

| I want to… | Run | Windows launcher |
| --- | --- | --- |
| Edit pins, regions, routes | `npm run dev`, open `/atlas/edit` | `bin/launch-editor.cmd` |
| Rebuild after editing markdown in Obsidian | `npm run atlas:build` | `bin/atlas-build.cmd` |
| Ship to GitHub Pages | `npm run atlas:publish`, then commit and push | `bin/atlas-publish.cmd` |
| Check a player build for DM leaks | `npm run atlas:check-secrets dist` | `bin/atlas-check-secrets.cmd` |
| Check every map and image exists | `npm run atlas:audit-assets` | `bin/atlas-audit-assets.cmd` |
| Back up before a risky edit | `npm run atlas:backup` | `bin/atlas-backup.cmd` |
| Check a change is done | `npm run verify` | |
| Set up a fresh clone | `npm install` | `bin/install.cmd` |

---

## Adding a command

1. Add the script to [`package.json`](package.json).
2. Add it to this file under the right group.
3. For a Windows launcher, copy any `.cmd` in [`bin/`](bin/) and change its `call npm run <name>`
   line ([`bin/README.md`](bin/README.md) has the template).
