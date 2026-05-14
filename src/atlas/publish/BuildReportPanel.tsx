/**
 * Build Report panel.
 *
 * Surfaces the AUTHORITATIVE build/validation report that
 * `scripts/build-atlas.ts` emits inside `public/atlas/atlas.json`
 * (`AtlasProject.buildReport`). The CI build remains the source of truth;
 * this component just makes the report visible to the DM inside the editor.
 *
 * Why a separate panel from the existing live `PublishCheckTab`:
 *   - The live tab validates the in-memory editor draft.
 *   - This panel reflects what the *last shipped/built* atlas actually contains,
 *     so the DM can see "this is what the build script flagged before publish".
 *
 * Player-mode safety: every render path is wrapped in `isDmToolsEnabled()`
 * so this panel is never visible in a published player atlas. The route that
 * mounts it is also gated, so this is defense-in-depth, not the only gate.
 */
import { useMemo, useState } from "react";
import type { BuildReport } from "@/atlas/content/schema";
import { isDmToolsEnabled } from "@/atlas/dmTools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  FileDown,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import { downloadText } from "@/atlas/tabs/download";
import { toast } from "sonner";

export type BuildReportSeverity = "error" | "warning" | "info";

export interface BuildReportIssue {
  severity: BuildReportSeverity;
  /** Short stable code for grouping/diagnostics (e.g. "missing-asset"). */
  code: string;
  /** What went wrong, in human language. */
  message: string;
  /** File / map / entity / route / region / layer id, when known. */
  scope?: string;
  /** Concrete remediation. */
  suggestion?: string;
}

/**
 * Convert the raw `BuildReport` shape (counts + a flat warnings[] string list)
 * into structured per-issue records. Lossless for the things we currently
 * track; future build-script revisions can emit richer issues directly.
 */
export function deriveBuildIssues(report: BuildReport): BuildReportIssue[] {
  const issues: BuildReportIssue[] = [];

  if ((report.missingAssets ?? 0) > 0) {
    issues.push({
      severity: "error",
      code: "missing-asset",
      message: `${report.missingAssets} local asset reference${report.missingAssets === 1 ? "" : "s"} could not be resolved`,
      suggestion: "Add the missing files under public/atlas/assets/ or correct the references in world.yaml / entity frontmatter.",
    });
  }
  if ((report.duplicateSlugs ?? 0) > 0) {
    issues.push({
      severity: "error",
      code: "duplicate-slug",
      message: `${report.duplicateSlugs} duplicate entity slug${report.duplicateSlugs === 1 ? "" : "s"} detected`,
      suggestion: "Rename one of the conflicting entity files so each slug is unique.",
    });
  }
  if ((report.unresolvedLinks ?? 0) > 0) {
    issues.push({
      severity: "info",
      code: "unresolved-wikilink",
      message: `${report.unresolvedLinks} wikilink${report.unresolvedLinks === 1 ? "" : "s"} point at notes that don't exist yet`,
      suggestion: "Allowed by policy. Create the notes when ready, or remove the links.",
    });
  }
  if ((report.externalAssets ?? 0) > 0) {
    issues.push({
      severity: "info",
      code: "external-asset",
      message: `${report.externalAssets} external asset URL${report.externalAssets === 1 ? "" : "s"} referenced (not bundled)`,
      suggestion: "If the host disappears, the player atlas will break. Consider downloading the file into public/atlas/assets/.",
    });
  }

  // The build script appends a flat string per warning. Split out any
  // "owner: message — suggestion" form the asset validator emits so the DM
  // sees scope and suggestion as distinct fields.
  for (const w of report.warnings ?? []) {
    issues.push(parseWarningString(w));
  }

  return issues;
}

function parseWarningString(raw: string): BuildReportIssue {
  // Best-effort: "owner: message — suggestion"
  const dashIdx = raw.indexOf(" — ");
  let scope: string | undefined;
  let message = raw;
  let suggestion: string | undefined;
  if (dashIdx >= 0) {
    suggestion = raw.slice(dashIdx + 3).trim();
    message = raw.slice(0, dashIdx).trim();
  }
  const colonIdx = message.indexOf(": ");
  if (colonIdx > 0 && colonIdx < 80) {
    scope = message.slice(0, colonIdx).trim();
    message = message.slice(colonIdx + 2).trim();
  }
  return { severity: "warning", code: "build-warning", message, scope, suggestion };
}

/**
 * Render the build report as a copy/exportable Markdown document. Pure;
 * exported separately so tests can assert the format without the DOM.
 */
export function buildReportToMarkdown(
  report: BuildReport,
  meta?: { atlasVersion?: string; publishedAt?: string }
): string {
  const issues = deriveBuildIssues(report);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const ok = errors.length === 0;

  const lines: string[] = [];
  lines.push(`# Atlas Publish Check Report`);
  lines.push("");
  lines.push(`**Status:** ${ok ? "✅ Ready to publish" : "❌ Blocking issues"}`);
  if (meta?.atlasVersion) lines.push(`**Atlas version:** \`${meta.atlasVersion}\``);
  if (meta?.publishedAt) lines.push(`**Built at:** ${meta.publishedAt}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(`- Scanned: ${report.scanned}`);
  lines.push(`- Included: ${report.included}`);
  lines.push(`- Excluded: ${report.excluded}`);
  lines.push(`- Errors: ${errors.length}`);
  lines.push(`- Warnings: ${warnings.length}`);
  lines.push(`- Info: ${infos.length}`);
  lines.push("");

  const section = (label: string, list: BuildReportIssue[]) => {
    if (!list.length) return;
    lines.push(`## ${label}`);
    for (const i of list) {
      const head = i.scope ? `**[${i.code}]** \`${i.scope}\` — ${i.message}` : `**[${i.code}]** ${i.message}`;
      lines.push(`- ${head}`);
      if (i.suggestion) lines.push(`  - _Fix:_ ${i.suggestion}`);
    }
    lines.push("");
  };
  section("Errors", errors);
  section("Warnings", warnings);
  section("Info", infos);

  if (issues.length === 0) {
    lines.push(`No issues reported. 🎉`);
    lines.push("");
  }
  return lines.join("\n");
}

