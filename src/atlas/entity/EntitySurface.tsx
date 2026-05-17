import { useState } from "react";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { EntityReadingView } from "@/atlas/entity/EntityReadingView";

export function EntitySurface({
  entity, entitiesById, renderEdit, onClose, placements, onOpenEntity, onShowOnMap,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  renderEdit: () => React.ReactNode;
  onClose: () => void;
  placements?: MapPlacement[];
  onOpenEntity?: (id: string) => void;
  onShowOnMap?: (p: MapPlacement) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs">
        <span className="font-medium truncate flex-1">{entity.title}</span>
        {editing ? (
          <button type="button" className="h-7 px-2 rounded border"
            onClick={() => setEditing(false)}>Back to reading</button>
        ) : (
          <button type="button" className="h-7 px-2 rounded border"
            onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {editing ? renderEdit() : (
          <EntityReadingView
            entity={entity}
            entitiesById={entitiesById}
            placements={placements}
            onOpenEntity={onOpenEntity}
            onClose={onClose}
            onShowOnMap={onShowOnMap}
          />
        )}
      </div>
    </div>
  );
}
