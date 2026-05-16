// src/atlas/pins/PinStateBadge.tsx
import { MapPin, MapPinOff } from "lucide-react";

export function PinStateBadge({ placed }: { placed: boolean }) {
  return placed ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
      <MapPin className="h-3 w-3" /> Placed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <MapPinOff className="h-3 w-3" /> Not on map
    </span>
  );
}
