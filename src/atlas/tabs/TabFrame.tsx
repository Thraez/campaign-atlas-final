/**
 * Shared frame for every Creator Cockpit tab.
 *
 * Each tab exposes the same contract so the DM never has to guess what state
 * they are in:
 *   - Built from YAML  (the canon row count this tab edits)
 *   - Local draft      (how many in-browser changes are pending)
 *   - Export status    (when this tab last produced a patch)
 *   - Blocking issues  (anything from validateProject scoped to this tab)
 *
 * Tabs put their primary form / list inside `children`. Raw YAML belongs in the
 * collapsible "Advanced YAML preview" slot, never as the main UI.
 */
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, ShieldAlert, FileCode } from "lucide-react";

export interface TabFrameProps {
  title: string;
  builtFromYamlCount: number;
  localDraftCount: number;
  blockingCount?: number;
  warningCount?: number;
  lastExportAt?: number | null;
  onExport?: () => void;
  exportLabel?: string;
  exportDisabled?: boolean;
  rawYamlPreview?: string;
  children: ReactNode;
}

export function TabFrame(props: TabFrameProps) {
  const {
    title,
    builtFromYamlCount,
    localDraftCount,
    blockingCount = 0,
    warningCount = 0,
    lastExportAt,
    onExport,
    exportLabel = "Export patch",
    exportDisabled,
    rawYamlPreview,
    children,
  } = props;

  const [showRaw, setShowRaw] = useState(false);
  const exportedAgo = lastExportAt ? formatAgo(Date.now() - lastExportAt) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {onExport && (
            <Button size="sm" variant="default" onClick={onExport} disabled={exportDisabled} className="h-7 gap-1 text-xs">
              <FileCode className="h-3.5 w-3.5" /> {exportLabel}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <Badge variant="outline" title="Rows already committed in YAML canon">
            {builtFromYamlCount} from YAML
          </Badge>
          <Badge variant={localDraftCount > 0 ? "default" : "outline"} title="Edits pending in this browser">
            {localDraftCount} draft
          </Badge>
          {blockingCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> {blockingCount} blocking
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="secondary">{warningCount} warning</Badge>
          )}
          {onExport && (
            <span className="text-muted-foreground ml-auto">
              {exportedAgo ? `Exported ${exportedAgo} ago` : "No export yet"}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-3">{children}</div>
        {rawYamlPreview !== undefined && (
          <div className="border-t border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced YAML preview
            </button>
            {showRaw && (
              <pre className="px-3 pb-3 text-[10px] font-mono whitespace-pre-wrap break-all text-muted-foreground max-h-64 overflow-auto">
                {rawYamlPreview || "# (nothing to preview)"}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
