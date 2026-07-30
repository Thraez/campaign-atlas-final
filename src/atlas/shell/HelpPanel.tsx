// src/atlas/shell/HelpPanel.tsx
import { Keyboard } from "lucide-react";

interface ShortcutRow {
  keys: string;
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: "⌘/Ctrl K", description: "Open the command palette" },
  { keys: "⌘/Ctrl S", description: "Save" },
  { keys: "⌘/Ctrl Z", description: "Undo" },
  { keys: "⌘/Ctrl Shift Z (or Ctrl Y)", description: "Redo" },
  { keys: "Esc", description: "Cancel an in-progress pin placement" },
  { keys: "⌘/Ctrl B", description: "Bold selected text (in an entity body)" },
  { keys: "⌘/Ctrl I", description: "Italicize selected text (in an entity body)" },
  { keys: "⌘/Ctrl K (in an entity body)", description: "Insert a wikilink" },
];

const TIPS: string[] = [
  "Use the rail on the left to switch between map, entity, and world panels.",
  "The command palette (⌘/Ctrl K) can jump straight to any entity, map, or panel.",
  "Unsaved changes are tracked automatically — Save (⌘/Ctrl S) writes them to your vault.",
];

export function HelpPanel() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 border-b border-border space-y-1">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts
        </div>
        <div className="text-[10px] text-muted-foreground">
          Everything you need to move quickly around the editor.
        </div>
      </div>

      <div className="p-3 space-y-2">
        {SHORTCUTS.map((row) => (
          <div key={row.keys} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{row.description}</span>
            <code className="text-[10px] font-mono bg-muted px-2 py-1 rounded whitespace-nowrap">
              {row.keys}
            </code>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border space-y-1.5">
        <div className="text-xs font-medium">Quick tips</div>
        <ul className="text-[10px] text-muted-foreground list-disc pl-4 space-y-1">
          {TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
