// Single source of truth lives in src/ so the browser preview and the build
// use byte-identical stripping. Keep this path for build-side imports.
export { stripDmBlocks, stripDmFromShippingString } from "../../src/atlas/content/stripDmBlocks";
