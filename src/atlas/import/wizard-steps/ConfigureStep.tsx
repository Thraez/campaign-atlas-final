import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { idFromFilename, type ImportImage, type ImportMode } from "../mapImport";
import { Field } from "./Field";

export function ConfigureStep({
  images,
  updateAssignment,
  mode,
}: {
  images: ImportImage[];
  updateAssignment: (id: string, patch: Partial<ImportImage["assignment"]>) => void;
  mode: ImportMode;
}) {
  return (
    <div className="space-y-3 p-1">
      <p className="text-[11px] text-muted-foreground">
        Auto-generated from filenames. Edit anything that should differ from defaults.
      </p>
      {images.map((img) => (
        <div key={img.id} className="rounded-md border border-border p-3 bg-card/50 space-y-2">
          <div className="flex items-center gap-2">
            <img src={img.dataUrl} alt="" className="h-8 w-8 rounded object-cover bg-muted" />
            <div className="text-xs font-mono truncate flex-1">{img.originalFilename}</div>
          </div>
          {(img.assignment.createNewMap || mode === "custom") && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Map id">
                <Input
                  value={img.assignment.mapId}
                  onChange={(e) =>
                    updateAssignment(img.id, { mapId: idFromFilename(e.target.value) })
                  }
                  className="h-7 text-xs font-mono"
                />
              </Field>
              <Field label="Map name">
                <Input
                  value={img.assignment.mapName}
                  onChange={(e) => updateAssignment(img.id, { mapName: e.target.value })}
                  className="h-7 text-xs"
                />
              </Field>
              <Field label="World id">
                <Input
                  value={img.assignment.worldId}
                  onChange={(e) => updateAssignment(img.id, { worldId: e.target.value })}
                  className="h-7 text-xs font-mono"
                />
              </Field>
              {mode === "custom" && (
                <Field label="Create new map">
                  <Switch
                    checked={img.assignment.createNewMap}
                    onCheckedChange={(v) => updateAssignment(img.id, { createNewMap: v })}
                  />
                </Field>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Layer id">
              <Input
                value={img.assignment.layerId}
                onChange={(e) =>
                  updateAssignment(img.id, { layerId: idFromFilename(e.target.value) })
                }
                className="h-7 text-xs font-mono"
              />
            </Field>
            <Field label="Target asset path">
              <Input
                value={img.assignment.targetAssetPath}
                onChange={(e) => updateAssignment(img.id, { targetAssetPath: e.target.value })}
                className="h-7 text-xs font-mono"
              />
            </Field>
            <Field label="Opacity (0-1)">
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={img.assignment.opacity}
                onChange={(e) => updateAssignment(img.id, { opacity: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </Field>
            <Field label="Z-index">
              <Input
                type="number"
                value={img.assignment.zIndex}
                onChange={(e) => updateAssignment(img.id, { zIndex: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </Field>
            {mode === "variants" && (
              <Field label="Variant">
                <Select
                  value={img.assignment.variant ?? "player"}
                  onValueChange={(v) => updateAssignment(img.id, { variant: v as "player" | "dm" })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player" className="text-xs">
                      player
                    </SelectItem>
                    <SelectItem value="dm" className="text-xs">
                      dm
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
