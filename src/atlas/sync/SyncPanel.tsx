import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { loadSettings, saveSettings, type SyncSettings } from "./useSyncSettings";

export interface SyncPanelProps {
  onSync: (vaultRoot: string, ignoreGlobs: string[]) => void | Promise<void>;
  /** False when no DM build/entities are loaded — Sync merges against the full DM atlas. */
  hasDmBuild?: boolean;
}

export function SyncPanel({ onSync, hasDmBuild = true }: SyncPanelProps) {
  const [settings, setSettings] = useState<SyncSettings>({});
  const [vaultPath, setVaultPath] = useState("");
  const [globsText, setGlobsText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setVaultPath(s.vaultPath ?? "");
      setGlobsText((s.ignoreGlobs ?? []).join("\n"));
    });
  }, []);

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
      };
      await saveSettings(next);
      setSettings(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't save sync settings: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [settings, vaultPath, globsText]);

  const handleSync = useCallback(async () => {
    const root = vaultPath.trim();
    if (!root) return;
    setIsSyncing(true);
    try {
      const globs = globsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      await onSync(root, globs);
    } finally {
      setIsSyncing(false);
    }
  }, [vaultPath, globsText, onSync]);

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
