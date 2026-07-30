import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { buildImportPlan } from "../mapImport";
import { IssueList } from "./IssueList";

export function PreviewStep({
  plan,
  yamlPreview,
  blocking,
  warnings,
}: {
  plan: ReturnType<typeof buildImportPlan>;
  yamlPreview: string;
  blocking: { message: string }[];
  warnings: { message: string }[];
}) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="space-y-3 p-1">
      {plan.maps.map((m) => (
        <div key={m.id} className="rounded-md border border-border p-3 bg-card/50">
          <div className="text-sm font-medium flex items-center gap-2">
            {m.name}{" "}
            <Badge variant="outline" className="text-[9px] font-mono">
              {m.id}
            </Badge>
            {m.replaces && (
              <Badge variant="secondary" className="text-[9px]">
                replaces existing
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {m.width}×{m.height} · world: {m.worldId} · {m.layers.length} layer(s)
          </div>
          <ul className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
            {m.layers.map((l) => (
              <li key={l.id}>
                <span className="font-mono">{l.id}</span> → {l.src} ({l.width}×{l.height})
              </li>
            ))}
          </ul>
        </div>
      ))}
      {blocking.length > 0 && (
        <IssueList title="Blocking" items={blocking.map((i) => i.message)} variant="destructive" />
      )}
      {warnings.length > 0 && (
        <IssueList title="Warnings" items={warnings.map((i) => i.message)} variant="secondary" />
      )}
      <div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showRaw ? "Hide" : "Show"} advanced YAML preview
        </button>
        {showRaw && (
          <pre className="mt-2 p-2 rounded bg-muted text-[10px] font-mono whitespace-pre-wrap max-h-80 overflow-auto">
            {yamlPreview}
          </pre>
        )}
      </div>
    </div>
  );
}
