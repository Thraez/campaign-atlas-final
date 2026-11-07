import { Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCalmMode, useCalmMode } from "@/hooks/use-reduce-motion";

/**
 * Calm mode: the player's own "reduce motion" switch, beside the other view
 * toggles. It stops map flights, ocean waves and transitions (combined with
 * the OS setting in `useReduceMotion`) and also silences the soundscape.
 */
export function CalmModeToggle() {
  const calm = useCalmMode();
  return (
    <Button
      variant={calm ? "secondary" : "ghost"}
      size="sm"
      onClick={() => setCalmMode(!calm)}
      title="Calm mode: no map flights, waves, transitions or sound"
      aria-label="Calm mode"
      aria-pressed={calm}
    >
      <Wind className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