const SEVERITY_META: Record<
  BuildReportSeverity,
  { label: string; icon: typeof ShieldAlert; tone: string; badge: "destructive" | "secondary" | "outline" }
> = {
  error: { label: "Errors", icon: ShieldAlert, tone: "text-destructive", badge: "destructive" },
  warning: { label: "Warnings", icon: AlertTriangle, tone: "text-amber-500", badge: "secondary" },
  info: { label: "Info", icon: CheckCircle2, tone: "text-muted-foreground", badge: "outline" },
};

export interface BuildReportPanelProps {
  report: BuildReport | null | undefined;
  atlasVersion?: string;
  publishedAt?: string;
}

export function BuildReportPanel(props: BuildReportPanelProps) {
  // Defense-in-depth: never render in player mode. The route mounting this is
  // already gated, but the component itself also refuses.
  if (!isDmToolsEnabled()) return null;

  const { report, atlasVersion, publishedAt } = props;

  // Empty state — no report file or build never produced one.
  if (!report) {
    return (
      <div
        data-testid="build-report-empty"
        className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground space-y-1"
      >
        <div className="flex items-center gap-1.5 text-foreground">
          <Inbox className="h-3.5 w-3.5" />
          <span className="font-medium">No publish report found.</span>
        </div>
        <p>Run the atlas validation/build command to generate one:</p>
        <pre className="rounded bg-muted/50 p-1.5 text-[11px] font-mono">npm run atlas:build:player</pre>
      </div>
    );
  }

  return <BuildReportPanelInner report={report} atlasVersion={atlasVersion} publishedAt={publishedAt} />;
}

function BuildReportPanelInner({
  report,
  atlasVersion,
  publishedAt,
}: {
  report: BuildReport;
  atlasVersion?: string;
  publishedAt?: string;
}) {
  const issues = useMemo(() => deriveBuildIssues(report), [report]);
  const grouped = useMemo(() => {
    return {
      error: issues.filter((i) => i.severity === "error"),
      warning: issues.filter((i) => i.severity === "warning"),
      info: issues.filter((i) => i.severity === "info"),
    };
  }, [issues]);
  const ok = grouped.error.length === 0;

  const md = useMemo(
    () => buildReportToMarkdown(report, { atlasVersion, publishedAt }),
    [report, atlasVersion, publishedAt]
  );

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Report copied as Markdown");
    } catch {
      toast.error("Could not access clipboard");
    }
  };
  const onDownload = () => {
    const filename = `atlas-build-report-${new Date().toISOString().slice(0, 10)}.md`;
    downloadText(filename, md, "text/markdown");
  };

  return (
    <div data-testid="build-report-panel" className="space-y-2">
      <div
        className={`rounded-md border p-3 text-xs ${
          ok ? "border-primary/30 bg-primary/5" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-destructive" />}
          {ok ? "Last build passed all gates." : `Last build had ${grouped.error.length} blocking issue(s).`}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {grouped.error.length} error · {grouped.warning.length} warning · {grouped.info.length} info ·
          {" "}{report.scanned} scanned · {report.included} included
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={onCopy} className="h-7 gap-1 text-xs">
          <ClipboardCopy className="h-3.5 w-3.5" /> Copy as Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={onDownload} className="h-7 gap-1 text-xs">
          <FileDown className="h-3.5 w-3.5" /> Download
        </Button>
      </div>

      {(["error", "warning", "info"] as BuildReportSeverity[]).map((sev) => {
        const list = grouped[sev];
        if (!list.length) return null;
        const meta = SEVERITY_META[sev];
        const Icon = meta.icon;
        return (
          <Section key={sev} testId={`build-report-section-${sev}`} label={meta.label} icon={<Icon className={`h-3.5 w-3.5 ${meta.tone}`} />} count={list.length}>
            <ul className="space-y-1.5">
              {list.map((i, idx) => (
                <li key={idx} className="rounded-md border border-border bg-card/50 p-2 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={meta.badge} className="text-[9px]">{i.code}</Badge>
                    {i.scope && <span className="font-mono text-[10px] text-muted-foreground truncate">{i.scope}</span>}
                  </div>
                  <div className="text-foreground">{i.message}</div>
                  {i.suggestion && (
                    <div className="text-[11px] text-muted-foreground border-l-2 border-border pl-2">
                      {i.suggestion}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      {issues.length === 0 && (
        <div className="text-xs text-muted-foreground">No issues reported. 🎉</div>
      )}
    </div>
  );
}

function Section({
  label,
  icon,
  count,
  children,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div data-testid={testId} className="rounded-md border border-border bg-card/30">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span>{label}</span>
        <Badge variant="outline" className="text-[9px] ml-1">{count}</Badge>
        <span className="ml-auto">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}