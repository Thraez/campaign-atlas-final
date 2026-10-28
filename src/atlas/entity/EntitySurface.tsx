import { useEffect, useRef, useState } from "react";
import type { Entity, ExcludedNoteName } from "@/atlas/content/schema";
import { EntityPanes } from "@/atlas/entity/EntityPanes";

export function EntitySurface({
  entity,
  entitiesById,
  excludedNotes,
  renderEdit,
  onClose,
  startInEdit = false,
  editRequest = 0,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  /** Folder-excluded notes from the DM build report: their links redact in the player preview. */
  excludedNotes?: readonly ExcludedNoteName[];
  renderEdit: () => React.ReactNode;
  onClose: () => void;
  /**
   * Open straight into Edit rather than Reading. Used by the "File as …" action
   * on a misfiled note: reading mode never mounts the edit panel, so the
   * requested type would not be applied and the click would appear to do
   * nothing. Reading stays the default for every other way in.
   */
  startInEdit?: boolean;
  /**
   * Bump to ask for Edit (Save pointing to an unsaved entity edit). Switches a
   * Reading surface to Edit and focuses the form; an open Edit pane stays
   * mounted, so its banners and any in-flight work survive.
   */
  editRequest?: number;
}) {
  const [editing, setEditing] = useState(startInEdit);
  const [seenEditRequest, setSeenEditRequest] = useState(editRequest);
  if (editRequest !== seenEditRequest) {
    setSeenEditRequest(editRequest);
    setEditing(true);
  }
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editRequest === 0) return;
    rootRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [editRequest]);
  return (
    <div ref={rootRef} className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs">
        <span className="font-medium truncate flex-1">{entity.title}</span>
        <button
          type="button"
          className="h-7 px-2 rounded border"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Back to reading" : "Edit"}
        </button>
        <button
          type="button"
          aria-label="Close panel"
          className="h-7 px-2 rounded border"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <EntityPanes
          entity={entity}
          entitiesById={entitiesById}
          excludedNotes={excludedNotes}
          mode={editing ? "editing" : "reading"}
          renderEdit={renderEdit}
        />
      </div>
    </div>
  );
}
