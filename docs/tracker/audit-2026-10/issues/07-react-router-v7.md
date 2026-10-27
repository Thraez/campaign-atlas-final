# Move react-router to v7

Status: ready-for-human

After ticket 02, `npm audit --omit=dev` still lists react-router 6.30 (moderate: an open redirect through a backslash in `<Link>` and `useNavigate`, plus an SSR advisory that doesn't apply to a static site). The fix needs react-router-dom 7, a major bump.

## Acceptance criteria

- `npm audit --omit=dev` reports no react-router advisory.
- Viewer routes, entity links, the editor route (`/atlas/edit`) and deep links on GitHub Pages (`ATLAS_BASE`) work, checked in the preview pane.
- Typecheck, lint, test:ci and `atlas:publish` pass.

## Comments

2026-10-27, branch `react-router-v7`: `react-router-dom` 6.30 replaced by `react-router` 7.18.4 (v7 ships the DOM APIs in one package); imports updated; the v7 `future` flags on `BrowserRouter` dropped (now the default). `npm audit --omit=dev`: 0 vulnerabilities. Lint, test:ci (3,228) and all 12 `atlas:publish` scans pass. Preview pane: landing, browse, tag filter, entity link into the map, back button, timeline and `/atlas/edit` all work. The GitHub Pages base path (`basename`) is unchanged; not checked on Pages itself until a publish.

2026-10-27, after `/code-review` (Standards and Spec, Opus): no blocking defects. Fixed on the branch: the dead `react-router-dom` entry in the `vendor-react` chunk regex (`vite.config.ts`). Typecheck now recorded: `typecheck:all` passes. Deep links checked against a player build with `ATLAS_BASE=/campaign-atlas-final/` (`vite preview`, launch config `atlas-pages-preview`): `/campaign-atlas-final/atlas/browse` and `/atlas/tag/founding` load directly, in-app links keep the prefix, and `/atlas/edit` shows the 404 page as a player build should. Left alone: `src/components/NavLink.tsx` is unused (nothing imports it), a candidate for deletion outside this ticket. The Leaflet `NaN` note moved to ticket 08.

Waiting on Isak: the OK to merge `react-router-v7` into `main` and push (which publishes). Then `done`.
