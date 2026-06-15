import { Grid3x3, Globe2, Droplets, Waves } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GridKind, GridOverlay, MapDocument, WaterConfig } from "@/atlas/content/schema";
import { deriveCrestColor, DEFAULT_WATER } from "@/atlas/ocean/resolveWater";

interface Props {
  map: MapDocument;
  baseMap: MapDocument;
  onPatch: (patch: Partial<MapDocument>) => void;
  onReset: () => void;
}

const DEFAULT_GRID: GridOverlay = { kind: "square", size: 256, color: "rgba(255,255,255,0.08)", enabled: true };

export function MapSettingsPanel({ map, onPatch }: Props) {
  const grid = map.grid ?? DEFAULT_GRID;
  const gridEnabled = grid.enabled !== false;

  const setGrid = (patch: Partial<GridOverlay>) => {
    onPatch({ grid: { ...grid, ...patch } });
  };

  const water = map.water ?? {};
  const waterEnabled = water.enabled !== false;
  const derivedCrest = deriveCrestColor(map.oceanColor ?? "#18313f");

  const setWater = (patch: Partial<WaterConfig>) => {
    onPatch({ water: { ...water, ...patch } });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="text-xs text-muted-foreground">
          Changes are saved with the editor's Save button.
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-5">
        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Map size</div>
          <p className="text-[10px] text-muted-foreground">Width and height in pixels. Matches your uploaded map image.</p>
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
            <Droplets className="h-3 w-3" /> Background color
          </div>
          <p className="text-[10px] text-muted-foreground">Fills behind the map and any area the map doesn't cover.</p>
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

        <section className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Waves className="h-3 w-3" /> Living water
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                data-testid="water-toggle"
                checked={waterEnabled}
                onChange={(e) => setWater({ enabled: e.target.checked })}
              />
              animated
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Gentle wave animation behind the map. Turn off to use a flat background colour.
          </p>
          {waterEnabled && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Strength {Math.round((water.intensity ?? DEFAULT_WATER.intensity) * 100)}%
                </Label>
                <Slider
                  data-testid="water-strength"
                  min={0}
                  max={1}
                  step={0.05}
                  value={[water.intensity ?? DEFAULT_WATER.intensity]}
                  onValueChange={([v]) => setWater({ intensity: v })}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">
                  Speed {Math.round((water.speed ?? DEFAULT_WATER.speed) * 100)}%
                </Label>
                <Slider
                  data-testid="water-speed"
                  min={0}
                  max={1}
                  step={0.05}
                  value={[water.speed ?? DEFAULT_WATER.speed]}
                  onValueChange={([v]) => setWater({ speed: v })}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Wave colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    data-testid="water-crest-color-picker"
                    value={water.crestColor ?? derivedCrest}
                    onChange={(e) => setWater({ crestColor: e.target.value })}
                    className="h-8 w-12 rounded border border-border bg-transparent cursor-pointer"
                  />
                  <Input
                    data-testid="water-crest-color-input"
                    value={water.crestColor ?? ""}
                    placeholder={derivedCrest}
                    onChange={(e) => setWater({ crestColor: e.target.value || undefined })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!map.wrapX}
              onChange={(e) => onPatch({ wrapX: e.target.checked })}
            />
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            Wrap east–west
          </label>
          <p className="text-[10px] text-muted-foreground pl-5">
            For whole-planet maps, so the east edge meets the west.
          </p>
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Grid3x3 className="h-3 w-3" /> Grid
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
              <Label className="text-[10px] text-muted-foreground">Style</Label>
              <Select value={grid.kind} onValueChange={(v) => setGrid({ kind: v as GridKind })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="square" className="text-xs">Square</SelectItem>
                  <SelectItem value="hex" className="text-xs">Hex (pointy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Cell size</Label>
              <Input type="number" min={4} value={grid.size} onChange={(e) => setGrid({ size: Math.max(4, Number(e.target.value)) })} className="h-7 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Line color</Label>
            <Input
              value={grid.color ?? ""}
              placeholder="rgba(255,255,255,0.08)"
              onChange={(e) => setGrid({ color: e.target.value })}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Opacity {(extractAlpha(grid.color) * 100).toFixed(0)}%
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
    </div>
  );
}

function extractAlpha(color: string | undefined): number {
  if (!color) return 0.08;
  const m = color.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  if (m) return Math.max(0, Math.min(1, parseFloat(m[1])));
  return 1;
}
