import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileCode, RotateCcw, Grid3x3, Globe2, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GridKind, GridOverlay, MapDocument } from "@/atlas/content/schema";
import { ExportChecklistDialog, useExportChecklist } from "./ExportChecklistDialog";
import { validatePatchYaml } from "./yaml/validatePatch";

interface Props {
  map: MapDocument;
  baseMap: MapDocument;
  onPatch: (patch: Partial<MapDocument>) => void;
  onReset: () => void;
}

function downloadText(name: string, content: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.success(`Downloaded ${name}`);
}

const DEFAULT_GRID: GridOverlay = { kind: "square", size: 256, color: "rgba(255,255,255,0.08)", enabled: true };

export function MapSettingsPanel({ map, baseMap, onPatch, onReset }: Props) {
  const checklist = useExportChecklist();
  const dirtyKeys = useMemo<string[]>(() => {
    const keys: string[] = [];
    if (map.width !== baseMap.width || map.height !== baseMap.height) keys.push("size");
    if ((map.oceanColor ?? "") !== (baseMap.oceanColor ?? "")) keys.push("oceanColor");
    if (!!map.wrapX !== !!baseMap.wrapX) keys.push("wrapX");
    if (JSON.stringify(map.grid ?? null) !== JSON.stringify(baseMap.grid ?? null)) keys.push("grid");
    return keys;
  }, [map, baseMap]);

  const grid = map.grid ?? DEFAULT_GRID;
  const gridEnabled = grid.enabled !== false;

  const setGrid = (patch: Partial<GridOverlay>) => {
    onPatch({ grid: { ...grid, ...patch } });
  };

  const exportPatch = () => {
    const lines: string[] = [];
    lines.push(`# Map settings patch — ${map.name} (${map.id})`);
    lines.push(`# Generated ${new Date().toISOString()}`);
    lines.push(`#`);
    lines.push(`# HOW TO APPLY:`);
    lines.push(`# Open content/<world>/_atlas/world.yaml and find the entry under "maps:"`);
    lines.push(`# whose id is "${map.id}". REPLACE its settings (width/height/oceanColor/`);
    lines.push(`# wrapX/grid) with the YAML below. Keep the existing layers: section.`);
    lines.push(`# DO NOT paste the # comments, and DO NOT wrap in markdown fences.`);
    lines.push(``);
    lines.push(`maps:`);
    lines.push(`  - id: ${map.id}`);
    lines.push(`    width: ${map.width}`);
    lines.push(`    height: ${map.height}`);
    if (map.oceanColor) lines.push(`    oceanColor: "${map.oceanColor}"`);
    lines.push(`    wrapX: ${!!map.wrapX}`);
    if (map.grid) {
      lines.push(`    grid:`);
      lines.push(`      kind: ${map.grid.kind}`);
      lines.push(`      size: ${map.grid.size}`);
      if (map.grid.color) lines.push(`      color: "${map.grid.color}"`);
      lines.push(`      enabled: ${map.grid.enabled !== false}`);
    }
    const content = lines.join("\n");
    const result = validatePatchYaml(content, "settings");
    if (!result.ok) {
      toast.error(`Patch validation failed: ${result.errors[0]}`);
      return;
    }
    if (result.warnings.length) toast.warning(result.warnings[0]);
    downloadText(`map-settings-${map.id}.yaml`, content, "text/yaml");
    checklist.show({
      title: "Map settings patch exported",
      description: "Your map settings YAML patch is ready. Follow the checklist to commit it.",
      files: [`map-settings-${map.id}.yaml`],
      steps: [
        { label: "Open the downloaded .yaml file", detail: "It is pure YAML — only non-comment lines belong in world.yaml." },
        { label: "Paste under the matching map entry", detail: `In content/<world>/_atlas/world.yaml, find the map with id "${map.id}" and replace its settings with the YAML below the comment header. Do not paste markdown code fences.` },
        { label: "Commit changes to main", detail: "Push the updated world.yaml." },
        { label: "GitHub Action publishes automatically", detail: "The publish-atlas.yml workflow will run and deploy to GitHub Pages." },
      ],
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="text-xs text-muted-foreground">
          Edits are <strong>local browser drafts</strong>. Export the patch and commit to <code>world.yaml</code> to publish.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" className="flex-1 gap-1.5" onClick={exportPatch}>
            <FileCode className="h-3.5 w-3.5" /> Export patch
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset} disabled={dirtyKeys.length === 0} title="Discard local edits">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {dirtyKeys.length > 0 && (
          <div className="text-[10px] text-amber-300/80">
            Unsaved: {dirtyKeys.join(", ")}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-5">
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Canvas size</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Width</Label>
              <Input type="number" value={Math.round(map.width)} onChange={(e) => onPatch({ width: Math.max(1, Number(e.target.value)) })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Height</Label>
              <Input type="number" value={Math.round(map.height)} onChange={(e) => onPatch({ height: Math.max(1, Number(e.target.value)) })} className="h-7 text-xs" />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Droplets className="h-3 w-3" /> Ocean / background color
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={map.oceanColor ?? "#18313f"}
              onChange={(e) => onPatch({ oceanColor: e.target.value })}
              className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer"
            />
            <Input
              value={map.oceanColor ?? ""}
              placeholder="#18313f"
              onChange={(e) => onPatch({ oceanColor: e.target.value })}
              className="h-8 text-xs font-mono"
            />
          </div>
        </section>

        <section className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!map.wrapX}
              onChange={(e) => onPatch({ wrapX: e.target.checked })}
            />
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            Wrap horizontally (planet/longitude)
          </label>
          <p className="text-[10px] text-muted-foreground pl-5">
            Stored in <code>world.yaml</code>. Visual wrap-rendering is a future enhancement.
          </p>
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Grid3x3 className="h-3 w-3" /> Grid overlay
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={gridEnabled}
                onChange={(e) => setGrid({ enabled: e.target.checked })}
              />
              enabled
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Kind</Label>
              <Select value={grid.kind} onValueChange={(v) => setGrid({ kind: v as GridKind })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="square" className="text-xs">Square</SelectItem>
                  <SelectItem value="hex" className="text-xs">Hex (pointy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Cell size (px)</Label>
              <Input type="number" min={4} value={grid.size} onChange={(e) => setGrid({ size: Math.max(4, Number(e.target.value)) })} className="h-7 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Color</Label>
            <Input
              value={grid.color ?? ""}
              placeholder="rgba(255,255,255,0.08)"
              onChange={(e) => setGrid({ color: e.target.value })}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Quick opacity {(extractAlpha(grid.color) * 100).toFixed(0)}%
            </Label>
            <Slider
              min={0}
              max={1}
              step={0.02}
              value={[extractAlpha(grid.color)]}
              onValueChange={([v]) => setGrid({ color: `rgba(255,255,255,${v.toFixed(2)})` })}
            />
          </div>
        </section>
      </div>
      <ExportChecklistDialog
        open={checklist.open}
        onOpenChange={checklist.setOpen}
        title={checklist.state.title}
        description={checklist.state.description}
        files={checklist.state.files}
        steps={checklist.state.steps}
      />
    </div>
  );
}

function extractAlpha(color: string | undefined): number {
  if (!color) return 0.08;
  const m = color.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  if (m) return Math.max(0, Math.min(1, parseFloat(m[1])));
  return 1;
}
