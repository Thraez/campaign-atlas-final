import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { resolvePinStyle, pinSvg, type PinPreset, type PinOverride } from "./presets";
import type { MapPlacement, Entity } from "@/atlas/content/schema";

interface PinLegendProps {
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
}

export function PinLegend({ placements, entityById }: PinLegendProps) {
  const [open, setOpen] = useState(false);

  const presets = useMemo<PinPreset[]>(() => {
    const seen = new Map<string, PinPreset>();
    for (const p of placements) {
      const entity = entityById.get(p.entityId);
      const preset = resolvePinStyle(entity?.type, p.pin as PinOverride | undefined);
      if (!seen.has(preset.id)) {
        seen.set(preset.id, preset);
      }
    }
    return Array.from(seen.values());
  }, [placements, entityById]);

  if (presets.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-[500] select-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded bg-background/90 border border-border shadow-sm px-2 py-1 text-xs text-foreground hover:bg-accent transition-colors"
        aria-expanded={open}
        aria-label={open ? "Collapse pin legend" : "Expand pin legend"}
        title="Pin legend"
      >
        <span className="text-[11px] leading-none">Legend</span>
        {open ? (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="mt-1 rounded bg-background/95 border border-border shadow-md px-2 py-1.5 min-w-[120px]">
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-2 py-0.5">
              <span
                className="shrink-0 flex items-center justify-center w-5 h-5"
                aria-hidden="true"
                // pinSvg generates known-safe SVG from internal preset constants (no user input)
                dangerouslySetInnerHTML={{
                  __html: pinSvg({ color: preset.color, shape: preset.shape }),
                }}
              />
              <span className="text-[11px] text-foreground leading-tight">{preset.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
