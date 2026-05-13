/**
 * Routes tab — list, edit metadata, export world.yaml routes patch.
 *
 * Waypoint geometry edits go through the YAML preview for now; this tab
 * focuses on safe metadata edits (name/mode/visibility/color) and on routing
 * everything through the unified patch engine.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AtlasProject, MapDocument, Route, EntityVisibility, RouteMode } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabFrame } from "./TabFrame";
import { dumpYaml, patchHeader } from "@/atlas/yaml/dump";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { downloadText } from "./download";

interface Props {
  project: AtlasProject;
  map: MapDocument;
  blockingCount?: number;
  warningCount?: number;
  lastExportAt: number | null;
  onExported: () => void;
}

type Draft = Record<string, Partial<Route>>;
const MODES: RouteMode[] = ["foot", "horse", "ship", "cart", "fly", "custom"];

export function RoutesTab({ project, map, blockingCount, warningCount, lastExportAt, onExported }: Props) {
  const base = map.routes ?? [];
  const [draft, setDraft] = useState<Draft>({});
  const merged = useMemo(() => base.map((r) => ({ ...r, ...(draft[r.id] ?? {}) })), [base, draft]);
  const dirty = Object.keys(draft).length;

  const setField = <K extends keyof Route>(id: string, key: K, value: Route[K]) => {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [key]: value } }));
  };

  const yamlBlock = useMemo(() => {
    if (!merged.length) return "";
    return dumpYaml({ maps: [{ id: map.id, routes: merged.map(stripUndefined) }] });
  }, [merged, map.id]);

  const exportPatch = () => {
    if (!merged.length) { toast.warning("No routes to export."); return; }
    const content = patchHeader({
      title: `Routes patch — ${map.name}`,
      subject: `world.yaml > maps[id=${map.id}].routes`,
      applyTo: `content/<world>/_atlas/world.yaml (replace this map's routes: list)`,
    }) + yamlBlock;
    const result = validatePatchYaml(content, "world-map");
    if (!result.ok) { toast.error(result.errors[0]); return; }
    downloadText(`routes-patch-${map.id}.yaml`, content, "text/yaml");
    onExported();
  };

  return (
    <TabFrame
      title="Routes"
      builtFromYamlCount={base.length}
      localDraftCount={dirty}
      blockingCount={blockingCount}
      warningCount={warningCount}
      lastExportAt={lastExportAt}
      onExport={exportPatch}
      exportDisabled={merged.length === 0}
      rawYamlPreview={yamlBlock}
    >
      {merged.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No routes defined for this map yet.</p>
      )}
      {merged.map((r) => {
        const edited = !!draft[r.id];
        return (
          <div key={r.id} className="rounded-md border border-border p-2 space-y-2 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">{r.id}</span>
              {edited && <span className="text-[10px] text-primary">edited</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Name</Label>
                <Input value={r.name} onChange={(e) => setField(r.id, "name", e.target.value)} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">Mode</Label>
                <Select value={r.mode ?? "foot"} onValueChange={(v) => setField(r.id, "mode", v as RouteMode)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Visibility</Label>
                <Select value={r.visibility} onValueChange={(v) => setField(r.id, "visibility", v as EntityVisibility)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player" className="text-xs">player</SelectItem>
                    <SelectItem value="dm" className="text-xs">dm</SelectItem>
                    <SelectItem value="hidden" className="text-xs">hidden</SelectItem>
                    <SelectItem value="rumor" className="text-xs">rumor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Color</Label>
                <Input
                  value={r.color ?? ""}
                  onChange={(e) => setField(r.id, "color", e.target.value || undefined)}
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {r.waypoints.length} waypoints (edit waypoint geometry in YAML for now)
            </div>
          </div>
        );
      })}
      {dirty > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setDraft({})} className="text-xs">
          Discard local changes
        </Button>
      )}
      {/* mute unused-import lint */}
      <span className="hidden">{project.entities.length}</span>
    </TabFrame>
  );
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
