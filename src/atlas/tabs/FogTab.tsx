/**
 * Fog tab — toggle fog overlay, edit base color. Reveal polygon geometry is
 * still authored in YAML; this UI focuses on the safe knobs and lets the
 * generated YAML preview show the rest.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { MapDocument, FogOverlay } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabFrame } from "./TabFrame";
import { dumpYaml, patchHeader } from "@/atlas/yaml/dump";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { downloadText } from "./download";

interface Props {
  map: MapDocument;
  blockingCount?: number;
  warningCount?: number;
  lastExportAt: number | null;
  onExported: () => void;
}

const DEFAULT_FOG = (mapId: string): FogOverlay => ({
  mapId,
  enabled: false,
  color: "rgba(0,0,0,0.55)",
  reveals: [],
});

export function FogTab({ map, blockingCount, warningCount, lastExportAt, onExported }: Props) {
  const base = map.fog ?? DEFAULT_FOG(map.id);
  const [draft, setDraft] = useState<FogOverlay | null>(null);
  const fog = draft ?? base;
  const dirty = draft !== null;

  const setField = <K extends keyof FogOverlay>(key: K, value: FogOverlay[K]) => {
    setDraft({ ...fog, [key]: value });
  };

  const yamlBlock = useMemo(() => dumpYaml({ maps: [{ id: map.id, fog }] }), [fog, map.id]);

  const exportPatch = () => {
    const content = patchHeader({
      title: `Fog patch — ${map.name}`,
      subject: `world.yaml > maps[id=${map.id}].fog`,
      applyTo: `content/<world>/_atlas/world.yaml (replace this map's fog: block)`,
    }) + yamlBlock;
    const result = validatePatchYaml(content, "world-map");
    if (!result.ok) { toast.error(result.errors[0]); return; }
    downloadText(`fog-patch-${map.id}.yaml`, content, "text/yaml");
    onExported();
  };

  return (
    <TabFrame
      title="Fog of war"
      builtFromYamlCount={base.reveals.length}
      localDraftCount={dirty ? 1 : 0}
      blockingCount={blockingCount}
      warningCount={warningCount}
      lastExportAt={lastExportAt}
      onExport={exportPatch}
      rawYamlPreview={yamlBlock}
    >
      <div className="flex items-center justify-between rounded-md border border-border p-2">
        <div>
          <div className="text-xs font-medium">Fog enabled</div>
          <div className="text-[10px] text-muted-foreground">When on, the map is covered except inside reveals.</div>
        </div>
        <Switch checked={fog.enabled} onCheckedChange={(v) => setField("enabled", v)} />
      </div>
      <div>
        <Label className="text-[10px]">Fog color (CSS)</Label>
        <Input
          value={fog.color ?? ""}
          placeholder="rgba(0,0,0,0.55)"
          onChange={(e) => setField("color", e.target.value || undefined)}
          className="h-7 text-xs"
        />
      </div>
      <div className="text-[10px] text-muted-foreground">
        {fog.reveals.length} reveal polygon{fog.reveals.length === 1 ? "" : "s"} (edit reveal coordinates in YAML
        for now — drawing tools coming in a later batch).
      </div>
      {dirty && (
        <Button size="sm" variant="ghost" onClick={() => setDraft(null)} className="text-xs">
          Discard local changes
        </Button>
      )}
    </TabFrame>
  );
}
