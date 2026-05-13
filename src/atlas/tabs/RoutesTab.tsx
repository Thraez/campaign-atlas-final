/**
 * Routes tab — visual draw + form-driven edit, exports world.yaml routes patch.
 *
 * State lives in `useRouteDraft`; the map (RouteLayer) and this form share it.
 * YAML stays canon — every change is a local draft until the DM exports.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pen, Trash2, Copy, RotateCcw, Crosshair, MapPin, Route as RouteIcon, Target, Plus } from "lucide-react";
import type { AtlasProject, MapDocument, Route, EntityVisibility, RouteMode, Point } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TabFrame } from "./TabFrame";
import { dumpYaml, patchHeader } from "@/atlas/yaml/dump";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { downloadText } from "./download";
import { ROUTE_MODES, routeToYamlObject, type RouteDraftAPI } from "@/atlas/routes/useRouteDraft";

interface Props {
  project: AtlasProject;
  map: MapDocument;
  api: RouteDraftAPI;
  blockingCount?: number;
  warningCount?: number;
  lastExportAt: number | null;
  onExported: () => void;
  onFitTo?: (pts: Point[]) => void;
}

type WaypointMode = "coord" | "entity" | "mixed";

export function RoutesTab({ project, map, api, blockingCount, warningCount, lastExportAt, onExported, onFitTo }: Props) {
  const { effective, draft, dirty, dirtyCount, selectedId, setSelectedId, drawing, draftWaypoints, startDraw, cancelDraw, addDraftEntity, removeLastDraftPoint, finishDraw, patch, removeWaypoint, setWaypointEntity, duplicate, remove, reset, issues, resolveRoute } = api;
  const [advancedYaml, setAdvancedYaml] = useState(false);
  const [waypointMode, setWaypointMode] = useState<WaypointMode>("coord");
  const [entityToAdd, setEntityToAdd] = useState("");
  const selected = useMemo(() => effective.find((r) => r.id === selectedId) ?? null, [effective, selectedId]);
  const baseRoutes = map.routes ?? [];

  const yamlBlock = useMemo(() => {
    if (!effective.length) return "";
    return dumpYaml({ maps: [{ id: map.id, routes: effective.map(routeToYamlObject) }] });
  }, [effective, map.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (drawing) {
        if (e.key === "Enter") { e.preventDefault(); finishDraw(); }
        else if (e.key === "Escape") { e.preventDefault(); cancelDraw(); }
        else if (e.key === "Backspace") { e.preventDefault(); removeLastDraftPoint(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, finishDraw, cancelDraw, removeLastDraftPoint]);

  const exportPatch = () => {
    if (!effective.length) { toast.warning("No routes to export."); return; }
    const blocking = issues.filter((i) => i.severity === "blocking");
    if (blocking.length) { toast.error(blocking[0].message); return; }
    const content = patchHeader({
      title: `Routes patch — ${map.name}`,
      subject: `world.yaml > maps[id=${map.id}].routes`,
      applyTo: `content/<world>/_atlas/world.yaml (replace this map's routes: list)`,
      notes: [
        "Replaces the entire routes: list for this map — preserves layers/regions/fog.",
        dirtyCount > 0 ? `${dirtyCount} local change${dirtyCount === 1 ? "" : "s"} included.` : "",
      ].filter(Boolean),
    }) + yamlBlock;
    const result = validatePatchYaml(content, "world-map");
    if (!result.ok) { toast.error(result.errors[0]); return; }
    downloadText(`routes-patch-${map.id}.yaml`, content, "text/yaml");
    onExported();
  };

  return (
    <TabFrame
      title="Routes"
      builtFromYamlCount={baseRoutes.length}
      localDraftCount={dirtyCount}
      blockingCount={blockingCount}
      warningCount={warningCount}
      lastExportAt={lastExportAt}
      onExport={exportPatch}
      exportDisabled={effective.length === 0}
      rawYamlPreview={advancedYaml ? yamlBlock : undefined}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {!drawing ? (
            <Button size="sm" onClick={startDraw} className="h-7 text-xs gap-1">
              <Pen className="h-3.5 w-3.5" /> Draw route
            </Button>
          ) : (
            <>
              <span className="text-[11px] text-primary font-medium px-2 py-1 rounded bg-primary/10">
                Drawing — {draftWaypoints.length} wp
              </span>
              <Button size="sm" variant="default" onClick={() => { const id = finishDraw(); if (!id) toast.warning("Need at least 2 waypoints."); }} className="h-7 text-xs">Finish (Enter)</Button>
              <Button size="sm" variant="ghost" onClick={removeLastDraftPoint} className="h-7 text-xs">Undo (⌫)</Button>
              <Button size="sm" variant="ghost" onClick={cancelDraw} className="h-7 text-xs">Cancel (Esc)</Button>
            </>
          )}
          {dirty && !drawing && (
            <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs gap-1 ml-auto">
              <RotateCcw className="h-3.5 w-3.5" /> Discard local
            </Button>
          )}
        </div>

        {drawing && (
          <div className="space-y-2 rounded-md border border-border bg-card/50 p-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px]">Waypoint mode</Label>
              <Select value={waypointMode} onValueChange={(v) => setWaypointMode(v as WaypointMode)}>
                <SelectTrigger className="h-6 text-[10px] w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coord" className="text-xs">coord</SelectItem>
                  <SelectItem value="entity" className="text-xs">entity</SelectItem>
                  <SelectItem value="mixed" className="text-xs">mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              {waypointMode === "entity" ? "Pick an entity to add as a waypoint." : "Click on the map to add a coord waypoint."}
              {waypointMode === "mixed" && " You can also add entities below."}
            </p>
            {waypointMode !== "coord" && (
              <div className="flex gap-1">
                <Input list="atlas-entity-ids" placeholder="entity id" value={entityToAdd} onChange={(e) => setEntityToAdd(e.target.value)} className="h-7 text-xs" />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                  if (!entityToAdd) return;
                  if (!project.entities.some((e) => e.id === entityToAdd)) { toast.error("Unknown entity id."); return; }
                  addDraftEntity(entityToAdd);
                  setEntityToAdd("");
                }}>Add</Button>
              </div>
            )}
          </div>
        )}

        {issues.length > 0 && (
          <div className="space-y-1">
            {issues.slice(0, 5).map((i, idx) => (
              <div key={idx} className={`text-[11px] px-2 py-1 rounded border ${i.severity === "blocking" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                <button className="text-left hover:underline" onClick={() => i.routeId && setSelectedId(i.routeId)}>{i.message}</button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          {effective.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No routes yet. Click <strong>Draw route</strong> and click on the map to plot a path.
            </p>
          )}
          {effective.map((r) => {
            const isSelected = r.id === selectedId;
            const isAdded = !!draft.added.find((x) => x.id === r.id);
            const isEdited = !isAdded && !!draft.edits[r.id];
            return (
              <div key={r.id} className={`flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer ${isSelected ? "bg-accent" : "hover:bg-accent/40"}`} onClick={() => setSelectedId(r.id)}>
                <span className="inline-block w-3 h-1 rounded-sm" style={{ background: r.color ?? "#cfd6dc" }} />
                <span className="text-xs flex-1 truncate">{r.name}</span>
                <span className="text-[10px] text-muted-foreground">{r.waypoints.length} wp</span>
                {isAdded && <span className="text-[9px] uppercase tracking-wider text-primary px-1">new</span>}
                {isEdited && <span className="text-[9px] uppercase tracking-wider text-amber-500 px-1">edit</span>}
              </div>
            );
          })}
        </div>

        {selected && (
          <div className="rounded-md border border-border p-2.5 space-y-2.5 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground truncate">{selected.id}</span>
              <div className="flex items-center gap-0.5">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Fit view to route" onClick={() => onFitTo?.(resolveRoute(selected))}>
                  <Target className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Duplicate" onClick={() => duplicate(selected.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" title="Delete" onClick={() => { if (confirm(`Delete route "${selected.name}"?`)) remove(selected.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-[10px]">Name</Label>
              <Input value={selected.name} onChange={(e) => patch(selected.id, { name: e.target.value })} className="h-7 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Map</Label>
                <Select value={selected.mapId} onValueChange={(v) => patch(selected.id, { mapId: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {project.maps.map((m) => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Visibility</Label>
                <Select value={selected.visibility} onValueChange={(v) => patch(selected.id, { visibility: v as EntityVisibility })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["player","rumor","dm","hidden"].map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Mode</Label>
                <Select value={selected.mode ?? "foot"} onValueChange={(v) => patch(selected.id, { mode: v as RouteMode })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUTE_MODES.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Speed ({map.scale?.unitLabel ?? "u"}/h)</Label>
                <Input type="number" value={selected.speed ?? ""} onChange={(e) => patch(selected.id, { speed: e.target.value ? Number(e.target.value) : undefined })} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">Color</Label>
                <Input type="color" className="h-7 p-1" value={selected.color ?? "#cfd6dc"} onChange={(e) => patch(selected.id, { color: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Weight</Label>
                <Slider min={1} max={10} step={1} value={[selected.weight ?? 3]} onValueChange={([v]) => patch(selected.id, { weight: v })} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-[10px]">Dashed</Label>
              <Switch checked={!!selected.dashed} onCheckedChange={(v) => patch(selected.id, { dashed: v })} />
            </div>

            <div>
              <Label className="text-[10px]">Description</Label>
              <Input value={selected.description ?? ""} onChange={(e) => patch(selected.id, { description: e.target.value || undefined })} className="h-7 text-xs" />
            </div>

            <WaypointList
              route={selected}
              onSwap={(idx, entityId) => setWaypointEntity(selected.id, idx, entityId)}
              onRemove={(idx) => removeWaypoint(selected.id, idx)}
            />
          </div>
        )}

        {!selected && !drawing && (
          <Button size="sm" variant="outline" onClick={startDraw} className="h-7 text-xs gap-1 w-full">
            <Plus className="h-3.5 w-3.5" /> New route
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

function WaypointList({ route, onSwap, onRemove }: { route: Route; onSwap: (idx: number, entityId: string) => void; onRemove: (idx: number) => void }) {
  return (
    <div className="space-y-1 pt-1 border-t border-border">
      <Label className="text-[10px]">Waypoints</Label>
      <div className="space-y-1">
        {route.waypoints.map((w, i) => {
          const isEntity = !Array.isArray(w);
          return (
            <div key={i} className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground w-5">{i + 1}.</span>
              {isEntity ? (
                <>
                  <MapPin className="h-3 w-3 text-accent" />
                  <Input list="atlas-entity-ids" value={w.entityId} onChange={(e) => onSwap(i, e.target.value)} className="h-6 text-[11px] flex-1" />
                </>
              ) : (
                <>
                  <RouteIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{w[0]}, {w[1]}</span>
                </>
              )}
              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive ml-auto" onClick={() => onRemove(i)} title="Remove">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground italic">Drag handles on the map to move coord waypoints. Right-click to delete.</p>
    </div>
  );
}
