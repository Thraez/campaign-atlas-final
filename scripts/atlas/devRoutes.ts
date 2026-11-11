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
  localSyncMapWorld: "/__atlas/local/sync-map/world",
  localWrite: "/__atlas/local-write",
  assetsImages: "/__atlas/assets/images",
  save: "/__atlas/save",
  cleanAsset: "/__atlas/clean-asset",
  publishPush: "/__atlas/publish-push",
  publishCheck: "/__atlas/publish-check",
} as const;

/**
 * The shared canvas's dev harness (R-31): the page and the read-only server of
 * the v2 campaign stores it loads. Served by
 * `scripts/vite-plugin-campaign-stores.ts`, dev server only, and fingerprinted
 * like the routes above, so a player build that carries them fails the scan.
 */
export const DEV_CANVAS_PATHS = {
  /** GET: `{ campaigns: string[] }`, the v2 campaign list. */
  campaignStores: "/__atlas/campaign-stores",
  /** GET `<prefix><id>/<file>`: one file of `<outputDir>/<id>/atlas/`. */
  campaignStorePrefix: "/__atlas/campaign-store/",
  /** The harness page (client route, `__INCLUDE_EDITOR__` only). */
  canvasPage: "/__canvas",
} as const;
