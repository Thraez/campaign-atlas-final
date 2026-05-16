// src/atlas/shell/EditorMenu.tsx
// GUARDRAIL: this menu is intentionally minimal. NEVER add export, clone,
// backup, offline, composite, download, zip, or patch actions here — those
// were removed program-wide and are forbidden (see CLAUDE.md hard rules).
// The guardrail test enforces this allow-list.

export interface EditorMenuItem { id: string; label: string; }

export const EDITOR_MENU_ITEMS: EditorMenuItem[] = [
  { id: "world-details", label: "Edit world details" },
  { id: "map-details",   label: "Edit map details" },
  { id: "help",          label: "Help" },
];

export function EditorMenu({
  open, onWorldDetails, onMapDetails, onHelp,
}: {
  open?: boolean;
  onWorldDetails: () => void;
  onMapDetails: () => void;
  onHelp: () => void;
}) {
  if (!open) return null;
  const handlers: Record<string, () => void> = {
    "world-details": onWorldDetails,
    "map-details": onMapDetails,
    "help": onHelp,
  };
  return (
    <ul className="rounded-md border bg-background shadow-md text-sm w-48">
      {EDITOR_MENU_ITEMS.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-muted"
            onClick={handlers[it.id]}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
