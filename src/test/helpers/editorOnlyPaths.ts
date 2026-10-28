/**
 * Paths under `src/` that hold only DM-editor code (`/atlas/edit` and its dev-server endpoints).
 * `src/test/build/player-import-graph.test.ts` proves none of them is reachable from the player
 * entry, so other guards may treat them as excluded from player builds.
 *
 * Each folder was checked against its contents:
 * - atlas/editor: placement-editor state, draft hooks, toolbars and pickers.
 * - atlas/tabs: the editor's side tabs (entities, fog, regions, routes, soundscape, publish check).
 * - atlas/categories: entity and category edit panels.
 * - atlas/sound-editor: sound-area drawing and soundscape drafts.
 * - atlas/save: save batches and the local file-system writer behind `/__atlas/save`.
 * - atlas/sync: the "Sync from Obsidian" panel.
 * - atlas/import: Obsidian/markdown import, staging and the map import wizard.
 * - atlas/publish: build report, published diff and the publish flow.
 * - atlas/session: the editor's IndexedDB session snapshot, save status and discard modal.
 * - pages/AtlasPlacementEditor.tsx: the editor page itself.
 *
 * Known gap: some editor-only files sit in mixed folders that the player also uses, so they are
 * not listed here: `atlas/fog/useFogDraft.ts`, `atlas/MapLayerEditableOverlay.tsx` and
 * `atlas/useUndoStack.ts`.
 *
 * Paths use `/` and are relative to `src/`; folders end in `/`.
 */
export const EDITOR_ONLY_PATHS: readonly string[] = [
  "atlas/editor/",
  "atlas/tabs/",
  "atlas/categories/",
  "atlas/sound-editor/",
  "atlas/save/",
  "atlas/sync/",
  "atlas/import/",
  "atlas/publish/",
  "atlas/session/",
  "pages/AtlasPlacementEditor.tsx",
];

/** True when `srcRelative` (relative to `src/`, any separator) is in an editor-only path. */
export function isEditorOnlyPath(srcRelative: string): boolean {
  const normalized = srcRelative.split("\\").join("/");
  return EDITOR_ONLY_PATHS.some((prefix) => normalized.startsWith(prefix));
}
