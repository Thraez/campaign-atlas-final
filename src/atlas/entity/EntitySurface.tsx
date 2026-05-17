import { useState } from "react";
import type { Entity } from "@/atlas/content/schema";
import { EntityPanes } from "@/atlas/entity/EntityPanes";

export function EntitySurface({
  entity, entitiesById, renderEdit, onClose,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  renderEdit: () => React.ReactNode;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs">
        <span className="font-medium truncate flex-1">{entity.title}</span>
        <button type="button" className="h-7 px-2 rounded border"
          onClick={() => setEditing((v) => !v)}>
          {editing ? "Back to reading" : "Edit"}
        </button>
        <button type="button" aria-label="Close panel" className="h-7 px-2 rounded border"
          onClick={onClose}>✕</button>
      </div>
      <div className="flex-1 overflow-hidden">
        <EntityPanes
          entity={entity}
          entitiesById={entitiesById}
          mode={editing ? "editing" : "reading"}
          renderEdit={renderEdit}
        />
      </div>
    </div>
  );
}
