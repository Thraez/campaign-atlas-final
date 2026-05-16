// src/atlas/shell/EditorPanelHost.tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const KEY = "atlas.panelWidth";
const DEFAULT_FRAC = 1 / 3;
const MAX_FRAC = 0.5;

function clampWidth(px: number): number {
  const max = Math.floor(window.innerWidth * MAX_FRAC);
  const min = 280;
  return Math.max(min, Math.min(px, max));
}

export function EditorPanelHost({
  activeId, title, onDismiss, children,
}: {
  activeId: string | null;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(KEY));
    return clampWidth(
      Number.isFinite(saved) && saved > 0
        ? saved
        : Math.floor(window.innerWidth * DEFAULT_FRAC),
    );
  });
  const dragging = useRef(false);

  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, onDismiss]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = clampWidth(e.clientX);
      setWidth(w);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      localStorage.setItem(KEY, String(width));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [width]);

  if (!activeId) return null;

  return (
    <>
      {/* Backdrop is only over the still-visible map area; mousedown closes and is absorbed (no map event). */}
      <div
        data-testid="panel-backdrop"
        className="absolute inset-0 z-10"
        style={{ left: width }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }}
      />
      <aside
        data-panel
        data-testid="panel"
        className="absolute left-0 top-0 bottom-0 z-20 flex flex-col border-r bg-background shadow-xl"
        style={{ width }}
      >
        <header className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium truncate">{title}</span>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          onMouseDown={() => { dragging.current = true; }}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
        />
      </aside>
    </>
  );
}
