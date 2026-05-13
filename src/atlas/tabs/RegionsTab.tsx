/**
 * Regions tab — list, edit visibility/name, export world.yaml regions patch.
 *
 * Geometry editing on the map is not provided here yet. Regions come from
 * world.yaml and are edited as form rows; the raw YAML preview below shows
 * exactly what will be written. Export goes through the unified patch engine
 * so the YAML is validated before download.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AtlasProject, MapDocument, Region, EntityVisibility } from "@/atlas/content/schema";
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

type Draft = Record<string, Partial<Region>>;

export function RegionsTab({ project, map, blockingCount, warningCount, lastExportAt, onExported }: Props) {
  const baseRegions = map.regions ?? [];
  const [draft, setDraft] = useState<Draft>({});

  const merged: Region[] = useMemo(
    () => baseRegions.map((r) => ({ ...r, ...(draft[r.id] ?? {}) })),
    [baseRegions, draft]
  );

  const dirtyCount = Object.keys(draft).length;

  const setField = <K extends keyof Region>(id: string, key: K, value: Region[K]) => {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [key]: value } }));
  };

  const yamlBlock = useMemo(() => {
    if (!merged.length) return "";
    return dumpYaml({ maps: [{ id: map.id, regions: merged.map((r) => stripUndefined(r as unknown as Record<string, unknown>)) }] });
  }, [merged, map.id]);

  const exportPatch = () => {
    if (!merged.length) {
      toast.warning("No regions to export.");
      return;
    }
    const content =
      patchHeader({
        title: `Regions patch — ${map.name}`,
        subject: `world.yaml > maps[id=${map.id}].regions`,
        applyTo: `content/<world>/_atlas/world.yaml (replace this map's regions: list)`,
        notes: ["This patch only updates regions: — keep your maps[].layers/routes/fog as is."],
      }) + yamlBlock;
    const result = validatePatchYaml(content, "world-map");
    if (!result.ok) {
      toast.error(result.errors[0]);
      return;
    }
    downloadText(`regions-patch-${map.id}.yaml`, content, "text/yaml");
    onExported();
  };

  return (
    <TabFrame
      title="Regions"
      builtFromYamlCount={baseRegions.length}
      localDraftCount={dirtyCount}
      blockingCount={blockingCount}
      warningCount={warningCount}
      lastExportAt={lastExportAt}
      onExport={exportPatch}
      exportDisabled={merged.length === 0}
      rawYamlPreview={yamlBlock}
    >
      {merged.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No regions defined for this map yet. Add a regions: list under this map in world.yaml,
          rebuild, then come back here to edit.
        </p>
      )}
      {merged.map((r) => {
        const isEdited = !!draft[r.id];
        return (
          <div key={r.id} className="rounded-md border border-border p-2 space-y-2 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">{r.id}</span>
              {isEdited && <span className="text-[10px] text-primary">edited</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Name</Label>
                <Input
                  value={r.name}
                  onChange={(e) => setField(r.id, "name", e.target.value)}
                  className="h-7 text-xs"
                />
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
                  placeholder="#7fb069"
                  onChange={(e) => setField(r.id, "color", e.target.value || undefined)}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px]">Linked entity</Label>
                <Input
                  value={r.entityId ?? ""}
                  list="atlas-entity-ids"
                  onChange={(e) => setField(r.id, "entityId", e.target.value || undefined)}
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {r.points.length} points (edit polygon shape directly in YAML for now)
            </div>
          </div>
        );
      })}
      {/* shared datalist used by region/route/fog editors */}
      <datalist id="atlas-entity-ids">
        {project.entities.map((e) => (
          <option key={e.id} value={e.id}>{e.title}</option>
        ))}
      </datalist>
      {dirtyCount > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setDraft({})} className="text-xs">
          Discard local changes
        </Button>
      )}
    </TabFrame>
  );
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
