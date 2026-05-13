/**
 * Fog tab — toggle, color, and visual reveal authoring.
 *
 * Drawing happens on the map via FogLayer; this panel owns the toggles, the
 * reveal list, and convenience actions ("reveal selected region/route/pin").
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pen, Circle as CircleIcon, Trash2, RotateCcw, Crosshair, Eye, EyeOff } from "lucide-react";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";
import type { RegionDraftAPI } from "@/atlas/regions/useRegionDraft";
import type { RouteDraftAPI } from "@/atlas/routes/useRouteDraft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabFrame } from "./TabFrame";
import { dumpYaml, patchHeader } from "@/atlas/yaml/dump";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { downloadText } from "./download";
import { fogToYamlObject, type FogDraftAPI } from "@/atlas/fog/useFogDraft";

interface Props {
  map: MapDocument;
  project: AtlasProject;
  api: FogDraftAPI;
  /** Optional cross-tab APIs so we can reveal from existing geometry. */
  regionApi?: RegionDraftAPI;
  routeApi?: RouteDraftAPI;
  showFogPreview: boolean;
  setShowFogPreview: (v: boolean) => void;
  blockingCount?: number;
  warningCount?: number;
  lastExportAt: number | null;
  onExported: () => void;
}

export function FogTab({ map, project, api, regionApi, routeApi, showFogPreview, setShowFogPreview, blockingCount, warningCount, lastExportAt, onExported }: Props) {
  const { fog, dirty, setEnabled, setColor, tool, setTool, draftPoints, addDraftPoint: _addDraftPoint, removeLastDraftPoint, cancelDraft, finishDraftPolygon, finishDraftCircle, removeReveal, clearReveals, revealRegion, revealAroundRoute, revealAroundPin, reset, issues } = api;
  void _addDraftPoint;
  const [advancedYaml, setAdvancedYaml] = useState(false);
  const [circleRadius, setCircleRadius] = useState(500);
  const [pinRadius, setPinRadius] = useState(800);
  const [routePadding, setRoutePadding] = useState(200);
  const [pinId, setPinId] = useState("");

  const yamlBlock = useMemo(() => dumpYaml({ maps: [{ id: map.id, fog: fogToYamlObject(fog) }] }), [fog, map.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (tool === "polygon") {
        if (e.key === "Enter") { e.preventDefault(); if (!finishDraftPolygon()) toast.warning("Need at least 3 points."); }
        else if (e.key === "Escape") { e.preventDefault(); cancelDraft(); }
        else if (e.key === "Backspace") { e.preventDefault(); removeLastDraftPoint(); }
      } else if (tool === "circle") {
        if (e.key === "Enter") { e.preventDefault(); if (!finishDraftCircle(circleRadius)) toast.warning("Click a center first."); }
        else if (e.key === "Escape") { e.preventDefault(); cancelDraft(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, finishDraftPolygon, finishDraftCircle, cancelDraft, removeLastDraftPoint, circleRadius]);

  const exportPatch = () => {
    const blocking = issues.filter((i) => i.severity === "blocking");
    if (blocking.length) { toast.error(blocking[0].message); return; }
    const content = patchHeader({
      title: `Fog patch — ${map.name}`,
      subject: `world.yaml > maps[id=${map.id}].fog`,
      applyTo: `content/<world>/_atlas/world.yaml (replace this map's fog: block)`,
      notes: ["Replaces the entire fog: block — preserves layers/regions/routes."],
    }) + yamlBlock;
    const result = validatePatchYaml(content, "world-map");
    if (!result.ok) { toast.error(result.errors[0]); return; }
    downloadText(`fog-patch-${map.id}.yaml`, content, "text/yaml");
    onExported();
  };

  const placementsByEntity = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const p of project.placements) if (p.mapId === map.id) m.set(p.entityId, [p.x, p.y]);
    return m;
  }, [project.placements, map.id]);

  return (
    <TabFrame
      title="Fog of war"
      builtFromYamlCount={(map.fog?.reveals.length ?? 0)}
      localDraftCount={dirty ? 1 : 0}
      blockingCount={blockingCount}
      warningCount={warningCount}
      lastExportAt={lastExportAt}
      onExport={exportPatch}
      rawYamlPreview={advancedYaml ? yamlBlock : undefined}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-md border border-border p-2">
          <div>
            <div className="text-xs font-medium">Fog enabled</div>
            <div className="text-[10px] text-muted-foreground">Players see the map covered except inside reveals.</div>
          </div>
          <Switch checked={fog.enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px]">Preview fog on map</Label>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setShowFogPreview(!showFogPreview)}>
            {showFogPreview ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showFogPreview ? "Visible" : "Hidden"}
          </Button>
        </div>

        <div>
          <Label className="text-[10px]">Fog color (CSS)</Label>
          <Input value={fog.color ?? ""} placeholder="rgba(0,0,0,0.55)" onChange={(e) => setColor(e.target.value || undefined)} className="h-7 text-xs" />
        </div>

        {/* Drawing */}
        <div className="rounded-md border border-border p-2 space-y-2 bg-card/50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Add reveal</div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={tool === "polygon" ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => tool === "polygon" ? cancelDraft() : setTool("polygon")}>
              <Pen className="h-3.5 w-3.5" /> Polygon
            </Button>
            <Button size="sm" variant={tool === "circle" ? "default" : "outline"} className="h-7 text-xs gap-1" onClick={() => tool === "circle" ? cancelDraft() : setTool("circle")}>
              <CircleIcon className="h-3.5 w-3.5" /> Circle
            </Button>
          </div>

          {tool === "polygon" && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground italic">Click on the map. Enter finishes, Esc cancels, Backspace removes last point. ({draftPoints.length} pts)</p>
              <div className="flex gap-1">
                <Button size="sm" variant="default" className="h-6 text-xs" onClick={() => { if (!finishDraftPolygon()) toast.warning("Need at least 3 points."); }}>Finish</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={cancelDraft}>Cancel</Button>
              </div>
            </div>
          )}
          {tool === "circle" && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground italic">Click a center on the map. ({draftPoints.length === 0 ? "no anchor" : "anchor set"})</p>
              <div className="grid grid-cols-2 gap-1 items-end">
                <div>
                  <Label className="text-[10px]">Radius (px)</Label>
                  <Input type="number" value={circleRadius} onChange={(e) => setCircleRadius(Number(e.target.value) || 0)} className="h-6 text-xs" />
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="default" className="h-6 text-xs flex-1" onClick={() => { if (!finishDraftCircle(circleRadius)) toast.warning("Click a center first."); }}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={cancelDraft}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {/* Convenience reveals */}
          <div className="pt-1 border-t border-border space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">From existing geometry</div>
            {regionApi?.selectedId ? (
              <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => {
                const r = regionApi.effective.find((x) => x.id === regionApi.selectedId);
                if (r) { revealRegion(r); toast.success(`Revealed region "${r.name}"`); }
              }}>Reveal selected region</Button>
            ) : <p className="text-[10px] text-muted-foreground italic">Select a region in the Regions tab to reveal it.</p>}

            {routeApi?.selectedId ? (
              <div className="flex gap-1">
                <Input type="number" value={routePadding} onChange={(e) => setRoutePadding(Number(e.target.value) || 0)} className="h-7 text-xs w-20" placeholder="pad" />
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => {
                  const r = routeApi.effective.find((x) => x.id === routeApi.selectedId);
                  if (r) {
                    const pts = routeApi.resolveRoute(r);
                    revealAroundRoute(r, pts, routePadding);
                    toast.success(`Revealed around route "${r.name}"`);
                  }
                }}>Reveal around route</Button>
              </div>
            ) : <p className="text-[10px] text-muted-foreground italic">Select a route in the Routes tab to reveal around it.</p>}

            <div className="flex gap-1 items-end">
              <div className="flex-1">
                <Label className="text-[10px]">Pin entity</Label>
                <Input list="atlas-entity-ids" value={pinId} onChange={(e) => setPinId(e.target.value)} className="h-7 text-xs" placeholder="entity id" />
              </div>
              <div>
                <Label className="text-[10px]">Radius</Label>
                <Input type="number" value={pinRadius} onChange={(e) => setPinRadius(Number(e.target.value) || 0)} className="h-7 text-xs w-20" />
              </div>
              <Select onValueChange={(v) => setPinId(v)}>
                <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="pick" /></SelectTrigger>
                <SelectContent>
                  {Array.from(placementsByEntity.keys()).map((eid) => (
                    <SelectItem key={eid} value={eid} className="text-xs">{project.entities.find((e) => e.id === eid)?.title ?? eid}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => {
              const c = placementsByEntity.get(pinId);
              if (!c) { toast.error("Entity has no placement on this map."); return; }
              revealAroundPin(c, pinRadius);
              toast.success("Revealed around pin");
            }}>Reveal around pin</Button>
          </div>
        </div>

        {/* Validation chips */}
        {issues.length > 0 && (
          <div className="space-y-1">
            {issues.slice(0, 5).map((i, idx) => (
              <div key={idx} className={`text-[11px] px-2 py-1 rounded border ${i.severity === "blocking" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>{i.message}</div>
            ))}
          </div>
        )}

        {/* Reveal list */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px]">Reveals ({fog.reveals.length})</Label>
            {fog.reveals.length > 0 && (
              <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive" onClick={() => { if (confirm("Clear all reveals?")) clearReveals(); }}>Clear all</Button>
            )}
          </div>
          {fog.reveals.length === 0 && <p className="text-[10px] text-muted-foreground italic">No reveals yet — the entire map is covered.</p>}
          {fog.reveals.map((poly, i) => (
            <div key={i} className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-card/30">
              <span className="text-[10px] flex-1">Reveal #{i + 1} · {poly.length} pts</span>
              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => removeReveal(i)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>

        {dirty && (
          <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> Discard local
          </Button>
        )}

        <div className="pt-1 border-t border-border">
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => setAdvancedYaml((v) => !v)}>
            <Crosshair className="h-3 w-3" /> {advancedYaml ? "Hide" : "Show"} advanced YAML preview
          </Button>
        </div>
      </div>
    </TabFrame>
  );
}
