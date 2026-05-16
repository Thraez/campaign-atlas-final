/**
 * Regions tab — visual draw + form-driven edit, exports world.yaml regions patch.
 *
 * Drawing & geometry editing happen on the map (RegionLayer); this panel owns
 * the per-region form, the validation summary, and the unified export. All
 * state lives in `useRegionDraft` so the map and the form stay in sync.
 *
 * YAML remains canon — every change here is a local draft until the DM
 * downloads the patch and commits it.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pen, Plus, Trash2, Copy, Crosshair, Target, RotateCcw, ChevronRight } from "lucide-react";
import type { AtlasProject, MapDocument, Region, EntityVisibility } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TabFrame } from "./TabFrame";
import { dumpYaml } from "@/atlas/yaml/dump";
import type { RegionDraftAPI } from "@/atlas/regions/useRegionDraft";
import { regionToYamlObject } from "@/atlas/regions/useRegionDraft";

interface Props {
  project: AtlasProject;
  map: MapDocument;
  api: RegionDraftAPI;
  blockingCount?: number;
  warningCount?: number;
  /** Center the map on a region. */
  onFitTo?: (r: Region) => void;
}

export function RegionsTab({ project, map, api, blockingCount, warningCount, onFitTo }: Props) {
  const { effective, draft, dirty, dirtyCount, selectedId, setSelectedId, drawing, draftPoints, startDraw, cancelDraw, finishDraw, removeLastDraftPoint, patch, translate, duplicate, remove, reset, issues } = api;
  const [advancedYaml, setAdvancedYaml] = useState(false);

  const selected = useMemo(() => effective.find((r) => r.id === selectedId) ?? null, [effective, selectedId]);

  // Combined draft+canon counts for the TabFrame header.
  const baseRegions = map.regions ?? [];

  const yamlBlock = useMemo(() => {
    if (!effective.length) return "";
    return dumpYaml({ maps: [{ id: map.id, regions: effective.map(regionToYamlObject) }] });
  }, [effective, map.id]);

  // Allow drawing tool to be driven by keyboard while the user is not focused
  // on a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (drawing) {
        if (e.key === "Enter") { e.preventDefault(); finishDraw(); }
        else if (e.key === "Escape") { e.preventDefault(); cancelDraw(); }
        else if (e.key === "Backspace") { e.preventDefault(); removeLastDraftPoint(); }
        return;
      }
      if (selected && (e.key === "Delete" || e.key === "Backspace") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); remove(selected.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, finishDraw, cancelDraw, removeLastDraftPoint, selected, remove]);

  return (
    <TabFrame
      title="Regions"
      builtFromYamlCount={baseRegions.length}
      localDraftCount={dirtyCount}
      blockingCount={blockingCount}
      warningCount={warningCount}
      rawYamlPreview={advancedYaml ? yamlBlock : undefined}
    >
      <div className="space-y-3">
        {/* Drawing toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!drawing ? (
            <Button size="sm" onClick={startDraw} className="h-7 text-xs gap-1">
              <Pen className="h-3.5 w-3.5" /> Draw region
            </Button>
          ) : (
            <>
              <span className="text-[11px] text-primary font-medium px-2 py-1 rounded bg-primary/10">
                Drawing — {draftPoints.length} pt{draftPoints.length === 1 ? "" : "s"}
              </span>
              <Button size="sm" variant="default" onClick={() => { const id = finishDraw(); if (!id) toast.warning("Need at least 3 points."); }} className="h-7 text-xs">
                Finish (Enter)
              </Button>
              <Button size="sm" variant="ghost" onClick={removeLastDraftPoint} className="h-7 text-xs">
                Undo (⌫)
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelDraw} className="h-7 text-xs">
                Cancel (Esc)
              </Button>
            </>
          )}
          {dirty && !drawing && (
            <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs gap-1 ml-auto">
              <RotateCcw className="h-3.5 w-3.5" /> Discard local
            </Button>
          )}
        </div>

        {drawing && (
          <p className="text-[11px] text-muted-foreground italic">
            Click on the map to add points. Enter finishes, Esc cancels, Backspace removes the last point.
          </p>
        )}

        {/* Validation chips */}
        {issues.length > 0 && (
          <div className="space-y-1">
            {issues.slice(0, 5).map((i, idx) => (
              <div key={idx} className={`text-[11px] px-2 py-1 rounded border ${i.severity === "blocking" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                <button className="text-left hover:underline" onClick={() => i.regionId && setSelectedId(i.regionId)}>
                  {i.message}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Region list */}
        <div className="space-y-1">
          {effective.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No regions yet. Click <strong>Draw region</strong> and click on the map to outline an area.
            </p>
          )}
          {effective.map((r) => {
            const isSelected = r.id === selectedId;
            const isAdded = !!draft.added.find((x) => x.id === r.id);
            const isEdited = !isAdded && !!draft.edits[r.id];
            return (
              <div key={r.id} className={`flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer ${isSelected ? "bg-accent" : "hover:bg-accent/40"}`} onClick={() => setSelectedId(r.id)}>
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: r.color ?? "#7fb069" }} />
                <span className="text-xs flex-1 truncate">{r.name}</span>
                <span className="text-[10px] text-muted-foreground">{r.points.length} pts</span>
                {isAdded && <span className="text-[9px] uppercase tracking-wider text-primary px-1">new</span>}
                {isEdited && <span className="text-[9px] uppercase tracking-wider text-amber-500 px-1">edit</span>}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            );
          })}
        </div>

        {/* Selected region form */}
        {selected && (
          <div className="rounded-md border border-border p-2.5 space-y-2.5 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground truncate">{selected.id}</span>
              <div className="flex items-center gap-0.5">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Fit view to region" onClick={() => onFitTo?.(selected)}>
                  <Target className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Duplicate" onClick={() => duplicate(selected.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" title="Delete" onClick={() => { if (confirm(`Delete region "${selected.name}"?`)) remove(selected.id); }}>
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
            </div>

            <div>
              <Label className="text-[10px]">Linked entity (optional)</Label>
              <Input
                list="atlas-entity-ids"
                value={selected.entityId ?? ""}
                onChange={(e) => patch(selected.id, { entityId: e.target.value || undefined })}
                placeholder="entity id"
                className="h-7 text-xs"
              />
              {selected.entityId && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {project.entities.find((e) => e.id === selected.entityId)?.title ?? <span className="text-amber-500">unknown entity</span>}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <Label className="text-[10px]">Color</Label>
                <Input type="color" className="h-7 p-1" value={selected.color ?? "#7fb069"} onChange={(e) => patch(selected.id, { color: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px]">Points</Label>
                <div className="text-xs h-7 flex items-center text-muted-foreground">{selected.points.length}</div>
              </div>
            </div>

            <div>
              <div className="flex justify-between"><Label className="text-[10px]">Fill opacity</Label><span className="text-[10px] text-muted-foreground">{(selected.fillOpacity ?? 0.18).toFixed(2)}</span></div>
              <Slider min={0} max={1} step={0.05} value={[selected.fillOpacity ?? 0.18]} onValueChange={([v]) => patch(selected.id, { fillOpacity: v })} />
            </div>
            <div>
              <div className="flex justify-between"><Label className="text-[10px]">Stroke opacity</Label><span className="text-[10px] text-muted-foreground">{(selected.strokeOpacity ?? 0.85).toFixed(2)}</span></div>
              <Slider min={0} max={1} step={0.05} value={[selected.strokeOpacity ?? 0.85]} onValueChange={([v]) => patch(selected.id, { strokeOpacity: v })} />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
              <Label className="text-[10px]">Nudge whole region</Label>
              <div className="grid grid-cols-3 gap-1 w-28">
                <span />
                <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => translate(selected.id, 0, 100)}>↑</Button>
                <span />
                <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => translate(selected.id, -100, 0)}>←</Button>
                <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => translate(selected.id, 0, -100)}>↓</Button>
                <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => translate(selected.id, 100, 0)}>→</Button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground italic">
              Drag handles on the map to move vertices. Click midpoint dots to add a vertex. Right-click a vertex to delete it.
            </p>
          </div>
        )}

        {/* Quick add empty region (no drawing, for special cases). */}
        {!selected && !drawing && (
          <Button size="sm" variant="outline" onClick={startDraw} className="h-7 text-xs gap-1 w-full">
            <Plus className="h-3.5 w-3.5" /> New region
          </Button>
        )}

        <div className="pt-1 border-t border-border">
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => setAdvancedYaml((v) => !v)}>
            <Crosshair className="h-3 w-3" /> {advancedYaml ? "Hide" : "Show"} advanced YAML preview
          </Button>
        </div>

        <datalist id="atlas-entity-ids">
          {project.entities.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </datalist>
      </div>
    </TabFrame>
  );
}
