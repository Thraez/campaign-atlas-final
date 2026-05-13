/**
 * Publish Check tab — single-pane player-safety dashboard.
 *
 * Runs validateProject over the current project + active draft state and
 * surfaces the issues grouped by severity. The DM should only publish when
 * blocking is 0; warnings are advisory; suggestions are stylistic.
 */
import { useMemo } from "react";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import { validateProject, type Issue } from "@/atlas/yaml/validateProject";
import type { PlacementOverride } from "@/atlas/yaml/buildPatches";
import { Badge } from "@/components/ui/badge";
import { TabFrame } from "./TabFrame";
import { CheckCircle2, AlertTriangle, ShieldAlert, Lightbulb } from "lucide-react";

interface Props {
  project: AtlasProject;
  draftMap?: MapDocument;
  draftPlacements: PlacementOverride[];
  draftLocalLayers: LocalLayer[];
  lastExportAt: number | null;
}

export function PublishCheckTab({ project, draftMap, draftPlacements, draftLocalLayers, lastExportAt }: Props) {
  const report = useMemo(
    () => validateProject({ project, draftPlacements, draftMap, draftLocalLayers }),
    [project, draftPlacements, draftMap, draftLocalLayers]
  );

  const grouped = useMemo(() => groupBySeverity(report.issues), [report]);
  const ready = report.counts.blocking === 0;

  return (
    <TabFrame
      title="Publish Check"
      builtFromYamlCount={project.entities.length + project.maps.length}
      localDraftCount={draftPlacements.length}
      blockingCount={report.counts.blocking}
      warningCount={report.counts.warning}
      lastExportAt={lastExportAt}
    >
      <div
        className={`rounded-md border p-3 text-xs ${
          ready ? "border-primary/30 bg-primary/5" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {ready ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
          {ready ? "Player build is safe to publish." : "Resolve blocking issues before publishing."}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {report.counts.blocking} blocking · {report.counts.warning} warning · {report.counts.suggestion} suggestion
        </div>
      </div>

      <Section title="Blocking" icon={<ShieldAlert className="h-3.5 w-3.5 text-destructive" />} issues={grouped.blocking} variant="destructive" />
      <Section title="Warnings" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />} issues={grouped.warning} variant="secondary" />
      <Section title="Suggestions" icon={<Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />} issues={grouped.suggestion} variant="outline" />

      {report.passedChecks.length > 0 && (
        <div className="rounded-md border border-border p-2 bg-card/40">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Passed</div>
          <ul className="text-xs space-y-0.5 text-muted-foreground">
            {report.passedChecks.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-primary" /> {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </TabFrame>
  );
}

function Section({
  title,
  icon,
  issues,
  variant,
}: {
  title: string;
  icon: React.ReactNode;
  issues: Issue[];
  variant: "destructive" | "secondary" | "outline";
}) {
  if (!issues.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon} {title} ({issues.length})
      </div>
      <ul className="space-y-1">
        {issues.map((i, idx) => (
          <li key={idx} className="rounded-md border border-border bg-card/50 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={variant} className="text-[9px]">{i.code}</Badge>
              {i.scope?.mapId && <span className="text-[10px] font-mono text-muted-foreground">{i.scope.mapId}</span>}
            </div>
            <div className="mt-1">{i.message}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupBySeverity(issues: Issue[]) {
  return {
    blocking: issues.filter((i) => i.severity === "blocking"),
    warning: issues.filter((i) => i.severity === "warning"),
    suggestion: issues.filter((i) => i.severity === "suggestion"),
  };
}
