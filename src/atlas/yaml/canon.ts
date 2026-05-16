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
