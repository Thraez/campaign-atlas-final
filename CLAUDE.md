# campaign-atlas-final

D&D world atlas: Obsidian markdown → build pipeline → `atlas.json` → dual-mode publish (player-safe static site + DM editor).

## Hard rules

- **Never hand-edit generated artifacts.** `public/atlas/atlas.json`, `.local-atlas/`, `dist/`, and `dist-ssr/` are build outputs. Edit source (YAML frontmatter, `world.yaml`, components under `src/`) and rebuild. A pre-tool hook enforces this — if it blocks you, fix the source, not the output.
- **Player builds must not contain DM content.** Before claiming a build is done, run `npm run atlas:check-secrets <dir>` and `npm run atlas:check-derived <dir>` against the output dir. `npm run atlas:publish` chains both.
- **Editor code is gated.** The visual editor (`AtlasPlacementEditor`, `/__atlas/save`) is excluded from player builds via the `__INCLUDE_EDITOR__` define in `vite.config.ts`. Don't import editor modules from player-mode entry points.

## Commands

- `npm run dev` — full editor + local save endpoint
- `npm run build` — player-safe production build (tree-shakes editor)
- `npm run atlas:build:player` — strict player atlas → `public/atlas/`
- `npm run atlas:publish` — full build + all scans
- `npm test` — Vitest
- `npm run lint` — ESLint

## When in doubt

- The source of truth for design is `README.md` (long). Skim its TOC before architectural changes.
- For changes to the build pipeline, the scan scripts under `scripts/` define the contracts the output must satisfy.