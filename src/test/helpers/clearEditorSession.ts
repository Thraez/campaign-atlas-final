import { idbDelete } from "@/atlas/session/idbStore";
import { SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";

/**
 * Drop any persisted editor session so the page mounts genuinely clean.
 *
 * `fake-indexeddb/auto` is shared by every test file in a worker, and the editor
 * rehydrates its session from IndexedDB on mount. A test that leaves unsaved
 * work behind therefore makes the *next* editor test mount dirty — which any
 * assertion about the clean save state ("All changes saved", no Save button)
 * will fail on, with an error that points at the innocent test. Clearing
 * localStorage alone is not enough.
 */
export async function clearEditorSession(): Promise<void> {
  await idbDelete(SESSION_IDB_KEY);
}
