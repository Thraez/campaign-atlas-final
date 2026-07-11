import { useCallback, useEffect, useRef, useState } from "react";
import yaml from "js-yaml";
import { Key, Copy, Check, Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { saveAtlasPatchToLocalFs, hashContent } from "@/atlas/save/localFsSave";

interface CharacterRow { name: string; key: string }

interface Props { worldDir: string }

export function CharacterKeysPanel({ worldDir }: Props) {
  const keysPath = `${worldDir}/_dm/character-keys.yaml`;
  const [rows, setRows] = useState<CharacterRow[]>([]);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/__atlas/read?path=${encodeURIComponent(keysPath)}`);
      if (res.status === 404) {
        setRows([]);
        setBaseHash(null);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { contents?: unknown };
      if (typeof body.contents !== "string") return;
      const parsed = yaml.load(body.contents);
      if (parsed && typeof parsed === "object") {
        const loaded = Object.entries(parsed as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([name, key]) => ({ name, key: key as string }));
        setRows(loaded);
      }
      const h = await hashContent(body.contents);
      setBaseHash(h);
    } catch {
      // dev server not running or file unreadable — start empty
    } finally {
      setLoading(false);
    }
  }, [keysPath]);

  useEffect(() => { void load(); }, [load]);

  const generate = (): string =>
    Array.from(crypto.getRandomValues(new Uint8Array(10)))
      .map((b) => b.toString(36))
      .join("");

  const toYamlObj = (r: CharacterRow[]): Record<string, string> => {
    const obj: Record<string, string> = {};
    for (const row of r) {
      if (row.name.trim()) obj[row.name.trim()] = row.key;
    }
    return obj;
  };

  const persist = async (next: CharacterRow[]) => {
    const obj = toYamlObj(next);
    const content = yaml.dump(obj);
    setSaving(true);
    try {
      await saveAtlasPatchToLocalFs([{
        path: keysPath,
        content,
        kind: "world-yaml",
        baseHash,
      }]);
      const h = await hashContent(content);
      setBaseHash(h);
      toast.success("Character keys saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => setRows((r) => [...r, { name: "", key: generate() }]);

  const updateName = (i: number, name: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, name } : row)));

  const regenerateKey = (i: number) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, key: generate() } : row)));

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const copyKey = (i: number) => {
    void navigator.clipboard.writeText(rows[i].key).then(() => {
      setCopiedIdx(i);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  if (loading) {
    return <div className="p-4 text-xs text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-1">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5" /> Character Keys
        </div>
        <div className="text-[10px] text-muted-foreground">
          Each player gets one key for their character. Share it privately out-of-band.
          If they lose it, come back here — the same key is always shown again.
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {rows.length === 0 && (
          <div className="text-[10px] text-muted-foreground py-2">No characters yet — add one below.</div>
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
                {copiedIdx === i
                  ? <Check className="h-3 w-3 text-green-400" />
                  : <Copy className="h-3 w-3" />}
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

      <div className="p-3 border-t border-border">
        <button
          type="button"
          disabled={saving}
          onClick={() => void persist(rows)}
          className="w-full h-7 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save keys"}
        </button>
      </div>
    </div>
  );
}
