import { FileCode, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportStep({
  onDownload,
  blocking,
  planSummary,
}: {
  onDownload: () => void;
  blocking: number;
  planSummary: string;
}) {
  return (
    <div className="p-1 space-y-3">
      <div className="rounded-md border border-border p-4 bg-card/50">
        <div className="text-sm font-medium flex items-center gap-2">
          <FileCode className="h-4 w-4 text-primary" /> Package contents
        </div>
        <ul className="mt-2 text-xs space-y-1 text-muted-foreground">
          <li>
            • <span className="font-mono">world-map-patch.yaml</span> — paste/merge into{" "}
            <span className="font-mono">content/&lt;world&gt;/_atlas/world.yaml</span>
          </li>
          <li>
            • <span className="font-mono">atlas-assets.zip</span> — image files at their target
            paths
          </li>
          <li>
            • <span className="font-mono">README-apply-map-import.md</span> — step-by-step apply
            guide
          </li>
        </ul>
        <div className="mt-3 text-[11px] text-muted-foreground">{planSummary}</div>
      </div>
      <Button onClick={onDownload} disabled={blocking > 0} className="w-full gap-1">
        <Package className="h-4 w-4" /> Download package
      </Button>
      {blocking > 0 && (
        <p className="text-[11px] text-destructive">
          Resolve {blocking} blocking issue(s) in the Preview step first.
        </p>
      )}
    </div>
  );
}
