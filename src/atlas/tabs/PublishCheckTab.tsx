/**
 * Publish Check tab — single-pane player-safety dashboard.
 *
 * Shows issues grouped by category with per-issue actions so the DM can
 * navigate to the affected entity/map, see a generated YAML fix, or export
 * the whole publish report. The tab never authors YAML on its own — it just
 * surfaces what `validateProject` found and routes the DM to the right tab.
 */
import { useMemo, useState } from "react";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import {
  validateProject,
  buildPublishReport,
  CATEGORY_LABELS,
  type Issue,
  type IssueCategory,
  type ValidationReport,
} from "@/atlas/yaml/validateProject";
import type { PlacementOverride } from "@/atlas/yaml/buildPatches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabFrame } from "./TabFrame";
import { downloadText } from "./download";
import { BuildReportPanel } from "@/atlas/publish/BuildReportPanel";
import { PublishedDiffPanel } from "@/atlas/publish/PublishedDiffPanel";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  FileDown,
} from "lucide-react";

interface Props {
  project: AtlasProject;
  draftMap?: MapDocument;
  draftPlacements: PlacementOverride[];
  draftLocalLayers: LocalLayer[];
  /** Optional navigation hooks injected by the editor. */
  onGoToMap?: (mapId: string) => void;
  onGoToEntity?: (entityId: string) => void;
}

const SEVERITY_META = {
  blocking: { label: "Blocking", icon: ShieldAlert, badge: "destructive" as const, tone: "text-destructive" },
  warning: { label: "Warnings", icon: AlertTriangle, badge: "secondary" as const, tone: "text-amber-500" },
  suggestion: { label: "Suggestions", icon: Lightbulb, badge: "outline" as const, tone: "text-muted-foreground" },
};

export function PublishCheckTab({
  project,
  draftMap,
  draftPlacements,
  draftLocalLayers,
  onGoToMap,
  onGoToEntity,
}: Props) {
  const report = useMemo<ValidationReport>(
    () => validateProject({ project, draftPlacements, draftMap, draftLocalLayers }),
    [project, draftPlacements, draftMap, draftLocalLayers]
  );

  const ready = report.counts.blocking === 0;

  const downloadReport = () => {
    const md = buildPublishReport(report);
    const filename = `atlas-publish-check-${new Date().toISOString().slice(0, 10)}.md`;
    downloadText(filename, md, "text/markdown");
  };

  return (
    <TabFrame
      title="Publish Check"
      builtFromYamlCount={project.entities.length + project.maps.length}
      localDraftCount={draftPlacements.length + report.meta.pendingAssetCount}
      blockingCount={report.counts.blocking}
      warningCount={report.counts.warning}
    >
      {/* Top status banner */}
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

      {/* Snapshot meta */}
      <div className="rounded-md border border-border bg-card/40 p-2.5 text-[10px] text-muted-foreground space-y-0.5">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span><strong className="text-foreground">{report.meta.entityCount}</strong> entities</span>
          <span><strong className="text-foreground">{report.meta.mapCount}</strong> maps</span>
          <span><strong className="text-foreground">{report.meta.draftPlacementCount}</strong> draft pins</span>
          <span><strong className="text-foreground">{report.meta.pendingAssetCount}</strong> pending uploads</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          {report.meta.atlasVersion && <span>Atlas <code className="font-mono">{report.meta.atlasVersion}</code></span>}
          {report.meta.builtAt && <span>Built {new Date(report.meta.builtAt).toLocaleString()}</span>}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={downloadReport} className="h-7 gap-1 text-xs">
          <FileDown className="h-3.5 w-3.5" /> Download report
        </Button>
      </div>

      {/* Diff vs last published — fetches .last-published.json snapshot
          written by `npm run atlas:snapshot` and compares to the loaded
          atlas.json. Answers "what will players see that's new?" */}
      <div className="pt-1">
        <PublishedDiffPanel current={project} />
      </div>

      {/* Build/CI report (loaded from public/atlas/atlas.json buildReport).
          Reflects what the last shipped build flagged — the in-memory
          validator above covers the live editor draft. */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Last build report
        </div>
        <BuildReportPanel
          report={project.buildReport}
          atlasVersion={project.version}
          publishedAt={project.publishedAt}
        />
      </div>

      {/* Categorized issue list */}
      {(["safety", "yaml", "map", "draft"] as IssueCategory[]).map((cat) => (
        <CategorySection
          key={cat}
          category={cat}
          issues={report.issues.filter((i) => (i.category ?? "yaml") === cat)}
          onGoToMap={onGoToMap}
          onGoToEntity={onGoToEntity}
        />
      ))}

      {/* Passed list */}
      {report.passedChecks.length > 0 && (
        <CollapsibleBlock
          title={`Passed (${report.passedChecks.length})`}
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
          defaultOpen={false}
        >
          <ul className="text-xs space-y-0.5 text-muted-foreground">
            {report.passedChecks.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-primary" /> {c}
              </li>
            ))}
          </ul>
        </CollapsibleBlock>
      )}
    </TabFrame>
  );
}

