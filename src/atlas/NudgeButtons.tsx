import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NUDGE_COARSE, NUDGE_FINE, nudgeStep } from "@/atlas/nudgeStep";

interface NudgeButtonsProps {
  /** Called with the direction vector already scaled by the resolved step. */
  onNudge: (dx: number, dy: number) => void;
  label?: string;
}

/** Shared arrow-pad nudge control: plain click = fine step, Shift+click = coarse step. */
export function NudgeButtons({ onNudge, label = "Nudge" }: NudgeButtonsProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px]">
        {label}{" "}
        <span className="text-muted-foreground font-normal">
          ({NUDGE_FINE} · ⇧{NUDGE_COARSE})
        </span>
      </Label>
      <div className="grid grid-cols-3 gap-1 w-28">
        <span />
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs p-0"
          onClick={(e) => onNudge(0, nudgeStep(e.shiftKey))}
        >
          ↑
        </Button>
        <span />
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs p-0"
          onClick={(e) => onNudge(-nudgeStep(e.shiftKey), 0)}
        >
          ←
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs p-0"
          onClick={(e) => onNudge(0, -nudgeStep(e.shiftKey))}
        >
          ↓
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs p-0"
          onClick={(e) => onNudge(nudgeStep(e.shiftKey), 0)}
        >
          →
        </Button>
      </div>
    </div>
  );
}
