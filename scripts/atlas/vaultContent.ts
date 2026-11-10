/**
 * What counts as vault content in `content/` while hosting is public (R-01).
 * Shared by the save endpoint (`handleSaveRequest`) and the
 * `check-vault-content` scan, so both judge a file the same way.
 *
 * Signals, cheapest first:
 *   - Sync's marker `atlas.source: vault` in the file itself;
 *   - its entity id, or the hash of its bytes, in Sync's map
 *     (`.local-atlas/sync-map.json`, machine-local);
 *   - (scan only) its text matches a note in the DM's vault, when this machine
 *     knows the vault's path (`.local-atlas/editor-settings.json` `vaultPath`).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readNote } from "../../src/atlas/content/readNote";
import { allSyncMapEntries, SyncMapFormatError } from "../../src/atlas/import/syncMap";
import { hasVaultSourceMarker } from "../../src/atlas/import/vaultSourceMarker";

export interface SyncMapSignals {
  ids: Set<string>;
  /** `syncedFileHash` values, as `hashContent` (localFsSave) makes them. */
  hashes: Set<string>;
}

export class SyncMapUnreadableError extends Error {}

/**
 * Ids and hashes from the sync map, every world's (R-14) and the old flat
 * shape alike; empty sets when there is none. Throws on invalid JSON.
 */
export function readSyncMapSignals(repoRoot: string): SyncMapSignals {
  const ids = new Set<string>();
  const hashes = new Set<string>();
  const mapPath = path.join(repoRoot, ".local-atlas", "sync-map.json");
  if (!fs.existsSync(mapPath)) return { ids, hashes };
  let map: unknown;
  try {
    map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  } catch (e) {
    throw new SyncMapUnreadableError(
      `.local-atlas/sync-map.json is not valid JSON (${(e as Error).message})`,
    );
  }
  let entries: ReturnType<typeof allSyncMapEntries>;
  try {
    entries = allSyncMapEntries(map);
  } catch (e) {
    // A map Sync itself can't read gives the guard no ids: refuse, never pass.
    if (!(e instanceof SyncMapFormatError)) throw e;
    throw new SyncMapUnreadableError(`.local-atlas/sync-map.json can't be read: ${e.message}`);
  }
  for (const entry of entries) {
    if (typeof entry?.id === "string" && entry.id) ids.add(entry.id);
    if (typeof entry?.syncedFileHash === "string") hashes.add(entry.syncedFileHash);
  }
  return { ids, hashes };
}

/** True when the note carries Sync's marker or its id is in the sync map. */
export function isVaultNote(raw: string, relPath: string, signals: SyncMapSignals): boolean {
  const note = readNote(raw, relPath);
  return hasVaultSourceMarker(note.atlas) || signals.ids.has(note.id);
}

// ── Vault fingerprints (scan only) ──────────────────────────────────────────

/** Bodies shorter than this (after trimming) are too generic to match on. */
const MIN_BODY_CHARS = 40;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const normalize = (s: string) => s.replace(/\r\n?/g, "\n");

/**
 * Fingerprints of one note: the hash of its whole text and of its body (the
 * text after the frontmatter, trimmed), both with line endings normalized.
 * The body hash catches a copy whose frontmatter Sync rewrote (title, id, the
 * marker). Short bodies give no body hash.
 */
export function noteFingerprints(raw: string, relPath: string): string[] {
  const text = normalize(raw);
  const out = [`file:${sha(text)}`];
  const body = readNote(text, relPath).body.trim();
  if (body.length >= MIN_BODY_CHARS) out.push(`body:${sha(body)}`);
  return out;
}

export type VaultFingerprints =
  | { ok: true; vaultRoot: string; prints: Set<string>; notes: number }
  | { ok: false; reason: string };

/** The vault path this machine's editor saved, or null. */
export function savedVaultPath(repoRoot: string): string | null {
  try {
    const s = JSON.parse(
      fs.readFileSync(path.join(repoRoot, ".local-atlas", "editor-settings.json"), "utf8"),
    ) as { vaultPath?: unknown };
    return typeof s.vaultPath === "string" && s.vaultPath.trim() ? s.vaultPath.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Fingerprints of every `.md` note in the vault this machine knows about.
 * Skips dot-folders (`.obsidian/`, `.trash/`, `.git/`) and symlinks; reads
 * only `.md` files, so attachments are never opened.
 */
export function readVaultFingerprints(repoRoot: string): VaultFingerprints {
  const vaultRoot = savedVaultPath(repoRoot);
  if (!vaultRoot)
    return { ok: false, reason: "no vault path in .local-atlas/editor-settings.json" };
  let isDir = false;
  try {
    isDir = fs.statSync(vaultRoot).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return { ok: false, reason: `vault path ${vaultRoot} isn't a readable folder` };
  const prints = new Set<string>();
  let notes = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        let raw: string;
        try {
          raw = fs.readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        notes++;
        for (const p of noteFingerprints(raw, path.relative(vaultRoot, abs))) prints.add(p);
      }
    }
  };
  walk(vaultRoot);
  return { ok: true, vaultRoot, prints, notes };
}
