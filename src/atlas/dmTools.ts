/**
 * DM-tools visibility gate.
 *
 * The published player atlas (GitHub Pages / Lovable preview) must NOT
 * advertise editor entry points. The editor route itself stays mounted so
 * local DMs can still reach it directly, but UI affordances like the
 * "Edit pins" header link are hidden unless DM tools are explicitly enabled.
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
