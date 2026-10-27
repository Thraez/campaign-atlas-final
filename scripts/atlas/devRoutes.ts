/**
 * The dev server's `/__atlas/*` paths, in one place.
 *
 * `scripts/vite-plugin-atlas-save.ts` builds its route table from these, and
 * `scripts/check-no-secrets.ts` turns them into editor-code fingerprints for
 * the player-bundle scan. This file holds plain strings only, so the scanner
 * can import it without pulling in the plugin (sharp, fs, the build).
 */

/** Every dev-only endpoint lives under this prefix and is loopback-only. */
export const DEV_API_PREFIX = "/__atlas/";

export const DEV_API_PATHS = {
  read: "/__atlas/read",
  vaultScan: "/__atlas/vault-scan",
  vaultFolders: "/__atlas/vault-folders",
  vaultImageCopy: "/__atlas/vault-image-copy",
  localEditorSettings: "/__atlas/local/editor-settings.json",
  localSyncMap: "/__atlas/local/sync-map.json",
  localWrite: "/__atlas/local-write",
  assetsImages: "/__atlas/assets/images",
  save: "/__atlas/save",
  publishPush: "/__atlas/publish-push",
  publishCheck: "/__atlas/publish-check",
} as const;
