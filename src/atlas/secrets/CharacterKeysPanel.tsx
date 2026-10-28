import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Key, Copy, Check, Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { saveAtlasPatchToLocalFs, hashContent, ConflictError } from "@/atlas/save/localFsSave";
import { copyToClipboard } from "@/lib/clipboard";
import {
  parseCharacterKeys,
  rebaseCharacterKeys,
  serializeCharacterKeys,
  type CharacterKeyEntry,
  type CharacterKeysRebase,
} from "./characterKeysFile";

// Ticket 39 consolidates source-file reads (canonClient.read); move this onto it then.
/** The file's text, or null when it doesn't exist yet. Throws, with a reason fit for the DM, when it can't be read. */
async function readKeysFile(keysPath: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`/__atlas/read?path=${encodeURIComponent(keysPath)}`);
  } catch {
    throw new Error("the dev server couldn't be reached");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const body = (await res.json()) as { contents?: unknown };
  if (typeof body.contents !== "string")
    throw new Error("the server's answer had no file contents");
  return body.contents;
}

/** What the panel tells the DM after a save conflict. */
type ConflictNotice =
  | { kind: "merged"; deleted: boolean; rebase: CharacterKeysRebase }
  | { kind: "unreadable"; reason: string };

/**
 * - `load-failed`: the file couldn't be read; the list is hidden and Save is
 *   off, so an empty list can never be written over it.
 * - `unsupported`: entries that aren't a name and a key (nested maps, lists,
 *   no key); saving would drop them, so Save is off. Can follow a conflict.
 * - `conflict`: a save was refused and the DM's rows were merged onto the
 *   file as it is now; Save is on and overwrites what the notice lists.
 */
type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "load-failed"; reason: string }
  | { kind: "unsupported"; names: string[]; conflict: ConflictNotice | null }
  | { kind: "conflict"; notice: ConflictNotice };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  worldDir: string;
}

