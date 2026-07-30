import type { ImportMode } from "../mapImport";

export function ModeStep({
  mode,
  onChange,
  hasCurrentMap,
}: {
  mode: ImportMode;
  onChange: (m: ImportMode) => void;
  hasCurrentMap: boolean;
}) {
  const opts: Array<{ id: ImportMode; label: string; desc: string; needsCurrent?: boolean }> = [
    {
      id: "layers",
      label: "Add as layers on current map",
      desc: "All images become extra layers on the active map.",
      needsCurrent: true,
    },
    {
      id: "per-image",
      label: "One map per image",
      desc: "Each image creates its own map at its natural size.",
    },
    {
      id: "world-plus-regional",
      label: "World map + regional maps",
      desc: "First image is the overview; the rest are regional maps.",
    },
    {
      id: "variants",
      label: "Player + DM variants",
      desc: "Pair images by filename — second image becomes the DM-only layer.",
      needsCurrent: true,
    },
    {
      id: "custom",
      label: "Advanced custom assignment",
      desc: "Configure each image's map/layer manually in the next step.",
    },
  ];
  return (
    <div className="space-y-2 p-1">
      {opts.map((o) => {
        const disabled = o.needsCurrent && !hasCurrentMap;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => !disabled && onChange(o.id)}
            disabled={disabled}
            className={`w-full text-left rounded-md border p-3 transition ${
              mode === o.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
            {disabled && (
              <div className="text-[10px] text-amber-500 mt-1">Requires an active map</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
