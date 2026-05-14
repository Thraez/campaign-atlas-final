/**
 * Player-local notes — purely browser-side per-entity scratchpad.
 *
 * Notes are stored in localStorage under a single key. They are NEVER
 * uploaded, included in any build artifact, or shared between users. A
 * different browser, profile, or device sees a different set of notes.
 *
 * Every read/write is wrapped in try/catch so that a corrupt blob, full
 * storage quota, or a hostile sandbox (private browsing) degrades gracefully
 * to an empty in-memory map rather than crashing the viewer.
 */

const STORAGE_KEY = "atlas-player-notes-v1";

export interface PlayerNote {
  /** Free-form player-authored text. */
  text: string;
  /** ISO 8601 timestamp of the last save. */
  updatedAt: string;
}

export type NoteMap = Record<string, PlayerNote>;

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    // Touch the storage to confirm it's actually writable (private browsing
    // sometimes exposes the API but throws on the first setItem).
    const probe = "__atlas_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadAllNotes(): NoteMap {
  const s = getStorage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: NoteMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const n = v as { text?: unknown; updatedAt?: unknown };
      if (typeof n.text !== "string" || typeof n.updatedAt !== "string") continue;
      out[k] = { text: n.text, updatedAt: n.updatedAt };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadNote(entityId: string): PlayerNote | null {
  if (!entityId) return null;
  const map = loadAllNotes();
  return map[entityId] ?? null;
}

export function saveNote(entityId: string, text: string): void {
  if (!entityId) return;
  const s = getStorage();
  if (!s) return;
  try {
    const map = loadAllNotes();
    const trimmed = text;
    if (trimmed === "") {
      delete map[entityId];
    } else {
      map[entityId] = { text: trimmed, updatedAt: new Date().toISOString() };
    }
    s.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or serialization issue — drop silently. The viewer keeps working.
  }
}

export function deleteNote(entityId: string): void {
  if (!entityId) return;
  saveNote(entityId, "");
}

export function exportNotesJson(): string {
  const map = loadAllNotes();
  return JSON.stringify(
    {
      _format: "atlas-player-notes",
      _version: 1,
      exportedAt: new Date().toISOString(),
      notes: map,
    },
    null,
    2
  );
}

export interface ImportResult {
  imported: number;
  errors: string[];
}

export function importNotesJson(json: string): ImportResult {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    errors.push(`Not valid JSON: ${(e as Error).message}`);
    return { imported: 0, errors };
  }
  if (!parsed || typeof parsed !== "object") {
    errors.push("Top-level must be an object");
    return { imported: 0, errors };
  }
  const root = parsed as Record<string, unknown>;
  // Accept both the wrapped export shape and a raw NoteMap.
  const candidate =
    root._format === "atlas-player-notes" && root.notes && typeof root.notes === "object"
      ? (root.notes as Record<string, unknown>)
      : (root as Record<string, unknown>);
  const existing = loadAllNotes();
  let imported = 0;
  for (const [k, v] of Object.entries(candidate)) {
    if (k.startsWith("_") || k === "exportedAt") continue;
    if (!v || typeof v !== "object") {
      errors.push(`Skipped "${k}": not an object`);
      continue;
    }
    const n = v as { text?: unknown; updatedAt?: unknown };
    if (typeof n.text !== "string") {
      errors.push(`Skipped "${k}": missing text`);
      continue;
    }
    existing[k] = {
      text: n.text,
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
    };
    imported += 1;
  }
  const s = getStorage();
  if (!s) {
    errors.push("localStorage is unavailable — import not persisted");
    return { imported: 0, errors };
  }
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    errors.push(`Save failed: ${(e as Error).message}`);
    return { imported: 0, errors };
  }
  return { imported, errors };
}

/**
 * Test-only helper to reset state between cases. Not used by the viewer.
 */
export function _resetNotesForTests(): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
