// Single source of truth lives in src/ so the browser preview, the runtime
// Save paths, and the build all derive byte-identical ids/slugs from a title.
// Keep this path for build-side imports (build-atlas.ts imports from here).
export { slugify } from "../../src/atlas/content/slugify";
