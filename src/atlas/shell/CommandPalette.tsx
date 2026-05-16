// src/atlas/shell/CommandPalette.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type PaletteIndex, type PaletteResult, queryPalette,
} from "./useCommandPalette";

export function CommandPalette({
  index, onChoose,
}: {
  index: PaletteIndex;
  onChoose: (r: PaletteResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true); setQ(""); setSel(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => queryPalette(index, q), [index, q]);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[12vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[560px] max-w-[90vw] rounded-lg border bg-background shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="w-full h-11 px-4 text-sm bg-transparent outline-none border-b"
          placeholder="Search everything — entities, commands, maps, settings"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, results.length - 1));
            if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && results[sel]) {
              onChoose(results[sel]); setOpen(false);
            }
          }}
        />
        <ul className="max-h-[50vh] overflow-auto">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`}>
              <button
                type="button"
                className={`w-full text-left px-4 py-2 text-sm flex justify-between ${i === sel ? "bg-muted" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => { onChoose(r); setOpen(false); }}
              >
                <span>{r.title}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
