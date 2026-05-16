// Single source of truth lives in src/ so the browser projection and the build
// use byte-identical wikilink tokenisation/rendering. Keep this path for build-side imports.
export { tokenizeWikilinks, renderLinkTokens } from "../../src/atlas/content/parseWikilinks";
export type { ResolveContext } from "../../src/atlas/content/parseWikilinks";
