// Shared asset-size thresholds + formatting, used by both the build-time
// auditor (scripts/atlas/audit-assets.ts) and the editor's Asset Manager
// panel. Kept dependency-free (no fs/path/node built-ins) so it can be
// imported from browser-bundled editor code as well as the Node CLI.

/** Soft warning threshold for a single asset (bytes). */
export const SIZE_WARN_BYTES = 1 * 1024 * 1024;
/** Hard error threshold for a single asset (bytes). */
export const SIZE_ERROR_BYTES = 4 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}
