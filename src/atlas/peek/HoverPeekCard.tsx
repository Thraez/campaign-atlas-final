import { MapPin } from "lucide-react";
import type { Entity } from "../content/schema";
import { normalizeAtlasAssetUrl } from "../url";
import { AtlasImage } from "../content/AtlasImage";
import { playerTypeLabel } from "../content/typeLabel";

export interface HoverPeekCardProps {
  entity: Entity;
  hasPlacement: boolean;
  onOpen: () => void;
  onFlyToMap: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HoverPeekCard({
  entity,
  hasPlacement,
  onOpen,
  onFlyToMap,
  onMouseEnter,
  onMouseLeave,
}: HoverPeekCardProps) {
  const img =
    entity.images.length > 0 && entity.images[0] ? normalizeAtlasAssetUrl(entity.images[0]) : null;
  const typeLabel = playerTypeLabel(entity.type);
  return (
    <div
      role="dialog"
      aria-label={`${entity.title} preview`}
      aria-modal="false"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="atlas-peek-card w-60 rounded-lg border bg-background p-3 shadow-md"
    >
      <div className="flex items-start gap-2.5">
        {img && (
          <AtlasImage
            src={img}
            alt={entity.title}
            className="flex-none rounded-md object-cover"
            fallbackClassName="flex-none rounded-md bg-muted/30 border border-dashed border-border flex items-center justify-center text-[9px] text-muted-foreground text-center leading-tight px-1"
            style={{ height: 52, width: 52 }}
          />
        )}
        <div className="min-w-0 flex-1">
          {typeLabel && (
            <span className="mb-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {typeLabel}
            </span>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="block text-left text-sm font-medium hover:underline"
          >
            {entity.title}
          </button>
        </div>
        {hasPlacement && (
          <button
            type="button"
            onClick={onFlyToMap}
            aria-label={`Show ${entity.title} on the map`}
            className="flex-none rounded-md border p-1.5 text-primary hover:bg-accent"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {entity.summary && (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">{entity.summary}</p>
      )}
    </div>
  );
}
