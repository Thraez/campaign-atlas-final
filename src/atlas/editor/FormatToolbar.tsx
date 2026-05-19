import { useState } from "react";
import type { ToolbarActionId } from "./toolbarActions";

interface FormatToolbarProps {
  onAction: (id: ToolbarActionId, calloutType?: string) => void;
}

/**
 * Progressive-disclosure formatting toolbar above the body textarea.
 * Purely presentational: every click delegates to `onAction`, which the
 * parent (EntityEditPanel) maps through `applyToolbarAction` against the
 * live textarea selection. No WYSIWYG, no entry templates (skipped by
 * product decision — markdown text stays the single source of truth).
 */

const ALWAYS: Array<{ id: ToolbarActionId; label: string }> = [
  { id: "bold", label: "Bold" },
  { id: "italic", label: "Italic" },
  { id: "highlight", label: "Highlight" },
  { id: "heading", label: "Heading" },
  { id: "list", label: "List" },
  { id: "quote", label: "Quote" },
  { id: "wikilink", label: "Wikilink" },
  { id: "callout", label: "Callout" },
];

const MORE: Array<{ id: ToolbarActionId; label: string }> = [
  { id: "footnote", label: "Footnote" },
  { id: "task", label: "Task list" },
  { id: "table", label: "Table" },
  { id: "codeblock", label: "Code block" },
];

// Obsidian-core callout types the DM reaches for most.
const CALLOUT_TYPES = [
  "note", "info", "tip", "success", "question",
  "warning", "danger", "example", "quote",
];

const BTN =
  "h-7 px-2 rounded border bg-background hover:bg-muted text-xs whitespace-nowrap";

export function FormatToolbar({ onAction }: FormatToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const fire = (id: ToolbarActionId, calloutType?: string) => {
    if (calloutType === undefined) onAction(id);
    else onAction(id, calloutType);
    setMoreOpen(false);
  };

  return (
    <div className="relative mb-1">
      <div className="flex flex-wrap gap-1 items-center" role="toolbar" aria-label="Formatting">
        {ALWAYS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={BTN}
            onClick={() => fire(a.id)}
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          className={BTN}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        >
          More ▾
        </button>
      </div>

      {moreOpen && (
        <div
          className="absolute z-50 left-0 mt-1 rounded border bg-background shadow-lg text-xs p-1 flex flex-col gap-0.5 min-w-40"
          role="menu"
          aria-label="More formatting"
        >
          {MORE.map((a) => (
            <button
              key={a.id}
              type="button"
              className="text-left px-2 py-1 rounded hover:bg-muted"
              onClick={() => fire(a.id)}
            >
              {a.label}
            </button>
          ))}
          <div className="border-t my-0.5" />
          <span className="px-2 py-0.5 text-muted-foreground">Callout type</span>
          {CALLOUT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="text-left px-2 py-1 rounded hover:bg-muted capitalize"
              onClick={() => fire("callout", t)}
            >
              {`Callout: ${t}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
