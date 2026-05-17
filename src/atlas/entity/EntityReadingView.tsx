import { useMemo } from "react";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

export function EntityReadingView({
  entity, entitiesById, placements = [], onOpenEntity, onClose, onShowOnMap,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  placements?: MapPlacement[];
  onOpenEntity?: (id: string) => void;
  onClose?: () => void;
  onShowOnMap?: (p: MapPlacement) => void;
}) {
  const projected = useMemo(
    () => projectEntityForPlayer(entity, buildProjectionContext(entitiesById)),
    [entity, entitiesById],
  );
  const notYetVisible = !PLAYER_VISIBLE.has(entity.visibility);
  return (
    <div className="flex flex-col h-full">
      {notYetVisible && (
        <div className="px-3 py-1.5 text-[11px] bg-amber-500/15 text-amber-200 border-b border-amber-500/30">
          Not yet visible to players — this is how it will look once its visibility is player/rumor.
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <EntityPanel
          entity={projected}
          placements={placements}
          entityById={entitiesById}
          onOpenEntity={onOpenEntity ?? (() => {})}
          onClose={onClose ?? (() => {})}
          onShowOnMap={onShowOnMap ?? (() => {})}
          readerAffordances={false}
        />
      </div>
    </div>
  );
}
