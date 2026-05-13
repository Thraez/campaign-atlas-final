/**
 * Atlas data model — three-tier canon contract.
 *
 * The atlas has THREE distinct kinds of data. Mixing them up is the #1 source
 * of bugs and lost work, so every UI surface should label things accordingly.
 *
 *  1. YAML CANON  (source of truth)
 *     - Obsidian markdown frontmatter (`atlas:` block in entity .md files)
 *     - `content/<world>/_atlas/world.yaml`
 *     - Lives in the git repo. Round-trippable with Obsidian. Survives rebuilds.
 *     - The DM should rarely *manually* edit this; the tool generates patches.
 *
 *  2. LOCAL DRAFT  (browser-only working state)
 *     - Held in React state + localStorage in `/atlas/edit`
 *     - Includes pin overrides, uploaded layer images (data URLs), map-setting
 *       tweaks, etc.
 *     - NEVER read by the runtime atlas. NEVER committed automatically.
 *     - Lifecycle: edit → "Ready to export" → exported patch → committed →
 *       (next build) folded back into YAML canon.
 *
 *  3. GENERATED RUNTIME DATA  (player-facing artifacts)
 *     - `public/atlas/atlas.json`
 *     - `public/atlas/search-index.json`
 *     - Produced by `scripts/build-atlas.ts`. Player-safe builds strip DM data.
 *     - Treat as DERIVED. Never edit by hand. Never treat as canon.
 *
 * Helpers in this module classify state for UI labels and guard exports.
 */

export type CanonTier = "yaml-canon" | "local-draft" | "generated-runtime";

export type DraftStatus =
  | "built-from-yaml" // matches YAML canon — nothing to export
  | "local-draft"     // user has unsaved edits in this browser
  | "ready-to-export" // local draft + at least one change worth exporting
  | "exported-patch"  // patch was just downloaded but not yet committed
  | "needs-commit";   // download happened, time has passed — remind user

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  "built-from-yaml": "Built from YAML",
  "local-draft":     "Local draft",
  "ready-to-export": "Ready to export",
  "exported-patch":  "Exported patch",
  "needs-commit":    "Needs commit",
};

export const DRAFT_STATUS_TONE: Record<DraftStatus, "muted" | "warn" | "info" | "ok"> = {
  "built-from-yaml": "muted",
  "local-draft":     "info",
  "ready-to-export": "warn",
  "exported-patch":  "info",
  "needs-commit":    "warn",
};

/** Decide a status from raw signals. Pure / testable. */
export function classifyDraftStatus(opts: {
  dirtyCount: number;
  lastExportAt?: number | null;
  now?: number;
}): DraftStatus {
  const now = opts.now ?? Date.now();
  if (opts.dirtyCount === 0 && !opts.lastExportAt) return "built-from-yaml";
  if (opts.lastExportAt) {
    const age = now - opts.lastExportAt;
    // After 5 min uncommitted, escalate from "exported" → "needs commit".
    if (age > 5 * 60_000) return "needs-commit";
    if (opts.dirtyCount === 0) return "exported-patch";
  }
  if (opts.dirtyCount > 0) return "ready-to-export";
  return "local-draft";
}
