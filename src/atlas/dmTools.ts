/**
 * DM-tools visibility gate.
 *
 * The published player atlas (GitHub Pages / Lovable preview) must NOT
 * advertise editor entry points. As of the build-split work, the
 * `/atlas/edit` route and the AtlasPlacementEditor component are
 * physically excluded from player production builds via the
 * `__INCLUDE_EDITOR__` build-time flag in vite.config.ts (see src/App.tsx),
 * not merely hidden at runtime. This function still controls in-page UI
 * affordances inside editor builds (e.g. the "Edit pins" header link, the
 * BuildReportPanel) so editor builds can be deployed safely to non-DMs.
 *
 * Enable via `VITE_ENABLE_DM_TOOLS=true` in `.env.local` (or in dev).
 * In dev mode the flag defaults to ON for convenience.
 */
export function isDmToolsEnabled(): boolean {
  const flag = import.meta.env.VITE_ENABLE_DM_TOOLS;
  if (typeof flag === "string") {
    return flag === "true" || flag === "1";
  }
  return import.meta.env.DEV === true;
}
