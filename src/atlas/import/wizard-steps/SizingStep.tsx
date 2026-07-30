import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ImportImage, SizingMode } from "../mapImport";
import { Field } from "./Field";

export function SizingStep({
  images,
  updateAssignment,
  hasCurrentMap,
}: {
  images: ImportImage[];
  updateAssignment: (id: string, patch: Partial<ImportImage["assignment"]>) => void;
  hasCurrentMap: boolean;
}) {
  const sizingOpts: Array<{ id: SizingMode; label: string; needsCurrent?: boolean }> = [
    { id: "natural", label: "Use natural image size as map size" },
    { id: "stretch-to-current", label: "Stretch to current map", needsCurrent: true },
    { id: "center-natural", label: "Center at natural size", needsCurrent: true },
    { id: "fit-within-current", label: "Fit within current map", needsCurrent: true },
    { id: "custom", label: "Custom width/height" },
  ];
  return (
    <div className="space-y-3 p-1">
      {images.map((img) => (
        <div key={img.id} className="rounded-md border border-border p-3 bg-card/50 space-y-2">
          <div className="text-xs font-mono truncate">
            {img.originalFilename} · {img.naturalWidth}×{img.naturalHeight}
          </div>
          <Field label="Sizing mode">
            <Select
              value={img.assignment.sizing}
              onValueChange={(v) => updateAssignment(img.id, { sizing: v as SizingMode })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sizingOpts.map((o) => (
                  <SelectItem
                    key={o.id}
                    value={o.id}
                    className="text-xs"
                    disabled={o.needsCurrent && !hasCurrentMap}
                  >
                    {o.label}
                    {o.needsCurrent && !hasCurrentMap ? " (need current map)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {img.assignment.sizing === "custom" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Width">
                <Input
                  type="number"
                  value={img.assignment.customWidth ?? img.naturalWidth}
                  onChange={(e) =>
                    updateAssignment(img.id, { customWidth: Number(e.target.value) })
                  }
                  className="h-7 text-xs"
                />
              </Field>
              <Field label="Height">
                <Input
                  type="number"
                  value={img.assignment.customHeight ?? img.naturalHeight}
                  onChange={(e) =>
                    updateAssignment(img.id, { customHeight: Number(e.target.value) })
                  }
                  className="h-7 text-xs"
                />
              </Field>
              <Field label="Keep aspect">
                <Switch
                  checked={img.assignment.keepAspect}
                  onCheckedChange={(v) => updateAssignment(img.id, { keepAspect: v })}
                />
              </Field>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
