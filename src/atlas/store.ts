import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AtlasData, defaultAtlas, Pin, MapLayer, Region, Relation, Route, FogReveal, FogState, TravelSpeeds, MapViewBookmark } from "./types";
import { clampPoint, normalizeLayerFrame } from "./coords";

export type ViewMode = "dm" | "player";
export type Tool = "select" | "addPin" | "measure" | "drawRegion" | "drawRoute" | "revealFog" | "addRelation";

interface AtlasState {
  atlas: AtlasData;
  view: ViewMode;
  tool: Tool;
  selectedId: string | null;
  worldId: string | null;

  setAtlas: (a: AtlasData) => void;
  setView: (v: ViewMode) => void;
  setTool: (t: Tool) => void;
  select: (id: string | null) => void;
  setWorldId: (id: string | null) => void;

  updateWorld: (patch: Partial<AtlasData["world"]>) => void;
  addPin: (p: Pin) => void;
  updatePin: (id: string, patch: Partial<Pin>) => void;
  deletePin: (id: string) => void;
  addLayer: (l: MapLayer) => void;
  updateLayer: (id: string, patch: Partial<MapLayer>) => void;
  deleteLayer: (id: string) => void;
  addRegion: (r: Region) => void;
  updateRegion: (id: string, patch: Partial<Region>) => void;
  deleteRegion: (id: string) => void;
  addRelation: (r: Relation) => void;
  updateRelation: (id: string, patch: Partial<Relation>) => void;
  deleteRelation: (id: string) => void;
  addRoute: (r: Route) => void;
  updateRoute: (id: string, patch: Partial<Route>) => void;
  deleteRoute: (id: string) => void;
  addFogReveal: (r: FogReveal) => void;
  clearFog: () => void;
  setFog: (patch: Partial<FogState>) => void;
  setTravelSpeeds: (patch: Partial<TravelSpeeds>) => void;
  addViewBookmark: (bookmark: MapViewBookmark) => void;
  updateViewBookmark: (id: string, patch: Partial<MapViewBookmark>) => void;
  deleteViewBookmark: (id: string) => void;
  moveParty: (x: number, y: number) => void;
  setPartyVisible: (v: boolean) => void;
  resetAtlas: () => void;
}

