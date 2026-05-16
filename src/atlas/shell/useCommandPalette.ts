// src/atlas/shell/useCommandPalette.ts
import type { Entity } from "@/atlas/content/schema";

export type PaletteKind = "entity" | "map" | "command" | "setting";

export interface PaletteResult {
  id: string;
  kind: PaletteKind;
  title: string;
  run?: () => void;
}

export interface PaletteIndex {
  all: PaletteResult[];
  recent: string[];
}

export function buildPaletteIndex(src: {
  entities: Entity[];
  maps: { id: string; name: string }[];
  commands: { id: string; title: string; run: () => void }[];
  settings: { id: string; title: string }[];
  recent: string[];
}): PaletteIndex {
  const all: PaletteResult[] = [
    ...src.entities.map((e) => ({ id: e.id, kind: "entity" as const, title: e.title })),
    ...src.maps.map((m) => ({ id: m.id, kind: "map" as const, title: m.name })),
    ...src.commands.map((c) => ({ id: c.id, kind: "command" as const, title: c.title, run: c.run })),
    ...src.settings.map((s) => ({ id: s.id, kind: "setting" as const, title: s.title })),
  ];
  return { all, recent: src.recent };
}

export function queryPalette(index: PaletteIndex, raw: string): PaletteResult[] {
  const commandOnly = raw.startsWith(">");
  const q = (commandOnly ? raw.slice(1) : raw).trim().toLowerCase();
  let pool = index.all;
  if (commandOnly) pool = pool.filter((r) => r.kind === "command");
  if (!q) {
    if (commandOnly) return pool;
    const recentSet = new Map(index.recent.map((id, i) => [id, i]));
    return [...pool].sort((a, b) => {
      const ra = recentSet.has(a.id) ? recentSet.get(a.id)! : Infinity;
      const rb = recentSet.has(b.id) ? recentSet.get(b.id)! : Infinity;
      return ra - rb;
    });
  }
  return pool
    .filter((r) => r.title.toLowerCase().includes(q))
    .sort((a, b) =>
      a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q));
}
