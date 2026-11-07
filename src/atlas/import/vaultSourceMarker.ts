/**
 * The marker Sync from Obsidian stamps on every note it writes into
 * `content/` (R-01): `atlas.source: vault`. It lets `check-vault-content`
 * spot synced notes from any checkout (a fresh clone, the PC, CI), where the
 * machine-local sync map doesn't exist (plan ticket H-03).
 *
 * The player projection drops all frontmatter (`projectEntityForPlayer`), so
 * the marker never reaches players. Sync's own "unchanged" test hashes the
 * vault note, not the atlas copy, so the stamp is no perpetual diff.
 */

export const VAULT_SOURCE_KEY = "source";
export const VAULT_SOURCE_VALUE = "vault";

/** True when an `atlas:` frontmatter block carries Sync's marker. */
export function hasVaultSourceMarker(atlas: unknown): boolean {
  return (
    typeof atlas === "object" &&
    atlas !== null &&
    !Array.isArray(atlas) &&
    (atlas as Record<string, unknown>)[VAULT_SOURCE_KEY] === VAULT_SOURCE_VALUE
  );
}
