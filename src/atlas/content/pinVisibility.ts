/**
 * The visibility a v1 pin loads with: `dm` when its note is secret (not
 * player-visible, or `publish: false`) or its placement sits behind a secret
 * lock; otherwise the note's own visibility. One rule for the build's loader
 * (`scripts/atlas/loadAtlasModel.ts`) and the old Publish Check
 * (`src/atlas/yaml/resolveProject.ts`). Pure and browser-safe.
 */
export function v1PinVisibility(
  noteSecret: boolean,
  noteVisibility: string,
  secretId: string | undefined,
): string {
  return noteSecret || secretId !== undefined ? "dm" : noteVisibility;
}
