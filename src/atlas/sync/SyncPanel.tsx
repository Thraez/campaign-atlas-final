import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { loadSettings, saveSettings, type SyncSettings } from "./useSyncSettings";

export interface SyncPanelProps {
  onSync: (
    vaultRoot: string,
    ignoreGlobs: string[],
    candidateFolders: string[],
  ) => void | Promise<void>;
  /** False when no DM build/entities are loaded — Sync merges against the full DM atlas. */
  hasDmBuild?: boolean;
}

export interface VaultFolderPickerProps {
  folders: { name: string; noteCount: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Folder chooser for the vault. The DM ticks folders; the caller turns those
 * names into scan parameters. Deliberately not a glob box.
 */
export function VaultFolderPicker({ folders, selected, onChange }: VaultFolderPickerProps) {
  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name],
    );
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">Folders to draw from</Label>
      <ul className="space-y-1">
        {folders.map((f) => (
          <li key={f.name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id={`vault-folder-${f.name}`}
              checked={selected.includes(f.name)}
              onChange={() => toggle(f.name)}
            />
            <label htmlFor={`vault-folder-${f.name}`} className="flex-1">
              {f.name}
            </label>
            <span className="text-xs text-muted-foreground">{f.noteCount} notes</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SyncPanel({ onSync, hasDmBuild = true }: SyncPanelProps) {
  const [settings, setSettings] = useState<SyncSettings>({});
  const [vaultPath, setVaultPath] = useState("");
  const [globsText, setGlobsText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [folders, setFolders] = useState<{ name: string; noteCount: number }[]>([]);
  const [candidateFolders, setCandidateFolders] = useState<string[]>([]);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setVaultPath(s.vaultPath ?? "");
      setGlobsText((s.ignoreGlobs ?? []).join("\n"));
      setCandidateFolders(s.candidateFolders ?? []);
    });
  }, []);

  const loadFolders = useCallback(async () => {
    const root = vaultPath.trim();
    if (!root) return;
    try {
      const resp = await fetch(`/__atlas/vault-folders?vaultRoot=${encodeURIComponent(root)}`);
      const data = (await resp.json()) as
        | { ok: true; folders: { name: string; noteCount: number }[] }
        | { ok: false; error: string };
      if (data.ok) setFolders(data.folders);
      else toast.error("Couldn't read that vault folder — check the path.");
    } catch {
      toast.error("Couldn't read that vault folder — check the path.");
    }
  }, [vaultPath]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const globs = globsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const next: SyncSettings = {
        ...settings,
        vaultPath: vaultPath.trim() || undefined,
        ignoreGlobs: globs,
        candidateFolders,
      };
      await saveSettings(next);
      setSettings(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't save sync settings: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [settings, vaultPath, globsText, candidateFolders]);

  const handleSync = useCallback(async () => {
    const root = vaultPath.trim();
    if (!root) return;
    setIsSyncing(true);
    try {
      const globs = globsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      await onSync(root, globs, candidateFolders);
    } finally {
      setIsSyncing(false);
    }
  }, [vaultPath, globsText, candidateFolders, onSync]);

  const lastSync = settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Obsidian vault path</Label>
        <Input
          value={vaultPath}
          onChange={(e) => setVaultPath(e.target.value)}
          placeholder="/Users/you/Documents/My Vault"
          className="text-xs font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          Absolute path to the root of your Obsidian vault on this machine.
        </p>
      </div>

      <div className="space-y-1.5">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!vaultPath.trim()}
          onClick={() => void loadFolders()}
        >
          List folders
        </Button>
        {folders.length > 0 && (
          <VaultFolderPicker
            folders={folders}
            selected={candidateFolders}
            onChange={setCandidateFolders}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Ignore patterns (one per line)</Label>
        <Textarea
          value={globsText}
          onChange={(e) => setGlobsText(e.target.value)}
          placeholder={"Templates/**\n_assets/**\n**/*.excalidraw.md"}
          rows={4}
          className="text-xs font-mono resize-none"
        />
        <p className="text-[10px] text-muted-foreground">
          Glob patterns for vault notes to skip. Built-in ignored folders (Templates, Attachments,
          etc.) are always excluded.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? "Saving…" : "Save settings"}
        </Button>
        <Button
          size="sm"
          variant="default"
          className="flex-1 gap-1.5"
          disabled={!vaultPath.trim() || isSyncing || !hasDmBuild}
          onClick={() => void handleSync()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Scanning…" : "Sync now"}
        </Button>
      </div>

      {!hasDmBuild && (
        <p className="text-[10px] text-amber-500">
          Rebuild in DM mode first — Sync merges against the full DM atlas.
        </p>
      )}

      {lastSync && <p className="text-[10px] text-muted-foreground">Last synced: {lastSync}</p>}
    </div>
  );
}

export interface VaultSyncSummaryProps {
  changed: number;
  added: number;
  unchanged: number;
}

/**
 * Plain-language read-out after a scan. Leads with what needs attention;
 * unchanged notes are reduced to a count so a large vault stays quiet.
 */
export function VaultSyncSummary({ changed, added, unchanged }: VaultSyncSummaryProps) {
  if (changed === 0 && added === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {unchanged > 0
          ? `Nothing to bring over — ${unchanged} unchanged.`
          : "Nothing to bring over."}
      </p>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      {changed > 0 && (
        <p>
          <strong>
            {changed} {changed === 1 ? "note has" : "notes"} changed since you published{" "}
            {changed === 1 ? "it" : "them"}.
          </strong>
        </p>
      )}
      {added > 0 && (
        <p>
          {added} new {added === 1 ? "note" : "notes"} not published yet.
        </p>
      )}
      {unchanged > 0 && <p className="text-muted-foreground">{unchanged} unchanged.</p>}
    </div>
  );
}
