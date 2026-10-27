/**
 * The frontmatter parser lives in `src/atlas/content/frontmatter.ts`, beside
 * `readNote`, which reads every note with it. Re-exported here for the
 * editor and import code that already import it from this path.
 */
export {
  parseFrontmatter,
  stringifyFrontmatter,
  type ParsedFrontmatter,
} from "../content/frontmatter";
