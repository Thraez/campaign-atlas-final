/**
 * Where the atlas is hosted, from `atlas.config.json` `hosting` (R-01).
 *
 * The GitHub repo is public, so real vault content waits until hosting moves
 * behind Cloudflare Access and the repo goes private (plan ticket H-04).
 * Until then a real Sync from Obsidian is refused (dry runs still work) and
 * the `check-vault-content` scan fails on any synced file in `content/`.
 *
 * Fail closed: anything other than the exact string "private" is "public".
 * Browser-safe: no node imports (the Node reader is `scripts/atlas/hosting.ts`).
 */

export type Hosting = "public" | "private";

export const HOSTING_VALUES: readonly Hosting[] = ["public", "private"];

/** `hosting` from a parsed atlas config (or the value itself); missing or invalid is "public". */
export function parseHosting(value: unknown): Hosting {
  return value === "private" ? "private" : "public";
}

/** The save endpoint's error code when it refuses a sync write. */
export const HOSTING_PUBLIC_ERROR = "HostingPublic";

export const HOSTING_PUBLIC_SYNC_MESSAGE =
  'Sync from Obsidian is off: atlas.config.json has "hosting": "public". ' +
  "The repo is public; real vault content waits until hosting is private (see H-04). " +
  "A dry run still works.";

/** A real (non-dry-run) sync refused because hosting is public. */
export class HostingPublicError extends Error {
  constructor(message: string = HOSTING_PUBLIC_SYNC_MESSAGE) {
    super(message);
    this.name = "HostingPublicError";
  }
}