export const useAtlas = create<AtlasState>()(
  persist(
    (set) => ({
      atlas: defaultAtlas(),
      view: "dm",
      tool: "select",
      selectedId: null,
      worldId: null,

      setAtlas: (a) => set(() => {
        const atlas = { ...defaultAtlas(), ...a, routes: a.routes ?? [], viewBookmarks: a.viewBookmarks ?? [] };
        const world = atlas.world;
        return {
          atlas: {
            ...atlas,
            layers: atlas.layers.map((l) => ({ ...l, ...normalizeLayerFrame(world, l) })),
            pins: atlas.pins.map((p) => {
              const [x, y] = clampPoint(world, p.x, p.y);
              return { ...p, x, y };
            }),
          },
        };
      }),
      setView: (v) => set({ view: v }),
      setTool: (t) => set({ tool: t }),
      select: (id) => set({ selectedId: id }),
      setWorldId: (id) => set({ worldId: id }),

      updateWorld: (patch) => set((s) => {
        const world = { ...s.atlas.world, ...patch };
        return {
          atlas: {
            ...s.atlas,
            world,
            layers: s.atlas.layers.map((l) => ({ ...l, ...normalizeLayerFrame(world, l) })),
            pins: s.atlas.pins.map((p) => {
              const [x, y] = clampPoint(world, p.x, p.y);
              return { ...p, x, y };
            }),
          },
        };
      }),
      addPin: (p) => set((s) => {
        const [x, y] = clampPoint(s.atlas.world, p.x, p.y);
        return { atlas: { ...s.atlas, pins: [...s.atlas.pins, { ...p, x, y }] } };
      }),
      updatePin: (id, patch) => set((s) => ({ atlas: { ...s.atlas, pins: s.atlas.pins.map(p => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        if (patch.x !== undefined || patch.y !== undefined) {
          const [x, y] = clampPoint(s.atlas.world, merged.x, merged.y);
          merged.x = x; merged.y = y;
        }
        return merged;
      }) } })),
      deletePin: (id) => set((s) => ({ atlas: { ...s.atlas, pins: s.atlas.pins.filter(p => p.id !== id) } })),
      addLayer: (l) => set((s) => ({ atlas: { ...s.atlas, layers: [...s.atlas.layers, { ...l, ...normalizeLayerFrame(s.atlas.world, l) }] } })),
      updateLayer: (id, patch) => set((s) => ({ atlas: { ...s.atlas, layers: s.atlas.layers.map(l => {
        if (l.id !== id) return l;
        const merged = { ...l, ...patch };
        if (patch.x !== undefined || patch.y !== undefined || patch.width !== undefined || patch.height !== undefined) Object.assign(merged, normalizeLayerFrame(s.atlas.world, merged));
        return merged;
      }) } })),
      deleteLayer: (id) => set((s) => ({ atlas: { ...s.atlas, layers: s.atlas.layers.filter(l => l.id !== id) } })),
      addRegion: (r) => set((s) => ({ atlas: { ...s.atlas, regions: [...s.atlas.regions, r] } })),
      updateRegion: (id, patch) => set((s) => ({ atlas: { ...s.atlas, regions: s.atlas.regions.map(r => r.id === id ? { ...r, ...patch } : r) } })),
      deleteRegion: (id) => set((s) => ({ atlas: { ...s.atlas, regions: s.atlas.regions.filter(r => r.id !== id) } })),
      addRelation: (r) => set((s) => ({ atlas: { ...s.atlas, relations: [...s.atlas.relations, r] } })),
      updateRelation: (id, patch) => set((s) => ({ atlas: { ...s.atlas, relations: s.atlas.relations.map(r => r.id === id ? { ...r, ...patch } : r) } })),
      deleteRelation: (id) => set((s) => ({ atlas: { ...s.atlas, relations: s.atlas.relations.filter(r => r.id !== id) } })),
      addRoute: (r) => set((s) => ({ atlas: { ...s.atlas, routes: [...(s.atlas.routes ?? []), r] } })),
      updateRoute: (id, patch) => set((s) => ({ atlas: { ...s.atlas, routes: (s.atlas.routes ?? []).map(r => r.id === id ? { ...r, ...patch } : r) } })),
      deleteRoute: (id) => set((s) => ({ atlas: { ...s.atlas, routes: (s.atlas.routes ?? []).filter(r => r.id !== id) } })),
      addFogReveal: (r) => set((s) => ({ atlas: { ...s.atlas, fog: { ...s.atlas.fog, revealedRegions: [...s.atlas.fog.revealedRegions, r] } } })),
      clearFog: () => set((s) => ({ atlas: { ...s.atlas, fog: { ...s.atlas.fog, revealedRegions: [] } } })),
      setFog: (patch) => set((s) => ({ atlas: { ...s.atlas, fog: { ...s.atlas.fog, ...patch } } })),
      setTravelSpeeds: (patch) => set((s) => ({ atlas: { ...s.atlas, travelSpeeds: { ...s.atlas.travelSpeeds, ...patch } } })),
      addViewBookmark: (bookmark) => set((s) => ({ atlas: { ...s.atlas, viewBookmarks: [...(s.atlas.viewBookmarks ?? []), bookmark] } })),
      updateViewBookmark: (id, patch) => set((s) => ({ atlas: { ...s.atlas, viewBookmarks: (s.atlas.viewBookmarks ?? []).map(b => b.id === id ? { ...b, ...patch } : b) } })),
      deleteViewBookmark: (id) => set((s) => ({ atlas: { ...s.atlas, viewBookmarks: (s.atlas.viewBookmarks ?? []).filter(b => b.id !== id) } })),
      moveParty: (x, y) => set((s) => {
        const [cx, cy] = clampPoint(s.atlas.world, x, y);
        return { atlas: { ...s.atlas, party: { ...s.atlas.party, x: cx, y: cy } } };
      }),
      setPartyVisible: (v) => set((s) => ({ atlas: { ...s.atlas, party: { ...s.atlas.party, visible: v } } })),
      resetAtlas: () => set({ atlas: defaultAtlas(), selectedId: null }),
    }),
    { name: "lca-atlas-v1" }
  )
);

// Visibility filter for player view
export function isVisibleInPlayer(v: string): boolean {
  return v === "public" || v === "discovered" || v === "rumored" || v === "false_info";
}
