/**
 * Central "Export DM Changes" modal.
 *
 * One place where the DM can:
 *  - see exactly what will change (per-section summary)
 *  - see validation results (blocking / warning / suggestion / passed)
 *  - download artifacts: full package, placements, world.yaml, frontmatter,
 *    asset zip, publish report.
 *
 * Every artifact comes from {@link ./yaml/buildPatches} → no component should
 * stringify YAML directly anymore.
 */
import { useMemo, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileCode, Info, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import {
  buildAssetManifest,
  buildPlacementJson,
  buildPlacementPatch,
  buildPublishReport,
  buildWorldMapPatch,
  type PatchArtifact,
  type PlacementOverride,
} from "./yaml/buildPatches";
import { validatePatchYaml } from "./yaml/validatePatch";
import { validateProject, type Issue, type Severity } from "./yaml/validateProject";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: AtlasProject;
  activeMap: MapDocument;
  draftPlacements: PlacementOverride[];
  mergedLayers: MapDocument["layers"];
  localLayers: LocalLayer[];
}

function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadArtifact(a: PatchArtifact) {
  downloadBlob(a.filename, new Blob([a.content], { type: a.mime }));
  toast.success(`Downloaded ${a.filename}`);
}

const SEV_ICON: Record<Severity, JSX.Element> = {
  blocking: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
  suggestion: <Info className="h-3.5 w-3.5 text-sky-400" />,
  passed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
};

