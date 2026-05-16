// src/atlas/categories/EntityEditorPanel.tsx
import { useState } from "react";
import type { CategoryId } from "@/atlas/content/entityCategory";
import type { EntityVisibility } from "@/atlas/content/schema";

export interface NewEntityDraft {
  category: CategoryId;
  title: string;
  summary?: string;
  visibility: EntityVisibility;
  kind?: string;
}

export function EntityEditorPanel({
  mode, category, onCreate, onCancel, fullFields,
}: {
  mode: "create" | "edit";
  category: CategoryId;
  onCreate: (draft: NewEntityDraft) => void;
  onCancel: () => void;
  /** Existing entity form node for edit mode / full-detail reveal. */
  fullFields?: React.ReactNode;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<EntityVisibility>("dm");
  const [kind, setKind] = useState("");
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        <label className="block">
          <span className="block mb-1">Name</span>
          <input aria-label="Name" className="w-full h-8 px-2 rounded border bg-background"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="block mb-1">One-line summary</span>
          <input className="w-full h-8 px-2 rounded border bg-background"
            value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="block">
          <span className="block mb-1">Visibility</span>
          <select className="w-full h-8 px-2 rounded border bg-background"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as EntityVisibility)}>
            <option value="player">player</option>
            <option value="dm">dm</option>
            <option value="hidden">hidden</option>
            <option value="rumor">rumor</option>
          </select>
        </label>
        <label className="block">
          <span className="block mb-1">Kind</span>
          <input className="w-full h-8 px-2 rounded border bg-background"
            placeholder="defaults from category"
            value={kind} onChange={(e) => setKind(e.target.value)} />
        </label>

        <button type="button" className="text-primary underline"
          onClick={() => setShowMore((s) => !s)}>
          {showMore ? "Hide details" : "More details"}
        </button>
        {showMore && (
          <div className="border-t pt-3">
            <div>{fullFields ?? <p className="text-muted-foreground">Relationships and profile fields appear here.</p>}</div>
          </div>
        )}
      </div>
      <div className="p-2 border-t flex gap-2">
        <button type="button" className="h-8 px-3 text-xs rounded border" onClick={onCancel}>
          Cancel
        </button>
        <button type="button"
          className="h-8 px-3 text-xs rounded bg-primary text-primary-foreground"
          disabled={!title.trim()}
          onClick={() =>
            onCreate({
              category, title: title.trim(),
              summary: summary.trim() || undefined,
              visibility, kind: kind.trim() || undefined,
            })
          }>
          {mode === "create" ? "Create" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
