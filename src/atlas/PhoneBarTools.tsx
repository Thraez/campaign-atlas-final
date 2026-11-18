import { Grid3x3, Ruler, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCalmMode, useCalmMode } from "@/hooks/use-reduce-motion";
import { OfflineMenu } from "@/atlas/OfflineStatus";

const ROW = "w-full justify-start gap-3 px-3 font-normal";

/**
 * The controls the phone top bar hands to the menu drawer (R-38): grid, distance
 * ruler, calm mode and offline options. Same actions and labels as the desktop
 * bar's buttons, as full-width rows. (The campaign name is the drawer's title.)
 */
export function PhoneBarTools({
  grid,
  rulerActive,
  onToggleRuler,
  close,
}: {
  /** Present when the map has a grid. */
  grid?: { on: boolean; toggle: () => void };
  rulerActive: boolean;
  onToggleRuler: () => void;
  close: () => void;
}) {
  const calm = useCalmMode();
  return (
    <>
      {grid && (
        <Button
          variant={grid.on ? "secondary" : "ghost"}
          className={ROW}
          onClick={grid.toggle}
          aria-label="Toggle grid overlay"
          aria-pressed={grid.on}
        >
          <Grid3x3 className="h-4 w-4" aria-hidden="true" />
          Grid
        </Button>
      )}
      <Button
        variant={rulerActive ? "secondary" : "ghost"}
        className={ROW}
        onClick={() => {
          onToggleRuler();
          close();
        }}
        aria-label="Toggle distance ruler"
        aria-pressed={rulerActive}
      >
        <Ruler className="h-4 w-4" aria-hidden="true" />
        Measure distance
      </Button>
      <Button
        variant={calm ? "secondary" : "ghost"}
        className={ROW}
        onClick={() => setCalmMode(!calm)}
        title="Calm mode: no map flights, waves, transitions or sound"
        aria-label="Calm mode"
        aria-pressed={calm}
      >
        <Wind className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1 text-left">Calm mode</span>
        <span className="text-xs text-muted-foreground">{calm ? "On" : "Off"}</span>
      </Button>
      <OfflineMenu row />
    </>
  );
}
