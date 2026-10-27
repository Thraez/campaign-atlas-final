# Move react-router to v7

Status: done

After ticket 02, `npm audit --omit=dev` still lists react-router 6.30 (moderate: an open redirect through a backslash in `<Link>` and `useNavigate`, plus an SSR advisory that doesn't apply to a static site). The fix needs react-router-dom 7, a major bump.

## Acceptance criteria

- `npm audit --omit=dev` reports no react-router advisory.
- Viewer routes, entity links, the editor route (`/atlas/edit`) and deep links on GitHub Pages (`ATLAS_BASE`) work, checked in the preview pane.
- Typecheck, lint, test:ci and `atlas:publish` pass.

## Comments

2026-10-27, branch `react-router-v7`: `react-router-dom` 6.30 replaced by `react-router` 7.18.4 (v7 ships the DOM APIs in one package); imports updated; the v7 `future` flags on `BrowserRouter` dropped (now the default). `npm audit --omit=dev`: 0 vulnerabilities. Lint, test:ci (3,228) and all 12 `atlas:publish` scans pass. Preview pane: landing, browse, tag filter, entity link into the map, back button, timeline and `/atlas/edit` all work. The GitHub Pages base path (`basename`) is unchanged; not checked on Pages itself until a publish.

Seen once in the preview, not reproduced in four tries: `Invalid LatLng (NaN, NaN)` from Leaflet's `flyTo` in `MapController` (`src/pages/AtlasViewer.tsx`), most likely the map flying while its container had zero size (the browser pane was hidden). Not router-related. A guard that skips the fly when `map.getSize()` is zero would stop it reaching the error boundary.