export function CharacterKeysPanel({ worldDir }: Props) {
  const keysPath = `${worldDir}/_dm/character-keys.yaml`;
  const [rows, setRows] = useState<CharacterKeyEntry[]>([]);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The file as last read or saved: the base a conflict merges against.
  const diskRef = useRef<CharacterKeyEntry[]>([]);

  const load = useCallback(async () => {
    setStatus({ kind: "loading" });
    try {
      const text = await readKeysFile(keysPath);
      if (text === null) {
        setRows([]);
        setBaseHash(null);
        diskRef.current = [];
        setStatus({ kind: "ready" });
        return;
      }
      const parsed = parseCharacterKeys(text);
      if (!parsed.ok) {
        setStatus({ kind: "load-failed", reason: parsed.error });
        return;
      }
      setRows(parsed.entries);
      setBaseHash(await hashContent(text));
      diskRef.current = parsed.entries;
      setStatus(
        parsed.unsupported.length > 0
          ? { kind: "unsupported", names: parsed.unsupported, conflict: null }
          : { kind: "ready" },
      );
    } catch (e) {
      setStatus({ kind: "load-failed", reason: errorText(e) });
    }
  }, [keysPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = (): string =>
    Array.from(crypto.getRandomValues(new Uint8Array(10)))
      .map((b) => b.toString(36))
      .join("");

  const persist = async (next: CharacterKeyEntry[]) => {
    const content = serializeCharacterKeys(next);
    setSaving(true);
    try {
      await saveAtlasPatchToLocalFs([
        {
          path: keysPath,
          content,
          kind: "world-yaml",
          baseHash,
        },
      ]);
      const h = await hashContent(content);
      setBaseHash(h);
      const saved = parseCharacterKeys(content);
      diskRef.current = saved.ok ? saved.entries : [];
      setStatus({ kind: "ready" });
      toast.success("Character keys saved");
    } catch (e) {
      if (e instanceof ConflictError) {
        await recoverFromConflict(next, e.reason === "missing-base");
        return;
      }
      toast.error(`Save failed: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // The file changed on disk under the DM's rows. Re-read it, keep what the
  // DM changed, take the rest from disk, adopt the new baseHash and say what
  // moved, so the next Save goes through.
  const recoverFromConflict = async (mine: CharacterKeyEntry[], deleted: boolean) => {
    const unreadable = (reason: string) =>
      setStatus({ kind: "conflict", notice: { kind: "unreadable", reason } });
    let text: string | null;
    try {
      text = await readKeysFile(keysPath);
    } catch (e) {
      unreadable(errorText(e));
      return;
    }
    const parsed = text === null ? null : parseCharacterKeys(text);
    if (parsed && !parsed.ok) {
      unreadable(parsed.error);
      return;
    }
    const theirs = parsed ? parsed.entries : [];
    const rebase = rebaseCharacterKeys(diskRef.current, mine, theirs);
    setRows(rebase.rows);
    setBaseHash(text === null ? null : await hashContent(text));
    diskRef.current = theirs;
    const notice: ConflictNotice = { kind: "merged", deleted: deleted || text === null, rebase };
    const names = parsed ? parsed.unsupported : [];
    setStatus(
      names.length > 0
        ? { kind: "unsupported", names, conflict: notice }
        : { kind: "conflict", notice },
    );
  };

  const addRow = () => setRows((r) => [...r, { name: "", key: generate() }]);

  const updateName = (i: number, name: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, name } : row)));

  const regenerateKey = (i: number) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, key: generate() } : row)));

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const copyKey = (i: number) => {
    void copyToClipboard(rows[i].key).then((ok) => {
      if (!ok) {
        toast.error("Could not copy key");
        return;
      }
      setCopiedIdx(i);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  if (status.kind === "loading") {
    return <div className="p-4 text-xs text-muted-foreground">Loading…</div>;
  }

  const conflict =
    status.kind === "conflict"
      ? status.notice
      : status.kind === "unsupported"
        ? status.conflict
        : null;
  const saveBlocked = status.kind === "load-failed" || status.kind === "unsupported";

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-1">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5" /> Character Keys
        </div>
        <div className="text-[10px] text-muted-foreground">
          Each player gets one key for their character. Share it privately out-of-band. If they lose
          it, come back here — the same key is always shown again.
        </div>
      </div>

      {status.kind === "load-failed" && (
        <RetryAlert onRetry={() => void load()}>
          Couldn't load the character keys ({status.reason}). Saving is off, so an empty list can't
          overwrite the file.
        </RetryAlert>
      )}

      {conflict && <ConflictBanner notice={conflict} />}

      {status.kind === "unsupported" && (
        <RetryAlert onRetry={() => void load()}>
          Not every entry in character-keys.yaml is a name and a key: {status.names.join(", ")}.
          Saving is off so they aren't lost. Fix them in the file by hand, then Retry.
        </RetryAlert>
      )}

      {status.kind !== "load-failed" && (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {rows.length === 0 && (
            <div className="text-[10px] text-muted-foreground py-2">
              No characters yet — add one below.
            </div>
          )}
          {rows.map((row, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateName(i, e.target.value)}
                  placeholder="Character name"
                  className="flex-1 h-7 text-xs border border-border rounded bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label="Character name"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="h-7 px-1.5 rounded border border-border hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center"
                  title="Remove this character"
                  aria-label="Remove character"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <code
                  className="flex-1 text-[10px] font-mono bg-muted px-2 py-1 rounded truncate select-all cursor-text"
                  title={row.key}
                >
                  {row.key}
                </code>
                <button
                  type="button"
                  onClick={() => copyKey(i)}
                  className="h-6 px-1.5 rounded border border-border hover:bg-accent flex items-center gap-1 text-[10px]"
                  title="Copy key to clipboard"
                  aria-label="Copy key"
                >
                  {copiedIdx === i ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => regenerateKey(i)}
                  className="h-6 px-1.5 rounded border border-border hover:bg-accent flex items-center gap-1 text-[10px] text-muted-foreground"
                  title="Generate a new key — player must be re-told the new key"
                  aria-label="Regenerate key"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="w-full h-7 text-xs border border-dashed border-border rounded hover:bg-accent flex items-center justify-center gap-1 text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add character
          </button>
        </div>
      )}

      <div className="p-3 border-t border-border">
        <button
          type="button"
          disabled={saving || saveBlocked}
          onClick={() => void persist(rows)}
          className="w-full h-7 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save keys"}
        </button>
      </div>
    </div>
  );
}

function RetryAlert({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <div role="alert" className="m-3 rounded border border-amber-500/60 p-2 space-y-2 text-xs">
      <p>{children}</p>
      <button type="button" className="h-7 px-2 text-xs rounded border" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

const listed = (label: string, names: string[]) =>
  names.length > 0 ? (
    <p>
      {label}: {names.join(", ")}.
    </p>
  ) : null;

function ConflictBanner({ notice }: { notice: ConflictNotice }) {
  if (notice.kind === "unreadable") {
    return (
      <div role="alert" className="m-3 rounded border border-amber-500/60 p-2 space-y-1 text-xs">
        <p>
          character-keys.yaml changed on disk after you opened it, so Save was refused, and it can't
          be read now ({notice.reason}). Your edits are still here; Save again to retry.
        </p>
      </div>
    );
  }
  const { rebase, deleted } = notice;
  const nothingMoved = rebase.added.length + rebase.removed.length + rebase.changed.length === 0;
  return (
    <div role="alert" className="m-3 rounded border border-amber-500/60 p-2 space-y-1 text-xs">
      <p>
        {deleted
          ? "character-keys.yaml was deleted or moved on disk after you opened it, so Save was refused."
          : "character-keys.yaml changed on disk after you opened it, so Save was refused."}{" "}
        Your edits are still here, merged with the file as it is now.
      </p>
      {listed("Added outside the editor", rebase.added)}
      {listed("Removed outside the editor", rebase.removed)}
      {listed("Changed outside the editor", rebase.changed)}
      {nothingMoved && <p>No character changed outside the editor, only the file's layout.</p>}
      {rebase.overwritten.length > 0 && (
        <p>
          Saving again overwrites the outside changes to {rebase.overwritten.join(", ")} with yours.
        </p>
      )}
    </div>
  );
}