function CategorySection({
  category,
  issues,
  onGoToMap,
  onGoToEntity,
}: {
  category: IssueCategory;
  issues: Issue[];
  onGoToMap?: (mapId: string) => void;
  onGoToEntity?: (entityId: string) => void;
}) {
  if (!issues.length) return null;
  const counts = {
    blocking: issues.filter((i) => i.severity === "blocking").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    suggestion: issues.filter((i) => i.severity === "suggestion").length,
  };
  return (
    <CollapsibleBlock
      title={CATEGORY_LABELS[category]}
      defaultOpen={counts.blocking > 0 || counts.warning > 0}
      counts={counts}
    >
      <ul className="space-y-1.5">
        {issues.map((i, idx) => (
          <IssueCard key={idx} issue={i} onGoToMap={onGoToMap} onGoToEntity={onGoToEntity} />
        ))}
      </ul>
    </CollapsibleBlock>
  );
}

function IssueCard({
  issue,
  onGoToMap,
  onGoToEntity,
}: {
  issue: Issue;
  onGoToMap?: (mapId: string) => void;
  onGoToEntity?: (entityId: string) => void;
}) {
  const meta = SEVERITY_META[issue.severity as keyof typeof SEVERITY_META] ?? SEVERITY_META.suggestion;
  const Icon = meta.icon;
  return (
    <li className="rounded-md border border-border bg-card/50 p-2 text-xs space-y-1">
      <div className="flex items-start gap-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${meta.tone}`} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={meta.badge} className="text-[9px]">{issue.code}</Badge>
            {issue.scope?.mapId && <span className="text-[10px] font-mono text-muted-foreground truncate">{issue.scope.mapId}</span>}
            {issue.scope?.entityId && <span className="text-[10px] font-mono text-muted-foreground truncate">{issue.scope.entityId}</span>}
          </div>
          <div className="text-foreground">{issue.message}</div>
          {issue.hint && (
            <div className="text-[11px] text-muted-foreground border-l-2 border-border pl-2">
              {issue.hint}
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {issue.scope?.mapId && onGoToMap && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] gap-1"
                onClick={() => onGoToMap(issue.scope!.mapId!)}
              >
                <ArrowRight className="h-3 w-3" /> Go to map
              </Button>
            )}
            {issue.scope?.entityId && onGoToEntity && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] gap-1"
                onClick={() => onGoToEntity(issue.scope!.entityId!)}
              >
                <ArrowRight className="h-3 w-3" /> Go to entity
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function CollapsibleBlock({
  title,
  icon,
  counts,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  counts?: { blocking: number; warning: number; suggestion: number };
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border bg-card/30">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        <span>{title}</span>
        {counts && (
          <span className="ml-auto flex items-center gap-1">
            {counts.blocking > 0 && <Badge variant="destructive" className="text-[9px]">{counts.blocking}</Badge>}
            {counts.warning > 0 && <Badge variant="secondary" className="text-[9px]">{counts.warning}</Badge>}
            {counts.suggestion > 0 && <Badge variant="outline" className="text-[9px]">{counts.suggestion}</Badge>}
          </span>
        )}
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}
