/**
 * Minimal promise-wrapped IndexedDB store: one database, one object store,
 * keyed JSON blobs. Used for the durable editor-session snapshot.
 *
 * No dependency, no schema migration machinery — a versioned envelope lives
 * in the value (see sessionSnapshot.ts), not in the IDB schema.
 */
const DB_NAME = "atlas-editor";
const STORE = "session";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("indexedDB tx failed"));
    t.oncomplete = () => db.close();
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const v = await tx<T | undefined>("readonly", (s) => s.get(key));
  return v ?? null;
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  await tx("readwrite", (s) => s.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}
