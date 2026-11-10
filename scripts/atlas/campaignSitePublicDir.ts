/**
 * The public dir a Vite site build copies (R-19, ADR-0004).
 *
 * Vite copies all of its `publicDir` into the site. v1's site build reads
 * `public/` (the app's static files and `public/atlas/`). A v2 campaign's site
 * build reads a dir `atlas:publish` stages for it (`stageCampaignPublicDir`):
 * the app's static files and that campaign's store as `atlas/`, nothing of
 * another campaign and nothing of `public/atlas/`. The publish passes that
 * dir in `CAMPAIGN_PUBLIC_DIR_ENV`.
 *
 * Kept free of other imports: `vite.config.ts` loads it.
 */

/** The env var naming a campaign site build's staged public dir. */
export const CAMPAIGN_PUBLIC_DIR_ENV = "ATLAS_CAMPAIGN_PUBLIC_DIR";

/**
 * `publicDir` for a Vite build: `public` unless a campaign public dir is set.
 * A campaign site is a player site, so an editor build with one throws.
 */
export function sitePublicDir(
  env: Record<string, string | undefined>,
  includeEditor: boolean,
): string {
  const staged = env[CAMPAIGN_PUBLIC_DIR_ENV];
  if (!staged) return "public";
  if (includeEditor) {
    throw new Error(
      `${CAMPAIGN_PUBLIC_DIR_ENV} is set in an editor build: a campaign site is a player build only`,
    );
  }
  return staged;
}