export function ExportChangesModal({
  open,
  onOpenChange,
  project,
  activeMap,
  draftPlacements,
  mergedLayers,
  localLayers,
}: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const artifacts = useMemo(() => {
    const a: { placement: PatchArtifact; placementJson: PatchArtifact; world: PatchArtifact; manifest: PatchArtifact } = {
      placement: buildPlacementPatch({ project, mapId: activeMap.id, placements: draftPlacements }),
      placementJson: buildPlacementJson({ project, mapId: activeMap.id, placements: draftPlacements }),
      world: buildWorldMapPatch({ map: activeMap, mergedLayers, localLayers }),
      manifest: buildAssetManifest([]),
    };
    a.manifest = buildAssetManifest(a.world.assets ?? []);
    return a;
  }, [project, activeMap, draftPlacements, mergedLayers, localLayers]);

  const validation = useMemo(
    () =>
      validateProject({
        project,
        draftPlacements,
        draftMap: activeMap,
        draftLocalLayers: localLayers,
      }),
    [project, draftPlacements, activeMap, localLayers]
  );

  // Per-artifact YAML parse check (catches builder regressions).
  const parseIssues = useMemo<Issue[]>(() => {
    const issues: Issue[] = [];
    const checks: Array<[PatchArtifact, "placement" | "map"]> = [
      [artifacts.placement, "placement"],
      [artifacts.world, "map"],
    ];
    for (const [art, kind] of checks) {
      const r = validatePatchYaml(art.content, kind);
      for (const e of r.errors) issues.push({ severity: "blocking", code: "yaml-parse", message: `${art.filename}: ${e}` });
      for (const w of r.warnings) issues.push({ severity: "warning", code: "yaml-warn", message: `${art.filename}: ${w}` });
    }
    return issues;
  }, [artifacts]);

  const allIssues = [...parseIssues, ...validation.issues];
  const blocking = allIssues.filter((i) => i.severity === "blocking");
  const warnings = allIssues.filter((i) => i.severity === "warning");
  const suggestions = allIssues.filter((i) => i.severity === "suggestion");

  const downloadFullPackage = async () => {
    if (blocking.length) {
      toast.error("Resolve blocking issues before downloading the full package.");
      return;
    }
    const zip = new JSZip();
    const list: PatchArtifact[] = [
      artifacts.placement,
      artifacts.placementJson,
      artifacts.world,
      artifacts.manifest,
    ];
    for (const a of list) zip.file(a.filename, a.content);

    // Include uploaded layer images.
    for (const l of localLayers.filter((x) => x.origin === "upload" && x.dataUrl)) {
      const target = (l.targetPath ?? `public/atlas/assets/maps/${l.id}`).replace(/^\/+/, "");
      const m = l.dataUrl!.match(/^data:[^;]+;base64,(.*)$/);
      if (m) zip.file(target, m[1], { base64: true });
    }

    const report = buildPublishReport({ project, artifacts: list, issueCount: validation.counts });
    zip.file(report.filename, report.content);

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`dm-changes-${activeMap.id}.zip`, blob);
    toast.success("Full DM changes package downloaded.");
  };

  const downloadAssetZip = async () => {
    const uploads = localLayers.filter((l) => l.origin === "upload" && l.dataUrl);
    if (!uploads.length) {
      toast.info("No browser-only uploads to bundle.");
      return;
    }
    const zip = new JSZip();
    for (const u of uploads) {
      const target = (u.targetPath ?? `public/atlas/assets/maps/${u.id}`).replace(/^\/+/, "");
      const m = u.dataUrl!.match(/^data:[^;]+;base64,(.*)$/);
      if (m) zip.file(target, m[1], { base64: true });
    }
    zip.file(artifacts.manifest.filename, artifacts.manifest.content);
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`atlas-assets-${activeMap.id}.zip`, blob);
    toast.success(`Bundled ${uploads.length} asset(s).`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            Export DM Changes
          </DialogTitle>
          <DialogDescription>
            YAML is canon. This dialog packages your local drafts into validated patches —
            commit them to your repo to publish.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 -mr-3">
          <div className="space-y-4 text-xs">
            {/* SUMMARY */}
            <section className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary of changes</div>
              <ul className="space-y-1">
                {[artifacts.placement, artifacts.world, artifacts.manifest].flatMap((a) =>
                  a.summary.map((s, i) => (
                    <li key={`${a.filename}-${i}`} className="flex items-center gap-2">
                      <span className="text-muted-foreground">•</span> {s}
                    </li>
                  ))
                )}
              </ul>
            </section>

            {/* VALIDATION */}
            <section className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Validation</div>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px] gap-1">{SEV_ICON.blocking} {blocking.length}</Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">{SEV_ICON.warning} {warnings.length}</Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">{SEV_ICON.suggestion} {suggestions.length}</Badge>
                </div>
              </div>
              {allIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  {SEV_ICON.passed} All checks passed.
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-48 overflow-auto">
                  {allIssues.map((i, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5">{SEV_ICON[i.severity]}</span>
                      <span>
                        <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{i.code}</span>
                        {i.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {validation.passedChecks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {validation.passedChecks.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">{c}</Badge>
                  ))}
                </div>
              )}
            </section>

            {/* RAW PREVIEW */}
            <section className="rounded-md border border-border">
              <button
                className="w-full text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30 flex items-center justify-between"
                onClick={() => setShowRaw((v) => !v)}
              >
                Advanced: raw YAML preview
                <span>{showRaw ? "▾" : "▸"}</span>
              </button>
              {showRaw && (
                <div className="p-3 space-y-3 border-t border-border">
                  {[artifacts.placement, artifacts.world, artifacts.manifest].map((a) => (
                    <div key={a.filename}>
                      <div className="text-[10px] font-mono text-muted-foreground mb-1">{a.filename}</div>
                      <pre className="text-[10px] bg-background border border-border rounded p-2 overflow-auto max-h-40 whitespace-pre">
                        {a.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        {/* DOWNLOAD ACTIONS */}
        <div className="border-t border-border pt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          <Button onClick={downloadFullPackage} disabled={blocking.length > 0} className="gap-1.5 col-span-2 md:col-span-3">
            <Package className="h-3.5 w-3.5" /> Download full patch package (.zip)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadArtifact(artifacts.placement)} className="gap-1">
            <Download className="h-3 w-3" /> Placements .yaml
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadArtifact(artifacts.placementJson)} className="gap-1">
            <Download className="h-3 w-3" /> Placements .json
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadArtifact(artifacts.world)} className="gap-1">
            <Download className="h-3 w-3" /> world.yaml patch
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadArtifact(artifacts.manifest)} className="gap-1">
            <Download className="h-3 w-3" /> Asset manifest
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadAssetZip} className="gap-1">
            <Package className="h-3 w-3" /> Assets .zip
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadArtifact(
                buildPublishReport({
                  project,
                  artifacts: [artifacts.placement, artifacts.world, artifacts.manifest],
                  issueCount: validation.counts,
                })
              )
            }
            className="gap-1"
          >
            <Download className="h-3 w-3" /> Publish report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
