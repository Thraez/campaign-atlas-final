# Move react-router to v7

Status: ready-for-agent

After ticket 02, `npm audit --omit=dev` still lists react-router 6.30 (moderate: an open redirect through a backslash in `<Link>` and `useNavigate`, plus an SSR advisory that doesn't apply to a static site). The fix needs react-router-dom 7, a major bump.

## Acceptance criteria

- `npm audit --omit=dev` reports no react-router advisory.
- Viewer routes, entity links, the editor route (`/atlas/edit`) and deep links on GitHub Pages (`ATLAS_BASE`) work, checked in the preview pane.
- Typecheck, lint, test:ci and `atlas:publish` pass.
