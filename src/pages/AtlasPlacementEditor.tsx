import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, Crosshair, RotateCcw, MapPin, Target, Trash2, Layers as LayersIcon, Settings2, Upload, Save as SaveIcon, Undo2, Redo2, Plus, X, Menu as MenuIcon } from "lucide-react";
import { toast } from "sonner";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity, ImportFolderConfig, MapDocument, MapLayer } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMapLayers } from "@/atlas/useMapLayers";
import { MapLayerPanel } from "@/atlas/MapLayerPanel";
import { MapLayerEditableOverlay } from "@/atlas/MapLayerEditableOverlay";
import { MapSettingsPanel } from "@/atlas/MapSettingsPanel";
import { AtlasMinimap } from "@/atlas/AtlasMinimap";
import { OceanBackground } from "@/atlas/ocean/OceanBackground";
import { overridesSchema } from "@/atlas/schemas/imports";
import type { PlacementOverride } from "@/atlas/yaml/buildPatches";
import { DiffPreviewModal } from "@/atlas/save/DiffPreviewModal";
import type { FileChange } from "@/atlas/save/localFsSave";
import { SaveStatus } from "@/atlas/session/SaveStatus";
import { DiscardConfirmModal } from "@/atlas/session/DiscardConfirmModal";
import { CanonicalSaveError } from "@/atlas/save/canonicalPlacementSave";
import {
  type FrontmatterDraft,
  entityFrontmatterPatches,
  buildCanonicalEntityChanges,
} from "@/atlas/save/canonicalEntitySave";
import { useWorldYamlBaseline, worldYamlPath } from "@/atlas/save/useWorldYamlBaseline";
import { buildFullWorldYaml } from "@/atlas/yaml/buildFullWorldYaml";
import { ImportPanel } from "@/atlas/import/ImportPanel";
import { ImportStagingModal } from "@/atlas/import/ImportStagingModal";
import { PasteMarkdownDialog } from "@/atlas/import/PasteMarkdownDialog";
import { useMdImportFlow } from "@/atlas/import/useMdImportFlow";
import { useMdDropZone } from "@/atlas/import/useMdDropZone";
import { TabFrame } from "@/atlas/tabs/TabFrame";
import { RegionsTab } from "@/atlas/tabs/RegionsTab";
import { RoutesTab } from "@/atlas/tabs/RoutesTab";
import { FogTab } from "@/atlas/tabs/FogTab";
import { PublishCheckTab } from "@/atlas/tabs/PublishCheckTab";
import { type CategoryId, CATEGORIES, categoryForType } from "@/atlas/content/entityCategory";
import { CommandPalette } from "@/atlas/shell/CommandPalette";
import { buildPaletteIndex } from "@/atlas/shell/useCommandPalette";
import { EditorMenu } from "@/atlas/shell/EditorMenu";
import { WorldDetailsPanel } from "@/atlas/settings/WorldDetailsPanel";
import { CategoryPanel } from "@/atlas/categories/CategoryPanel";
import { PinStateBadge } from "@/atlas/pins/PinStateBadge";
import { EntityEditorPanel, type NewEntityDraft } from "@/atlas/categories/EntityEditorPanel";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
import { EntitySurface } from "@/atlas/entity/EntitySurface";
import { resolvePinClickIntent } from "@/atlas/editor/pinClickIntent";
import { resolveEntityCloseIntent } from "@/atlas/editor/entityCloseIntent";
import { mapClickToAtlasCoord } from "@/atlas/editor/mapClickCoord";
import { buildNewEntityChange } from "@/atlas/save/newEntitySave";
import { validateProject } from "@/atlas/yaml/validateProject";
import { MapImportWizard } from "@/atlas/import/MapImportWizard";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { RegionLayer } from "@/atlas/regions/RegionLayer";
import { useRouteDraft } from "@/atlas/routes/useRouteDraft";
import { RouteLayer } from "@/atlas/routes/RouteLayer";
import { useFogDraft } from "@/atlas/fog/useFogDraft";
import { FogLayer } from "@/atlas/fog/FogLayer";
import { projectMapForPlayer } from "@/atlas/content/projectMapForPlayer";
import {
  PIN_PRESETS,
  defaultPresetForType,
  diffPinOverride,
  pinSvg,
  resolvePinStyle,
  type PinOverride,
  type PinPresetId,
} from "@/atlas/pins/presets";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useUndoStack } from "@/atlas/useUndoStack";
import { useEditorSession } from "@/atlas/session/useEditorSession";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EditorRail } from "@/atlas/shell/EditorRail";
import { EditorPanelHost } from "@/atlas/shell/EditorPanelHost";
import { buildRailItems } from "@/atlas/shell/railRegistry";
import { ViewModeProvider, useViewMode } from "@/atlas/view/ViewModeProvider";
import { filterEntitiesForLens } from "@/atlas/view/filterEntitiesForLens";

const FlatCRS = L.extend({}, L.CRS.Simple) as L.CRS;
// Bumped to v3: storage shape now carries label + pin override per placement.
// v1/v2 entries (just x/y) are still readable — extra fields are simply absent.
const STORAGE_KEY = "atlas-placement-overrides-v3";
const LEGACY_STORAGE_KEY_V1 = "atlas-placement-overrides-v1";
const LEGACY_STORAGE_KEY_V2 = "atlas-placement-overrides-v2";

/** Local-draft override shape. `null` = explicitly removed from this map. */
type OverrideValue = { x: number; y: number; label?: string; pin?: PinOverride };
type Override = OverrideValue | null;

interface Overrides {
  [mapEntityKey: string]: Override; // key = `${mapId}:${entityId}`
}

const overrideKey = (mapId: string, entityId: string) => `${mapId}:${entityId}`;

/**
 * Boundary-validate an overrides JSON string from localStorage. Malformed
 * entries (corrupt browser storage, hand-edited DevTools) are dropped per
 * key rather than crashing the editor. Returns an empty object on total
 * failure.
 */
function safeParseOverrides(raw: string): Overrides {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return {}; }
  const parsed = overridesSchema.safeParse(json);
  if (!parsed.success) return {};
  const out: Overrides = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    out[k] = v as Override;
  }
  return out;
}

function pinDivIcon(color: string, shape: import("@/atlas/pins/presets").PinShape, opts?: { pulse?: boolean }): L.DivIcon {
  return L.divIcon({
    className: "atlas-edit-pin",
    html: pinSvg({ color, shape }, { pulse: opts?.pulse }),
    iconSize: [22, 22],
    iconAnchor: [11, 20],
  });
}

function MapClickCapture({ onClick }: { onClick: (x: number, y: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lng, e.latlng.lat); // we'll convert in caller
    },
  });
  return null;
}

function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), -1), { duration: 0.5 });
  }, [target, map]);
  return null;
}

function ViewModeToggle() {
  const { mode, setMode } = useViewMode();
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded border overflow-hidden text-xs" role="group" aria-label="View mode">
        <button type="button"
          className={mode === "dm" ? "px-2 py-1 bg-primary text-primary-foreground" : "px-2 py-1"}
          aria-pressed={mode === "dm"} onClick={() => setMode("dm")}>DM view</button>
        <button type="button"
          className={mode === "player" ? "px-2 py-1 bg-primary text-primary-foreground" : "px-2 py-1"}
          aria-pressed={mode === "player"} onClick={() => setMode("player")}>Player view</button>
      </div>
      {mode === "player" && (
        <span
          data-testid="player-mode-indicator"
          className="text-[11px] text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded px-2 py-0.5 hidden sm:inline"
        >
          Previewing as players see it
        </span>
      )}
    </div>
  );
}

function AtlasPlacementEditorInner() {
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>(() => {
    try {
      const v3 = localStorage.getItem(STORAGE_KEY);
      if (v3) return safeParseOverrides(v3);
      // Forward-migration: v2 entries are already keyed by `${mapId}:${entityId}`
      // and only carry x/y — directly compatible with the v3 shape.
      const v2raw = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
      if (v2raw) return safeParseOverrides(v2raw);
      // v1 was entityId-keyed; defer mapId resolution until project loads.
      const v1raw = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
      if (!v1raw) return {};
      const v1 = safeParseOverrides(v1raw);
      const migrated: Overrides = {};
      Object.entries(v1).forEach(([eid, val]) => { migrated[`__legacy__:${eid}`] = val; });
      return migrated;
    } catch { return {}; }
  });
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null); // entity awaiting click-to-place
  const [filter, setFilter] = useState("");
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);
  const [showLayers, setShowLayers] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  // Phase 1B B1/B2: toggle exposed by the Maps → Layers panel header. When
  // true, the selected layer is draggable and corner handles appear.
  const [editGeometry, setEditGeometry] = useState(false);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  useEffect(() => {
    loadAtlasContent(true).then((p) => {
      setProject(p);
      const defaultMap = p.worlds[0]?.defaultMapId ?? p.maps[0]?.id ?? null;
      setActiveMapId(defaultMap);
      // Finish v1 → v2 migration now that we know the default mapId.
      setOverrides((o) => {
        const out: Overrides = {};
        let migrated = false;
        for (const [k, v] of Object.entries(o)) {
          if (k.startsWith("__legacy__:") && defaultMap) {
            out[overrideKey(defaultMap, k.slice("__legacy__:".length))] = v;
            migrated = true;
          } else {
            out[k] = v;
          }
        }
        if (migrated) localStorage.removeItem(LEGACY_STORAGE_KEY_V1);
        return migrated ? out : o;
      });
    }).catch((e: Error) => setError(e.message));
  }, []);

  // Save-conflict detector: poll atlas.json every 30s while the editor is
  // mounted. If `publishedAt` has changed since load, a rebuild happened
  // externally (Obsidian + `npm run atlas:build`, another save plugin
  // invocation, etc.). Surface a toast so the DM can `Reload canon` before
  // their next save overwrites someone else's edits.
  const [externalRebuildAt, setExternalRebuildAt] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    const loadedAt = project.publishedAt;
    let timer: number | undefined;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const fresh = await loadAtlasContent(true);
        if (cancelled) return;
        if (fresh.publishedAt && fresh.publishedAt !== loadedAt && fresh.publishedAt !== externalRebuildAt) {
          setExternalRebuildAt(fresh.publishedAt);
          toast.warning("Canon rebuilt externally", {
            description: "Atlas was regenerated since you opened the editor. Reload to see the new canon before saving.",
            duration: 8000,
          });
        }
      } catch { /* network blip; retry next tick */ }
      timer = window.setTimeout(tick, 30_000);
    };
    timer = window.setTimeout(tick, 30_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // Re-arm only on initial project load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.publishedAt]);

  const reloadCanon = useCallback(async () => {
    try {
      const fresh = await loadAtlasContent(true);
      setProject(fresh);
      setExternalRebuildAt(null);
      toast.success("Canon reloaded from disk");
    } catch (e) {
      toast.error(`Reload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Phase 1C: md-import orchestration. existingById maps entity id → sourcePath
  // so the staging layer can detect same-id imports and route them to the
  // existing file in-place (update), rather than creating a parallel copy.
  const importExistingById = useMemo(() => {
    const m = new Map<string, string>();
    if (!project) return m;
    for (const e of project.entities) {
      if (e.id && e.sourcePath) m.set(e.id, e.sourcePath);
    }
    return m;
  }, [project]);

  const importWorldId = project?.maps.find((m) => m.id === activeMapId)?.worldId ?? "";
  const importConfig = useMemo((): ImportFolderConfig => {
    const world = project?.worlds.find((w) => w.id === importWorldId);
    return world?.importFolders ?? { folders: {}, defaultFolder: "imports" };
  }, [project, importWorldId]);

  const importFlow = useMdImportFlow({
    worldId: importWorldId,
    importConfig,
    existingById: importExistingById,
    onImported: reloadCanon,
  });
  const [pasteOpen, setPasteOpen] = useState(false);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const triggerMdImport = useCallback(() => { mdFileInputRef.current?.click(); }, []);
  const { isDragging: isDraggingMd } = useMdDropZone({
    onDrop: importFlow.openWithFiles,
    enabled: !importFlow.open && !pasteOpen,
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }, [overrides]);

  // Stamp a local edit timestamp on every override mutation AFTER mount.
  // The first render (hydration from localStorage) doesn't count as an edit.
  const overridesMountedRef = useRef(false);
  useEffect(() => {
    if (!overridesMountedRef.current) {
      overridesMountedRef.current = true;
      return;
    }
    setLastLocalEditAt(Date.now());
  }, [overrides]);

  // Optional in-session, per-map settings override (size + ocean + wrapX + grid).
  const [mapOverride, setMapOverride] = useState<Record<string, Partial<MapDocument>>>({});

  const baseMap: MapDocument | undefined = useMemo(
    () => project?.maps.find((m) => m.id === activeMapId),
    [project, activeMapId]
  );
  const activeMap: MapDocument | undefined = useMemo(() => {
    if (!baseMap) return undefined;
    const o = mapOverride[baseMap.id];
    return o ? { ...baseMap, ...o } : baseMap;
  }, [baseMap, mapOverride]);

  // Lens-aware display list — used only for CategoryPanel rendering.
  // Save/import/edit operations always use project.entities directly.
  const { mode } = useViewMode();
  const displayEntities = filterEntitiesForLens(project?.entities ?? [], mode);

  const patchMap = (patch: Partial<MapDocument>) => {
    if (!baseMap) return;
    setMapOverrideUndoable(
      (s) => ({ ...s, [baseMap.id]: { ...(s[baseMap.id] ?? {}), ...patch } }),
      `map metadata ${baseMap.id}`,
    );
  };
  const resetMap = () => {
    if (!baseMap) return;
    setMapOverrideUndoable(
      (s) => { const n = { ...s }; delete n[baseMap.id]; return n; },
      `reset map metadata ${baseMap.id}`,
    );
  };

  // Phase 1B — session undo stack. In-memory only; cleared on tab close.
  // Passed into useMapLayers + each draft hook so every per-tab mutation
  // records its inverse. Pin overrides + mapOverride mutations go through
  // setOverridesUndoable / setMapOverrideUndoable below.
  const undoStack = useUndoStack();

  const layerEditor = useMapLayers(activeMap, undoStack);

  // A13: baseline world.yaml content + hash for the active world. Pinned at
  // editor-load (and refreshed after each successful Save) so the unified
  // Save endpoint can detect on-disk divergence with baseHash and so
  // buildFullWorldYaml can preserve the leading comment block.
  const activeWorldId = activeMap?.worldId ?? null;
  const worldYamlBaseline = useWorldYamlBaseline(activeWorldId);

  // Region draft state — shared between RegionsTab (form) and the map (RegionLayer).
  const entityIdSet = useMemo(() => new Set((project?.entities ?? []).map((e) => e.id)), [project]);
  const dmEntityIdSet = useMemo(
    () => new Set((project?.entities ?? []).filter((e) => e.visibility === "dm" || e.visibility === "hidden").map((e) => e.id)),
    [project]
  );
  const regionDraft = useRegionDraft(activeMap, { entityIds: entityIdSet, dmEntityIds: dmEntityIdSet }, undoStack);
  const routeDraft = useRouteDraft(project, activeMap, { entityIds: entityIdSet, dmEntityIds: dmEntityIdSet }, undoStack);
  const fogDraft = useFogDraft(activeMap, undoStack);
  const entityEditDraft = useEntityEditDraft();
  const entitiesById = useMemo(
    () => new Map((project?.entities ?? []).map((e) => [e.id, e])),
    [project],
  );
  const [showFogPreview, setShowFogPreview] = useState(true);

  // Synchronous mirrors of overrides + mapOverride. Mutation helpers below
  // read these to compute (before, after) snapshots without waiting for
  // React batching to settle.
  const overridesRef = useRef(overrides);
  useEffect(() => { overridesRef.current = overrides; }, [overrides]);
  const mapOverrideRef = useRef(mapOverride);
  useEffect(() => { mapOverrideRef.current = mapOverride; }, [mapOverride]);

  /** Undo-recording setter for pin overrides. Skip-recording mode is just
   *  raw setOverrides; use that for post-save cleanup. */
  const setOverridesUndoable = useCallback(
    (compute: (prev: Overrides) => Overrides, label: string) => {
      const before = overridesRef.current;
      const after = compute(before);
      if (after === before) return;
      overridesRef.current = after;
      setOverrides(after);
      undoStack.push({
        undo: () => {
          overridesRef.current = before;
          setOverrides(before);
        },
        redo: () => {
          overridesRef.current = after;
          setOverrides(after);
        },
        label,
      });
    },
    [undoStack],
  );

  /** Undo-recording setter for map metadata. */
  const setMapOverrideUndoable = useCallback(
    (compute: (prev: Record<string, Partial<MapDocument>>) => Record<string, Partial<MapDocument>>, label: string) => {
      const before = mapOverrideRef.current;
      const after = compute(before);
      if (after === before) return;
      mapOverrideRef.current = after;
      setMapOverride(after);
      undoStack.push({
        undo: () => {
          mapOverrideRef.current = before;
          setMapOverride(before);
        },
        redo: () => {
          mapOverrideRef.current = after;
          setMapOverride(after);
        },
        label,
      });
    },
    [undoStack],
  );

  // Shell state: which rail panel is open (null = closed).
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const selectPanel = (id: string) =>
    setActivePanel((cur) => (cur === id ? null : id));
  const dismissPanel = () => setActivePanel(null);

  // ☰ menu open/close state
  const [menuOpen, setMenuOpen] = useState(false);

  /** Per-tab filter state (placed/unplaced/visibility/type/tag). */
  const [stateFilter, setStateFilter] = useState<"all" | "placed" | "unplaced">("all");
  const [visFilter, setVisFilter] = useState<"all" | "player" | "rumor" | "dm" | "hidden">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  /** When true, finishing a placement automatically queues the next unplaced entity. */
  const [chainPlaceMode, setChainPlaceMode] = useState(false);
  /** Which category panel is in "create new entity" mode (null = browsing). */
  const [creatingIn, setCreatingIn] = useState<CategoryId | null>(null);
  /** Entity currently open in the EntityEditPanel (null = none). */
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);

  /** Read-only canon placement (built YAML value) for an entity on a map. */
  const canonPlacement = useCallback((mapId: string, entityId: string) => {
    if (!project) return null;
    return project.placements.find((p) => p.entityId === entityId && p.mapId === mapId) ?? null;
  }, [project]);

  /** Resolve effective placement values on the active map: local override wins, else canon. */
  const effectivePlacement = useCallback((entityId: string): OverrideValue | null => {
    if (!activeMap) return null;
    const k = overrideKey(activeMap.id, entityId);
    if (k in overrides) {
      const v = overrides[k];
      return v;
    }
    const p = canonPlacement(activeMap.id, entityId);
    if (!p) return null;
    return { x: p.x, y: p.y, label: p.label, pin: p.pin as PinOverride | undefined };
  }, [overrides, canonPlacement, activeMap]);

  const effectiveCoord = useCallback((entityId: string): { x: number; y: number } | null => {
    const e = effectivePlacement(entityId);
    return e ? { x: e.x, y: e.y } : null;
  }, [effectivePlacement]);

  const entitiesForWorld = useMemo(() => {
    if (!project || !activeMap) return [] as Entity[];
    const worldId = project.maps.find((m) => m.id === activeMap.id)?.worldId;
    return project.entities.filter((e) => !e.world || e.world === worldId);
  }, [project, activeMap]);

  const allTypes = useMemo(
    () => Array.from(new Set(entitiesForWorld.map((e) => e.type))).sort(),
    [entitiesForWorld]
  );
  const allTags = useMemo(
    () => Array.from(new Set(entitiesForWorld.flatMap((e) => e.tags ?? []))).sort(),
    [entitiesForWorld]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return entitiesForWorld.filter((e) => {
      if (q && !(e.title.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))) return false;
      if (visFilter !== "all" && e.visibility !== visFilter) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (tagFilter !== "all" && !(e.tags ?? []).includes(tagFilter)) return false;
      const hasCoord = !!effectiveCoord(e.id);
      if (stateFilter === "placed" && !hasCoord) return false;
      if (stateFilter === "unplaced" && hasCoord) return false;
      return true;
    });
  }, [entitiesForWorld, filter, visFilter, typeFilter, tagFilter, stateFilter, effectiveCoord]);

  const placed = filtered.filter((e) => effectiveCoord(e.id));
  const unplaced = filtered.filter((e) => !effectiveCoord(e.id));

  /**
   * Ray-casting point-in-polygon: returns true if (px, py) is inside poly.
   * Uses the standard even-odd rule. Coordinates are map-space (x right, y up).
   */
  function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /** In player lens: filter placed entities through projectMapForPlayer. */
  const placedForLens = useMemo(() => {
    if (mode !== "player" || !activeMap) return placed;
    const fog = fogDraft.fog;
    const isFogged = (x: number, y: number): boolean => {
      if (!fog.enabled) return false;
      // A point is fogged if it is NOT inside any reveal polygon.
      return !fog.reveals.some((poly) => pointInPolygon(x, y, poly as [number, number][]));
    };
    const coords = placed.map((e) => {
      const c = effectivePlacement(e.id)!;
      return { entityId: e.id, x: c.x, y: c.y };
    });
    const { placements } = projectMapForPlayer({
      placements: coords,
      regions: [],
      routes: [],
      entitiesById,
      isFogged,
    });
    const keep = new Set(placements.map((p) => p.entityId));
    return placed.filter((e) => keep.has(e.id));
  }, [mode, placed, entitiesById, activeMap, fogDraft.fog, effectivePlacement]);

  /** Merge a partial override into the local draft. Undoable.
   *
   *  A "current" baseline is normally either a prior override or the canon
   *  placement. For a brand-new pin (no canon, no prior override), the caller
   *  must supply both x AND y in the patch — that's the create-from-scratch
   *  contract. Label-only / nudge / pin-style updates still require a
   *  baseline (and silently no-op without one, since they have nothing to
   *  attach to). The earlier behaviour dropped create-from-scratch on the
   *  floor while still firing the "Placed X" toast — see plan §2. */
  const mutateOverride = useCallback((entityId: string, patch: Partial<OverrideValue>, label?: string) => {
    if (!activeMap) return;
    setOverridesUndoable((o) => {
      const k = overrideKey(activeMap.id, entityId);
      const current = (k in o ? o[k] : null) ?? canonPlacement(activeMap.id, entityId);
      if (!current) {
        if (typeof patch.x !== "number" || typeof patch.y !== "number") return o;
        const fresh: OverrideValue = {
          x: patch.x,
          y: patch.y,
          label: patch.label,
          pin: patch.pin,
        };
        return { ...o, [k]: fresh };
      }
      const merged: OverrideValue = {
        x: patch.x ?? current.x,
        y: patch.y ?? current.y,
        label: patch.label !== undefined ? patch.label : (current as OverrideValue).label,
        pin: patch.pin !== undefined ? patch.pin : (current as OverrideValue).pin,
      };
      return { ...o, [k]: merged };
    }, label ?? `pin ${entityId}`);
  }, [activeMap, canonPlacement, setOverridesUndoable]);

  const setCoord = (entityId: string, coord: { x: number; y: number }) => mutateOverride(entityId, coord, `move pin ${entityId}`);
  const setLabel = (entityId: string, label: string | undefined) => mutateOverride(entityId, { label }, `label pin ${entityId}`);
  const setPinOverride = (entityId: string, pin: PinOverride | undefined) => mutateOverride(entityId, { pin }, `style pin ${entityId}`);
  const nudge = (entityId: string, dx: number, dy: number) => {
    const c = effectiveCoord(entityId);
    if (!c) return;
    mutateOverride(entityId, { x: c.x + dx, y: c.y + dy }, `nudge pin ${entityId}`);
  };
  const removeCoord = (entityId: string) => {
    if (!activeMap) return;
    setOverridesUndoable(
      (o) => ({ ...o, [overrideKey(activeMap.id, entityId)]: null }),
      `remove pin ${entityId}`,
    );
  };
  const clearOverride = (entityId: string) => {
    if (!activeMap) return;
    const k = overrideKey(activeMap.id, entityId);
    setOverridesUndoable(
      (o) => { const next = { ...o }; delete next[k]; return next; },
      `discard local pin edit ${entityId}`,
    );
  };
  /** Duplicate a placement to another map: writes the same coords as a draft. Undoable. */
  const duplicateToMap = (entityId: string, targetMapId: string) => {
    const src = effectivePlacement(entityId);
    if (!src) return;
    setOverridesUndoable(
      (o) => ({ ...o, [overrideKey(targetMapId, entityId)]: { x: src.x, y: src.y, label: src.label, pin: src.pin } }),
      `duplicate pin ${entityId} → ${targetMapId}`,
    );
    toast.success(`Duplicated to ${project?.maps.find((m) => m.id === targetMapId)?.name ?? targetMapId}`);
  };

  const onMapClick = (lng: number, lat: number) => {
    if (!pendingId || !activeMap) return;
    const { x, y } = mapClickToAtlasCoord(lng, lat, activeMap.height);
    setCoord(pendingId, { x, y });
    toast.success(`Placed "${project?.entities.find((e) => e.id === pendingId)?.title}" at ${x},${y} on ${activeMap.name}`);
    if (chainPlaceMode) {
      const next = unplaced.find((e) => e.id !== pendingId);
      setPendingId(next?.id ?? null);
      if (!next) toast.info("All entities placed.");
    } else {
      setPendingId(null);
    }
  };

  // Pin placement click-through for interactive map-image layers. The base
  // image overlay is `interactive` (so it can be selected/edited), which
  // means it swallows map clicks — without this, clicking the map to drop a
  // pin never reaches `onMapClick`. Returns true when it placed (so the
  // overlay stops propagation and the pin isn't placed twice).
  const handleLayerBackgroundClick = (latlng: L.LatLng): boolean => {
    if (!pendingId) return false;
    onMapClick(latlng.lng, latlng.lat);
    return true;
  };

  const goTo = (entityId: string) => {
    const c = effectiveCoord(entityId);
    if (!c || !activeMap) return;
    setFlyTo({ lat: activeMap.height - c.y, lng: c.x });
  };

  /** Build current draft placements for the active map, including label + pin diffs. */
  const buildDraftPlacements = useCallback(() => {
    if (!project || !activeMap) return [];
    const out: PlacementOverride[] = [];
    for (const e of project.entities) {
      const eff = effectivePlacement(e.id);
      if (!eff) continue;
      out.push({
        entityId: e.id,
        mapId: activeMap.id,
        x: eff.x,
        y: eff.y,
        label: eff.label && eff.label !== e.title ? eff.label : undefined,
        pin: eff.pin,
      });
    }
    return out;
  }, [project, activeMap, effectivePlacement]);

  const [mapImportOpen, setMapImportOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<FileChange[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Entities-tab frontmatter drafts, lifted here so the unified Save writes
  // them to disk (Export Patch removed). Keyed by entity id.
  const [entityDrafts, setEntityDrafts] = useState<Record<string, FrontmatterDraft>>({});
  // Timestamp of the most recent local edit, and of the most recent successful
  // canonical save. When editAt > saveAt, the unsaved-changes banner shows.
  const [lastLocalEditAt, setLastLocalEditAt] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // A13 dirty signals: collapse per-tab editor state into a single
  // "world.yaml is dirty" boolean. Each per-tab draft hook already exposes a
  // .dirty flag; layers/map-metadata don't, so we derive those from state
  // existence. The post-save clean-up at onSaved clears each of these.
  const mapMetadataDirty = !!(baseMap && mapOverride[baseMap.id] && Object.keys(mapOverride[baseMap.id]).length > 0);
  const layersDirty = layerEditor.localLayers.length > 0;
  const worldYamlDirty =
    mapMetadataDirty ||
    layersDirty ||
    regionDraft.dirty ||
    routeDraft.dirty ||
    fogDraft.dirty;

  /**
   * Compose the full world.yaml content for the active world by overlaying
   * the editor's per-tab draft state onto the canonical project.maps array.
   * Other maps in the world stay byte-identical to canon. The active map
   * gets its mapOverride applied with the merged layers and the effective
   * region / route / fog drafts.
   *
   * Upload-origin layers (binaries dragged into the browser) get their `src`
   * rewritten to the eventual on-disk path (e.g. `atlas/assets/maps/foo.png`)
   * so the YAML never carries a blob: URL. Their binaries ride along in the
   * save batch as separate `asset-binary` FileChange entries — the build
   * the endpoint runs after writes can then resolve every layer src.
   *
   * Returns null when there's no active world (editor still loading) or
   * when a baseline fetch error prevents a safe write.
   */
  const buildWorldYamlContent = useCallback((): string | null => {
    if (!project || !activeMap) return null;
    const remappedLayers: MapLayer[] = layerEditor.mergedLayers.map((l) => {
      const local = layerEditor.localLayers.find((ll) => ll.id === l.id);
      if (!local || local.origin !== "upload") return l;
      // upload: rewrite src to the canonical "atlas/assets/maps/<file>" form
      // (strip the public/ prefix). The actual binary is written by the
      // asset-binary FileChange we add in onSaveClick.
      const target = local.targetPath ?? `public/atlas/assets/maps/${l.id}.png`;
      const src = target.replace(/^public\//, "");
      return { ...l, src };
    });
    const updatedMaps: MapDocument[] = project.maps.map((m) => {
      if (m.id !== activeMap.id) return m;
      return {
        ...activeMap,
        layers: remappedLayers,
        regions: regionDraft.effective,
        routes: routeDraft.effective,
        fog: fogDraft.fog,
      };
    });
    return buildFullWorldYaml({
      maps: updatedMaps,
      calendar: project.calendar,
      schemaVersion: project.schemaVersion,
      existing: worldYamlBaseline.raw,
    });
  }, [project, activeMap, layerEditor.mergedLayers, layerEditor.localLayers, regionDraft.effective, routeDraft.effective, fogDraft.fog, worldYamlBaseline.raw]);

  /**
   * Build the asset-binary FileChange entries for every upload-origin layer
   * on the active map. Each carries the upload's dataUrl (which the layer
   * captured when the file was dragged in) plus its targetPath under
   * public/atlas/assets/maps/. Uploads with no dataUrl (rare — quota
   * pressure clears it from localStorage on reload) are skipped silently;
   * the world.yaml emission still references them so the DM sees the
   * mismatch in the diff modal.
   */
  const buildAssetBinaryChanges = useCallback((): FileChange[] => {
    const changes: FileChange[] = [];
    for (const local of layerEditor.localLayers) {
      if (local.origin !== "upload") continue;
      if (!local.dataUrl) continue;
      const target = local.targetPath ?? `public/atlas/assets/maps/${local.id}.png`;
      changes.push({
        path: target,
        content: local.dataUrl,
        kind: "asset-binary",
        // null = create-only. If the DM has uploaded a file that collides
        // with an existing asset on disk, the endpoint returns 409
        // already-exists and the toast surfaces the path.
        baseHash: null,
      });
    }
    return changes;
  }, [layerEditor.localLayers]);

  /**
   * Save: rewrite the canonical entity .md frontmatter for every drafted
   * placement, route it through /__atlas/save (dev-only Vite plugin → disk),
   * and trigger an atlas rebuild so the player view picks up the changes
   * without leaving the browser. A13: also writes world.yaml in the same
   * batch when any of the map / region / route / fog / layer tabs has a
   * dirty draft.
   *
   * No GitHub API. The dev plugin's allowlist only accepts content/**\/*.md
   * and content/**\/_atlas/*.yaml so even a buggy client cannot widen the
   * surface.
   */
  const onSaveClick = async () => {
    if (!project || !activeMap) return;
    const drafts = buildDraftPlacements();
    const fmPatches = entityFrontmatterPatches(entityDrafts, project.entities);
    if (drafts.length === 0 && fmPatches.length === 0 && !worldYamlDirty) {
      toast.info("No changes to save");
      return;
    }
    const entitiesById = new Map(project.entities.map((e) => [e.id, e]));
    try {
      // One FileChange per entity .md path even when an entity is edited in
      // BOTH the Pins tab (placements) and the Entities tab (frontmatter) —
      // the save endpoint rejects duplicate paths.
      const entityChanges = await buildCanonicalEntityChanges(
        { placements: drafts, frontmatter: fmPatches },
        entitiesById,
      );
      const fileChanges: FileChange[] = [...entityChanges];

      if (worldYamlDirty && activeWorldId) {
        if (worldYamlBaseline.loading) {
          toast.error("Still loading world.yaml baseline — try again in a moment.");
          return;
        }
        if (worldYamlBaseline.error) {
          toast.error(`Cannot save world.yaml: ${worldYamlBaseline.error}`);
          return;
        }
        const content = buildWorldYamlContent();
        if (!content) {
          toast.error("Cannot build world.yaml content");
          return;
        }
        // Asset-binary entries land in the same batch — bytes hit disk first,
        // then world.yaml references them. The endpoint's atomic temp+rename
        // means even a mid-batch failure rolls them back together.
        const assetChanges = buildAssetBinaryChanges();
        // Surface uploads that have lost their dataUrl (localStorage quota
        // pressure clears it on reload). The world.yaml will reference them
        // but the binary won't land — the next build will flag missing assets.
        const droppedUploads = layerEditor.localLayers.filter((l) => l.origin === "upload" && !l.dataUrl).length;
        if (droppedUploads > 0) {
          toast.warning(`${droppedUploads} uploaded image${droppedUploads === 1 ? "" : "s"} have no in-memory bytes`, {
            description: "Likely cleared by localStorage quota. Re-upload before saving.",
            duration: 8000,
          });
        }
        fileChanges.push(...assetChanges);
        fileChanges.push({
          path: worldYamlPath(activeWorldId),
          content,
          kind: "world-yaml",
          // null when world.yaml doesn't yet exist (fresh world → create-only write).
          baseHash: worldYamlBaseline.hash,
        });
      }

      if (fileChanges.length === 0) {
        toast.info("No canonical changes to write");
        return;
      }
      session.markSaving();
      setPendingChanges(fileChanges);
      setSaveModalOpen(true);
    } catch (err) {
      const msg = err instanceof CanonicalSaveError
        ? err.message
        : err instanceof Error ? err.message : String(err);
      session.markFailed(msg);
      toast.error(`Could not prepare save: ${msg}`);
    }
  };

  /**
   * Create handler for the EntityEditorPanel. Builds a FileChange for the new
   * entity .md file and routes it straight through the unified Save modal.
   * worldRoot is derived from the active world's id (e.g. content/astrath-deeprealm).
   */
  const onCreateEntity = useCallback((draft: NewEntityDraft) => {
    const activeWorld = project?.worlds.find((w) => w.id === importWorldId);
    const worldRoot = activeWorld ? `content/${activeWorld.id}` : "content";
    const change = buildNewEntityChange({
      worldRoot,
      category: draft.category,
      title: draft.title,
      summary: draft.summary,
      visibility: draft.visibility,
      kind: draft.kind,
    });
    setPendingChanges((cur) => [...cur, change]);
    setSaveModalOpen(true);
    setCreatingIn(null);
  }, [project, importWorldId]);

  const dirtyCount = Object.keys(overrides).filter((k) => activeMap && k.startsWith(`${activeMap.id}:`)).length;
  // Unsaved-changes signal: there are local pin overrides OR a dirty
  // world.yaml signal. The pin-side gate also waits for an edit since the
  // last successful save so a hydrated-but-clean session doesn't nag; the
  // world.yaml gate fires immediately because the draft hooks already
  // resolve to a "fresh state" on mount.
  const pinSideUnsaved =
    dirtyCount > 0 &&
    lastLocalEditAt !== null &&
    (lastSavedAt === null || lastLocalEditAt > lastSavedAt);
  // Entities-tab edits are dirty the moment a draft exists (like the
  // world.yaml gate) — they fire immediately so the unsaved banner shows.
  const entityDraftsDirty = Object.keys(entityDrafts).length > 0;
  const hasUnsavedChanges = pinSideUnsaved || worldYamlDirty || entityDraftsDirty;

  const session = useEditorSession({
    activeMapId: activeMap?.id ?? null,
    undoStack,
    holders: {
      overrides: {
        get: () => overridesRef.current as import("@/atlas/session/sessionSnapshot").Overrides,
        set: (o) => { overridesRef.current = o as Overrides; setOverrides(o as Overrides); },
      },
      mapOverride: {
        get: () => mapOverrideRef.current as Record<string, unknown>,
        set: (m) => { mapOverrideRef.current = m as Record<string, Partial<MapDocument>>; setMapOverride(m as Record<string, Partial<MapDocument>>); },
      },
      region: { snapshot: regionDraft.snapshot, applySnapshot: regionDraft.applySnapshot },
      route: { snapshot: routeDraft.snapshot, applySnapshot: routeDraft.applySnapshot },
      fog: { snapshot: fogDraft.snapshot, applySnapshot: fogDraft.applySnapshot },
      layer: { snapshot: layerEditor.snapshot, applySnapshot: layerEditor.applySnapshot },
      editorEntity: {
        get: () => entityEditDraft.snapshot(),
        set: (v) => entityEditDraft.applySnapshot(v as never),
      },
    },
    perMapDirtyCount: () =>
      regionDraft.dirtyCount +
      routeDraft.dirtyCount +
      (fogDraft.dirty ? 1 : 0) +
      layerEditor.localLayers.length +
      (mapMetadataDirty ? 1 : 0) +
      dirtyCount +
      (entityEditDraft.isDirty() ? 1 : 0),
  });

  // Phase 1B B4: Esc cancels in-progress pin placement (the "Click on the
  // map to place X" banner has its own button; this just covers the same
  // exit via the keyboard).
  useEffect(() => {
    if (!pendingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingId]);

  // Phase 1B B0: keyboard shortcuts for Undo / Redo.
  //   Cmd/Ctrl+Z       → undo
  //   Cmd/Ctrl+Shift+Z → redo
  //   Ctrl+Y           → redo (Windows alternate)
  // Skips when focus is in an editable surface (input, textarea, select,
  // contenteditable) so typing isn't hijacked.
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (t.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoStack.undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        undoStack.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoStack]);

  // Project-wide validation, scoped per tab so each tab badge shows its own counts.
  const draftPlacementsForValidation = useMemo(() => buildDraftPlacements(), [buildDraftPlacements]);
  const validation = useMemo(
    () => project && activeMap
      ? validateProject({
          project,
          draftPlacements: draftPlacementsForValidation,
          draftMap: activeMap,
          draftLocalLayers: layerEditor.localLayers,
        })
      : null,
    [project, activeMap, draftPlacementsForValidation, layerEditor.localLayers]
  );
  const issuesByScope = (predicate: (i: import("@/atlas/yaml/validateProject").Issue) => boolean) => {
    const list = validation?.issues.filter(predicate) ?? [];
    return {
      blocking: list.filter((i) => i.severity === "blocking").length,
      warning: list.filter((i) => i.severity === "warning").length,
    };
  };
  const pinIssues = issuesByScope((i) => i.code.includes("placement") || i.code === "pin-out-of-bounds" || i.code === "invalid-coord");
  const mapIssues = issuesByScope((i) => i.code === "duplicate-layer-id" || i.code === "empty-map" || i.code === "missing-asset" || i.code === "external-asset" || i.code === "invalid-layer-size" || i.code === "missing-layer-src" || i.code === "route-no-scale");
  const regionIssues = issuesByScope((i) => i.code.includes("region") || i.code === "spoiler-leak-region");
  const routeIssues = issuesByScope((i) => i.code.includes("route"));

  // eslint-disable-next-line react-hooks/refs -- onSaveClick is an async function, not a ref; rule fires as a false positive here
  const paletteIndex = useMemo(() => buildPaletteIndex({
    entities: project?.entities ?? [],
    maps: (project?.maps ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id })),
    commands: [
      { id: "cmd.save", title: "Save", run: onSaveClick },
      { id: "cmd.publish", title: "Publish player site", run: () => setActivePanel("publish") },
      { id: "cmd.import", title: "Import .md files", run: triggerMdImport },
      { id: "cmd.paste", title: "Paste markdown — quick capture", run: () => setPasteOpen(true) },
      ...CATEGORIES.map((c) => ({
        id: `cmd.new.${c.id}`, title: `New ${c.singular}`,
        run: () => { setActivePanel(c.id); setCreatingIn(c.id as CategoryId); },
      })),
    ],
    settings: [
      { id: "set.map", title: "Map settings" },
      { id: "set.world", title: "World details" },
    ],
    recent: [],
  }), [project, onSaveClick]);

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="font-display text-2xl text-primary">Atlas not built yet</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">
            Run <code className="px-1.5 py-0.5 rounded bg-muted">npm run atlas:build</code> first.
          </p>
          <Button asChild variant="secondary"><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        </div>
      </div>
    );
  }
  if (!project || !activeMap) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {session.restoredNotice && (
        <div className="px-3 py-1.5 text-[11px] bg-blue-500/15 text-blue-100 border-b border-blue-500/30 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span aria-hidden>↩</span>
            <span className="truncate">
              <strong>Unsaved edits restored</strong> — your last session&apos;s work was recovered automatically.
            </span>
          </span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={session.dismissRestoredNotice}>
            Dismiss
          </Button>
        </div>
      )}
      {/* Warn when player-mode atlas.json is loaded — sourcePaths are stripped, Save would fail. */}
      {project.entities.length > 0 && project.entities.every((e) => !e.sourcePath) && (
        <div className="px-3 py-2 text-[11px] bg-destructive/15 text-red-200 border-b border-destructive/40 flex items-center gap-2">
          <span aria-hidden>🔴</span>
          <span className="flex-1 min-w-0">
            <strong>Player atlas loaded — Save won't work.</strong>{" "}
            Run <code className="font-mono bg-black/30 px-1 rounded">npm run atlas:build</code> in your terminal,
            then reload this page. The dev server must serve the DM atlas for saving to work.
          </span>
        </div>
      )}
      {externalRebuildAt && (
        <div className="px-3 py-1.5 text-[11px] bg-orange-500/15 text-orange-100 border-b border-orange-500/30 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span aria-hidden>⚠</span>
            <span className="truncate">
              <strong>Canon rebuilt externally</strong> — atlas.json changed on disk since you opened the editor.
              {hasUnsavedChanges
                ? " Save your local changes first, or "
                : " "}
              reload to see the latest canon before editing.
            </span>
          </span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={reloadCanon}>
            Reload canon
          </Button>
        </div>
      )}
      <div className="px-3 py-1.5 text-[11px] bg-primary/10 text-foreground border-b border-primary/20 flex items-center justify-between gap-2">
        <span
          className="flex items-center gap-2 min-w-0"
          title="YAML canon (committed) → local draft (this browser) → Save (dev plugin writes canon + rebuilds atlas) → git commit"
        >
          <span className="truncate">
            <strong>YAML is canon.</strong> Save writes directly to your entity .md files and rebuilds the atlas — commit with git when ready.
          </span>
        </span>
        <Link to="/" className="text-primary hover:underline shrink-0">← Back</Link>
      </div>
      <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
        <Link to="/" className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2">
          <Compass className="h-5 w-5" /> <span className="hidden sm:inline">Placement Editor</span>
        </Link>
        <Badge variant="outline" className="ml-2 hidden sm:inline-flex">DM only</Badge>
        <div className="flex-1" />
        <ViewModeToggle />
        {project.maps.length > 1 && (
          <Select value={activeMap.id} onValueChange={(v) => {
            if (v === activeMap.id) return;
            session.onMapWillChange(v);
            setActiveMapId(v);
            setPendingId(null);
          }}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {project.maps.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant={showLayers ? "secondary" : "ghost"} size="sm" onClick={() => setShowLayers((v) => !v)} title="Toggle map layers">
          Layers
        </Button>
        <Button variant={showRegions ? "secondary" : "ghost"} size="sm" onClick={() => setShowRegions((v) => !v)} title="Toggle region overlays">
          Regions
        </Button>
        <SaveStatus
          status={session.status}
          unsavedCount={session.unsavedCount}
          savedAt={lastSavedAt}
          failedReason={session.failedReason}
          onSave={onSaveClick}
          onDiscard={() => setDiscardOpen(true)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => undoStack.undo()}
          disabled={!undoStack.canUndo}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => undoStack.redo()}
          disabled={!undoStack.canRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOverridesUndoable(() => ({}), "clear local pin overrides");
            toast.info("Cleared overrides");
          }}
          title="Discard all local pin overrides"
          aria-label="Discard all local pin overrides"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <PlacePinPopover
          unplaced={unplaced}
          activeMapName={activeMap.name}
          onPick={(id) => setPendingId(id)}
        />
        <Button
          variant="default"
          size="sm"
          onClick={onSaveClick}
          disabled={saveModalOpen}
          className="gap-1"
          title="Write canonical .md frontmatter and rebuild the atlas. Commit with git when ready."
        >
          <SaveIcon className="h-4 w-4" /><span className="hidden md:inline">Save</span>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/atlas">View as player →</Link>
        </Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Menu"
            title="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MenuIcon className="h-4 w-4" />
          </Button>
          {menuOpen && (
            <>
              {/* backdrop to close on outside click */}
              <div
                className="fixed inset-0 z-[49]"
                aria-hidden
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50">
                <EditorMenu
                  open
                  onWorldDetails={() => { setMenuOpen(false); setActivePanel("world"); }}
                  onMapDetails={() => { setMenuOpen(false); setActivePanel("maps"); }}
                  onHelp={() => { setMenuOpen(false); window.open("https://github.com", "_blank"); }}
                />
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex relative min-h-0">
        {(() => {
          const editingEntity = editingEntityId
            ? project?.entities?.find((e) => e.id === editingEntityId)
            : undefined;

          const renderCategory = (cat: string, node: React.ReactNode): React.ReactNode => {
            if (
              editingEntity &&
              categoryForType(editingEntity.type) === cat &&
              editingEntity.sourcePath
            ) {
              return (
                <EntitySurface
                  entity={editingEntity}
                  entitiesById={entitiesById}
                  onClose={() => {
                    const intent = resolveEntityCloseIntent({ dirty: entityEditDraft.isDirty() });
                    if (intent.kind === "confirm-discard") {
                      if (!window.confirm("Discard your unsaved changes to this entity?")) return;
                      entityEditDraft.clear();
                    }
                    setEditingEntityId(null);
                  }}
                  renderEdit={() => (
                    <EntityEditPanel
                      sourcePath={editingEntity.sourcePath!}
                      draftApi={entityEditDraft}
                      onClose={() => setEditingEntityId(null)}
                      onSaved={() => { setEditingEntityId(null); void reloadCanon(); }}
                    />
                  )}
                />
              );
            }
            return node;
          };

          const panels: Record<string, React.ReactNode> = {
            // Six content categories — wired to CategoryPanel (browse) or
            // EntityEditorPanel (create). Phase 2 EntitiesTab stopgap removed.
            characters: creatingIn === "characters" ? (
              <EntityEditorPanel mode="create" category="characters"
                onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
            ) : renderCategory("characters", (
              <CategoryPanel category="characters" entities={displayEntities}
                onOpen={(id) => setEditingEntityId(id)}
                onNew={() => setCreatingIn("characters")}
                onImport={triggerMdImport}
                hasPlacement={(id) => !!effectiveCoord(id)}
                onShowOnMap={(id) => goTo(id)} />
            )),
            locations: creatingIn === "locations" ? (
              <EntityEditorPanel mode="create" category="locations"
                onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
            ) : renderCategory("locations", (
              <CategoryPanel category="locations" entities={displayEntities}
                onOpen={(id) => setEditingEntityId(id)}
                onNew={() => setCreatingIn("locations")}
                onImport={triggerMdImport}
                hasPlacement={(id) => !!effectiveCoord(id)}
                onShowOnMap={(id) => goTo(id)} />
            )),
            factions: creatingIn === "factions" ? (
              <EntityEditorPanel mode="create" category="factions"
                onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
            ) : renderCategory("factions", (
              <CategoryPanel category="factions" entities={displayEntities}
                onOpen={(id) => setEditingEntityId(id)}
                onNew={() => setCreatingIn("factions")}
                onImport={triggerMdImport}
                hasPlacement={(id) => !!effectiveCoord(id)}
                onShowOnMap={(id) => goTo(id)} />
            )),
            events: creatingIn === "events" ? (
              <EntityEditorPanel mode="create" category="events"
                onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
            ) : renderCategory("events", (
              <CategoryPanel category="events" entities={displayEntities}
                onOpen={(id) => setEditingEntityId(id)}
                onNew={() => setCreatingIn("events")}
                onImport={triggerMdImport}
                hasPlacement={(id) => !!effectiveCoord(id)}
                onShowOnMap={(id) => goTo(id)} />
            )),
            items: creatingIn === "items" ? (
              <EntityEditorPanel mode="create" category="items"
                onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
            ) : renderCategory("items", (
              <CategoryPanel category="items" entities={displayEntities}
                onOpen={(id) => setEditingEntityId(id)}
                onNew={() => setCreatingIn("items")}
                onImport={triggerMdImport}
                hasPlacement={(id) => !!effectiveCoord(id)}
                onShowOnMap={(id) => goTo(id)} />
            )),
            lore: creatingIn === "lore" ? (
              <EntityEditorPanel mode="create" category="lore"
                onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
            ) : renderCategory("lore", (
              <CategoryPanel category="lore" entities={displayEntities}
                onOpen={(id) => setEditingEntityId(id)}
                onNew={() => setCreatingIn("lore")}
                onImport={triggerMdImport}
                hasPlacement={(id) => !!effectiveCoord(id)}
                onShowOnMap={(id) => goTo(id)} />
            )),
            // Map tools — exact JSX from former TabsContent bodies
            pins: (
              <TabFrame
                title="Pins"
                builtFromYamlCount={project.placements.filter((p) => p.mapId === activeMap.id).length}
                localDraftCount={dirtyCount}
                blockingCount={pinIssues.blocking}
                warningCount={pinIssues.warning}
              >
                <div>
                  <div className="p-3 border-b border-border space-y-2">
                    <Input placeholder="Filter entities…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                    <div className="flex flex-wrap gap-1">
                      {(["all","unplaced","placed"] as const).map((s) => (
                        <Button key={s} size="sm" variant={stateFilter === s ? "secondary" : "ghost"} className="h-6 px-2 text-[10px] uppercase" onClick={() => setStateFilter(s)}>{s}</Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <Select value={visFilter} onValueChange={(v) => setVisFilter(v as typeof visFilter)}>
                        <SelectTrigger className="h-6 w-auto px-2 text-[10px] gap-1"><SelectValue placeholder="visibility" /></SelectTrigger>
                        <SelectContent>
                          {["all","player","rumor","dm","hidden"].map((v) => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="h-6 w-auto px-2 text-[10px] gap-1"><SelectValue placeholder="type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">all types</SelectItem>
                          {allTypes.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {allTags.length > 0 && (
                        <Select value={tagFilter} onValueChange={setTagFilter}>
                          <SelectTrigger className="h-6 w-auto px-2 text-[10px] gap-1"><SelectValue placeholder="tag" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">all tags</SelectItem>
                            {allTags.map((t) => <SelectItem key={t} value={t} className="text-xs">#{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        size="sm"
                        variant={chainPlaceMode ? "default" : "outline"}
                        className="h-6 px-2 text-[10px]"
                        onClick={() => {
                          const next = !chainPlaceMode;
                          setChainPlaceMode(next);
                          if (next && !pendingId && unplaced[0]) setPendingId(unplaced[0].id);
                        }}
                        title="Auto-advance to the next unplaced entity after each click"
                      >
                        Place next
                      </Button>
                    </div>
                  </div>
                  <Section title={`Unplaced (${unplaced.length})`}>
                    {unplaced.map((e) => (
                      <EntityRow key={e.id} entity={e} state="unplaced" isPending={pendingId === e.id} onPlace={() => setPendingId(e.id)} />
                    ))}
                    {unplaced.length === 0 && <Empty text="No unplaced entities match these filters." />}
                  </Section>
                  <Section title={`Placed (${placed.length})`}>
                    {placed.map((e) => {
                      const eff = effectivePlacement(e.id)!;
                      const overridden = overrideKey(activeMap.id, e.id) in overrides;
                      const otherMaps = project.maps.filter((m) => m.id !== activeMap.id).map((m) => ({ id: m.id, name: m.name }));
                      return (
                        <EntityRow
                          key={e.id}
                          entity={e}
                          state="placed"
                          coord={{ x: eff.x, y: eff.y }}
                          label={eff.label}
                          pinOverride={eff.pin}
                          overridden={overridden}
                          isPending={pendingId === e.id}
                          otherMaps={otherMaps}
                          onGoTo={() => goTo(e.id)}
                          onMove={() => setPendingId(e.id)}
                          onRemove={() => removeCoord(e.id)}
                          onReset={overridden ? () => clearOverride(e.id) : undefined}
                          onNudge={(dx, dy) => nudge(e.id, dx, dy)}
                          onChangeXY={(x, y) => setCoord(e.id, { x, y })}
                          onChangeLabel={(l) => setLabel(e.id, l)}
                          onChangePin={(p) => setPinOverride(e.id, p)}
                          onDuplicateToMap={(mid) => duplicateToMap(e.id, mid)}
                        />
                      );
                    })}
                    {placed.length === 0 && <Empty text="No placed entities match these filters." />}
                  </Section>
                </div>
              </TabFrame>
            ),
            regions: (
              <RegionsTab
                project={project}
                map={activeMap}
                api={regionDraft}
                blockingCount={regionIssues.blocking}
                warningCount={regionIssues.warning}
                onFitTo={(r) => {
                  if (!r.points.length) return;
                  const cx = r.points.reduce((s, p) => s + p[0], 0) / r.points.length;
                  const cy = r.points.reduce((s, p) => s + p[1], 0) / r.points.length;
                  setFlyTo({ lat: activeMap.height - cy, lng: cx });
                }}
              />
            ),
            routes: (
              <RoutesTab
                project={project}
                map={activeMap}
                api={routeDraft}
                blockingCount={routeIssues.blocking}
                warningCount={routeIssues.warning}
                onFitTo={(pts) => {
                  if (!pts.length) return;
                  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
                  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
                  setFlyTo({ lat: activeMap.height - cy, lng: cx });
                }}
              />
            ),
            fog: (
              <FogTab
                map={activeMap}
                project={project}
                api={fogDraft}
                regionApi={regionDraft}
                routeApi={routeDraft}
                showFogPreview={showFogPreview}
                setShowFogPreview={setShowFogPreview}
                blockingCount={mapIssues.blocking}
                warningCount={mapIssues.warning}
              />
            ),
            maps: (
              <>
                <div className="px-3 pt-2">
                  <Button size="sm" variant="outline" className="w-full gap-1 h-8 text-xs" onClick={() => setMapImportOpen(true)}>
                    <Upload className="h-3.5 w-3.5" /> Import Maps (batch wizard)
                  </Button>
                </div>
                <Tabs defaultValue="layers" className="flex-1 flex flex-col min-h-0">
                  <TabsList className="mx-3 mt-2 grid grid-cols-2">
                    <TabsTrigger value="layers" className="text-[11px]"><LayersIcon className="h-3.5 w-3.5 mr-1" />Layers</TabsTrigger>
                    <TabsTrigger value="settings" className="text-[11px]"><Settings2 className="h-3.5 w-3.5 mr-1" />Settings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="layers" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
                    <MapLayerPanel
                      map={activeMap}
                      mergedLayers={layerEditor.mergedLayers}
                      localLayers={layerEditor.localLayers}
                      selectedId={layerEditor.selectedId}
                      setSelectedId={layerEditor.setSelectedId}
                      onAddFiles={layerEditor.addUploaded}
                      onAddUrl={layerEditor.addUrl}
                      onEditBuiltin={layerEditor.editBuiltinLayer}
                      onUpdate={layerEditor.updateLayer}
                      onDuplicate={layerEditor.duplicateLayer}
                      onRemove={layerEditor.removeLayer}
                      onClearAll={layerEditor.clearAll}
                      onSetMapSize={(w, h) => patchMap({ width: w, height: h })}
                      editGeometry={editGeometry}
                      setEditGeometry={setEditGeometry}
                      lockAspect={lockAspectRatio}
                      setLockAspect={setLockAspectRatio}
                    />
                  </TabsContent>
                  <TabsContent value="settings" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
                    {baseMap && <MapSettingsPanel map={activeMap} baseMap={baseMap} onPatch={patchMap} onReset={resetMap} />}
                  </TabsContent>
                </Tabs>
              </>
            ),
            publish: (
              <PublishCheckTab
                project={project}
                draftMap={activeMap}
                draftPlacements={draftPlacementsForValidation}
                draftLocalLayers={layerEditor.localLayers}
                onGoToMap={(mid) => { setActiveMapId(mid); toast.info(`Switched to ${project.maps.find((m) => m.id === mid)?.name ?? mid}`); }}
                onGoToEntity={(eid) => {
                  const c = effectiveCoord(eid);
                  if (c && activeMap) setFlyTo({ lat: activeMap.height - c.y, lng: c.x });
                  setFilter(project.entities.find((e) => e.id === eid)?.title ?? "");
                }}
              />
            ),
            import: (
              <ImportPanel knownEntityNames={new Set(project.entities.flatMap((e) => [e.id.toLowerCase(), e.title.toLowerCase(), ...e.aliases.map((a) => a.toLowerCase())]))} />
            ),
            // Menu-reachable panels (no rail icon — opened via ☰ menu or CommandPalette).
            world: (
              <WorldDetailsPanel
                world={{ name: project.worlds?.[0]?.name ?? "" }}
                onPatch={(p) => {
                  // The world name is hardcoded in build-atlas.ts (not in world.yaml),
                  // so there is no live write path here yet. Log for DM awareness.
                  console.warn("WorldDetailsPanel.onPatch: world name patch not yet persisted", p);
                }}
              />
            ),
          };
          const counts: Record<string, number | undefined> = {
            pins: unplaced.length > 0 ? unplaced.length : undefined,
          };
          const railItems = buildRailItems({ panels, counts });
          const active = railItems.find((i) => i.id === activePanel);
          return (
            <>
              <EditorRail
                items={railItems}
                activeId={activePanel}
                onSelect={(id) => {
                  if (id === "save") { void onSaveClick(); return; }
                  selectPanel(id);
                }}
              />
              <div className="relative flex-1 min-h-0">
          <OceanBackground map={activeMap} />
          <MapContainer
            crs={FlatCRS}
            center={[activeMap.height / 2, activeMap.width / 2]}
            zoom={-2}
            minZoom={-6}
            maxZoom={4}
            attributionControl={false}
            style={{ width: "100%", height: "100%", background: activeMap.water?.enabled === false ? (activeMap.oceanColor ?? "#18313f") : "transparent", cursor: (pendingId || regionDraft.drawing) ? "crosshair" : undefined }}
          >
            <FlyTo target={flyTo} />
            <MapClickCapture onClick={onMapClick} />

            {/* Map base image layers — built-in + locally edited/uploaded.
                In edit-geometry mode + when this layer is selected, the
                overlay grows drag handles and the body becomes draggable.
                The component handles its own undo recording by calling
                layerEditor.updateLayer via onCommit. */}
            {showLayers && layerEditor.mergedLayers.map((layer) => {
              const isSelected = layerEditor.selectedId === layer.id;
              return (
                <MapLayerEditableOverlay
                  key={layer.id}
                  layer={layer}
                  mapDoc={activeMap}
                  editMode={editGeometry}
                  isSelected={isSelected}
                  lockAspect={lockAspectRatio}
                  onSelect={() => layerEditor.setSelectedId(layer.id)}
                  onBackgroundClick={handleLayerBackgroundClick}
                  onCommit={(patch) => {
                    // Promote built-in to a local "edit" before mutating,
                    // matching MapLayerPanel.patch() behavior.
                    const isLocal = layerEditor.localLayers.some((l) => l.id === layer.id);
                    if (!isLocal) layerEditor.editBuiltinLayer(layer.id);
                    layerEditor.updateLayer(layer.id, patch);
                  }}
                />
              );
            })}

            {/* Z-order: layers → regions → routes → fog → pins → handles. */}
            {showRegions && <RegionLayer map={activeMap} api={regionDraft} visible={showRegions} />}
            <RouteLayer map={activeMap} api={routeDraft} />
            <FogLayer map={activeMap} api={fogDraft} preview={showFogPreview} playerMode={mode === "player"} />

            {placedForLens.map((e) => {
              const eff = effectivePlacement(e.id);
              if (!eff) return null;
              const style = resolvePinStyle(e.type, eff.pin);
              return (
                <Marker
                  key={e.id}
                  position={[activeMap.height - eff.y, eff.x]}
                  icon={pinDivIcon(style.color, style.shape, { pulse: pendingId === e.id })}
                  draggable
                  eventHandlers={{
                    dragend: (ev) => {
                      const ll = (ev.target as L.Marker).getLatLng();
                      setCoord(e.id, { x: Math.round(ll.lng), y: Math.round(activeMap.height - ll.lat) });
                    },
                    click: (ev) => {
                      const intent = resolvePinClickIntent({ pending: !!pendingId, entityId: e.id });
                      if (intent.kind === "place-anchor") {
                        const ll = (ev.target as L.Marker).getLatLng();
                        onMapClick(ll.lng, ll.lat);
                        return;
                      }
                      // Open the entity in Reading via EntitySurface (player parity).
                      // setActivePanel must come first so the panel host is open
                      // before renderCategory checks which category is active.
                      setActivePanel(categoryForType(e.type));
                      setEditingEntityId(intent.entityId);
                    },
                    dblclick: () => {
                      if (pendingId) return;
                      setActivePanel(categoryForType(e.type));
                      setEditingEntityId(e.id);
                    },
                  }}
                />
              );
            })}
            <AtlasMinimap map={activeMap} layers={layerEditor.mergedLayers} />
          </MapContainer>

          {pendingId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs shadow-lg flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5" />
              <span>Click on the map to place "{project.entities.find((e) => e.id === pendingId)?.title}"</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-1 h-5 px-1.5 text-[10px] gap-1 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => setPendingId(null)}
                title="Cancel placement (Esc)"
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
            </div>
          )}
          <EditorPanelHost
            activeId={activePanel}
            title={active?.label ?? ""}
            onDismiss={dismissPanel}
          >
            {active?.panel}
          </EditorPanelHost>
        </div>
              </>
          );
        })()}
      </div>
      <style>{`@keyframes atlas-pulse { 0%,100% { filter: drop-shadow(0 0 0 hsl(var(--primary))); } 50% { filter: drop-shadow(0 0 6px hsl(var(--primary))); } }`}</style>
      <MapImportWizard
        open={mapImportOpen}
        onOpenChange={setMapImportOpen}
        currentMap={activeMap}
        defaultWorldId={activeMap.worldId}
      />
      <DiffPreviewModal
        open={saveModalOpen}
        changes={pendingChanges}
        previousContents={
          worldYamlBaseline.raw !== null && activeWorldId
            ? { [worldYamlPath(activeWorldId)]: worldYamlBaseline.raw }
            : undefined
        }
        rebuildAfterSave={true}
        onSaved={(result) => {
          void session.markSaved();
          setLastSavedAt(Date.now());
          // Phase 1B B0 — capture pre-save snapshots so the save-boundary
          // undo entry below can restore the dirty local state when the DM
          // hits Cmd+Z across a save. Snapshots reflect the state RIGHT
          // BEFORE this cleanup runs.
          const preSave = {
            overrides: overridesRef.current,
            mapOverride: mapOverrideRef.current,
            regionDraft: regionDraft.snapshot(),
            routeDraft: routeDraft.snapshot(),
            fogDraft: fogDraft.snapshot(),
            layerByMap: layerEditor.snapshot(),
          };

          // Clear local pin overrides for the active map — they now live in
          // canon. Bypass-undo path (raw setOverrides + ref sync) because
          // the save-boundary entry handles undo recording for the whole
          // cleanup as one atomic step.
          const writtenPaths = new Set(result.paths);
          const writtenEntityIds = new Set(
            project.entities
              .filter((e) => writtenPaths.has(e.sourcePath))
              .map((e) => e.id),
          );
          // Drafted Entities-tab edits for written files now live in canon —
          // drop them so the tab and the unsaved banner reset.
          if (writtenEntityIds.size > 0) {
            setEntityDrafts((prev) => {
              const next = { ...prev };
              for (const id of writtenEntityIds) delete next[id];
              return next;
            });
          }
          const nextOverrides: Overrides = { ...preSave.overrides };
          for (const k of Object.keys(nextOverrides)) {
            const [mid, eid] = k.split(":");
            if (mid === activeMap.id && writtenEntityIds.has(eid)) {
              delete nextOverrides[k];
            }
          }
          overridesRef.current = nextOverrides;
          setOverrides(nextOverrides);

          // A13: if world.yaml was part of the batch, clear the per-tab drafts
          // and refresh the baseline so the next dirty cycle starts fresh.
          // All clears go through the *non-undoable* applySnapshot path so
          // the only undo entry we add for this save is the single
          // save-boundary entry below.
          const worldYamlWritten = !!(activeWorldId && writtenPaths.has(worldYamlPath(activeWorldId)));
          let nextMapOverride = preSave.mapOverride;
          let nextLayerByMap = preSave.layerByMap;
          const cleanRegionDraft = { edits: {}, added: [], deleted: [] };
          const cleanRouteDraft = { edits: {}, added: [], deleted: [] };
          if (worldYamlWritten) {
            regionDraft.applySnapshot(cleanRegionDraft);
            routeDraft.applySnapshot(cleanRouteDraft);
            fogDraft.applySnapshot(null);
            nextLayerByMap = { ...preSave.layerByMap, [activeMap.id]: [] };
            layerEditor.applySnapshot(nextLayerByMap);
            nextMapOverride = { ...preSave.mapOverride };
            delete nextMapOverride[activeMap.id];
            mapOverrideRef.current = nextMapOverride;
            setMapOverride(nextMapOverride);
            void worldYamlBaseline.refresh();
          }

          // Push the save-boundary undo entry. Undoing restores ALL the
          // pre-save state in one shot — pin overrides, region/route/fog
          // drafts, layer geometry overrides, map metadata. The chip flips
          // Saved → Unsaved (because dirty signals come back) without
          // touching disk. Per spec §I: "puts the editor back into the
          // prior in-memory state and flips the chip back to Unsaved."
          undoStack.push({
            label: "save (cleared local drafts)",
            undo: () => {
              overridesRef.current = preSave.overrides;
              setOverrides(preSave.overrides);
              if (worldYamlWritten) {
                mapOverrideRef.current = preSave.mapOverride;
                setMapOverride(preSave.mapOverride);
                regionDraft.applySnapshot(preSave.regionDraft);
                routeDraft.applySnapshot(preSave.routeDraft);
                fogDraft.applySnapshot(preSave.fogDraft);
                layerEditor.applySnapshot(preSave.layerByMap);
              }
            },
            redo: () => {
              overridesRef.current = nextOverrides;
              setOverrides(nextOverrides);
              if (worldYamlWritten) {
                mapOverrideRef.current = nextMapOverride;
                setMapOverride(nextMapOverride);
                regionDraft.applySnapshot(cleanRegionDraft);
                routeDraft.applySnapshot(cleanRouteDraft);
                fogDraft.applySnapshot(null);
                layerEditor.applySnapshot(nextLayerByMap);
              }
            },
          });

          // Refresh canon (only meaningful if rebuild succeeded).
          if (result.build?.ok !== false) {
            loadAtlasContent(true).then((p) => {
              setProject(p);
            }).catch(() => { /* keep current; user can reload manually */ });
          }
        }}
        onClose={() => {
          setSaveModalOpen(false);
          setPendingChanges([]);
        }}
      />
      <DiscardConfirmModal
        open={discardOpen}
        count={session.unsavedCount}
        onConfirm={() => { void session.discardAll(); }}
        onClose={() => setDiscardOpen(false)}
      />
      <CommandPalette
        index={paletteIndex}
        onChoose={(r) => {
          if (r.run) { r.run(); return; }
          if (r.kind === "entity") {
            const ent = project.entities.find((e) => e.id === r.id);
            setActivePanel(categoryForType(ent?.type));
            if (ent) setEditingEntityId(ent.id);
          }
          if (r.kind === "map") setActiveMapId(r.id);
          if (r.kind === "setting") setActivePanel(r.id === "set.world" ? "world" : "maps");
        }}
      />
      <ImportStagingModal
        open={importFlow.open}
        rows={importFlow.rows}
        isImporting={importFlow.isImporting}
        importConfig={importConfig}
        onPatchRow={importFlow.patchRow}
        onCancel={importFlow.cancel}
        onCommit={importFlow.commit}
      />
      {/* Hidden file input for "Import .md" button in CategoryPanel */}
      <input
        ref={mdFileInputRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void importFlow.openWithFiles(files);
        }}
      />
      <PasteMarkdownDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onSubmit={({ filename, raw }) => importFlow.openWithInputs([{ filename, raw }])}
      />
      {isDraggingMd && (
        <div
          aria-hidden
          className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center bg-primary/15 backdrop-blur-sm"
        >
          <div className="rounded-lg border-2 border-dashed border-primary bg-background/90 px-6 py-4 text-sm font-medium text-primary shadow-lg">
            Drop .md files to stage for import
          </div>
        </div>
      )}
    </div>
  );
}

export default function AtlasPlacementEditor() {
  return (
    <ViewModeProvider>
      <AtlasPlacementEditorInner />
    </ViewModeProvider>
  );
}

/**
 * Phase 1B B4 — toolbar popover that lists every unplaced entity on the
 * active map. Picking one routes through the same `setPendingId` flow as
 * the per-row "Place" button, so the existing crosshair banner + click
 * handler take over from there.
 *
 * The popover is filtered by a small search box at the top — placing 50
 * unplaced entities through a flat list would be unusable. The list cap
 * (40 visible rows) keeps the popover scroll-free in the common case
 * without paginating.
 */
function PlacePinPopover({
  unplaced,
  activeMapName,
  onPick,
}: {
  unplaced: Entity[];
  activeMapName: string;
  onPick: (entityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const VISIBLE_CAP = 40;
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? unplaced.filter((e) =>
        e.title.toLowerCase().includes(q)
        || e.type.toLowerCase().includes(q)
        || e.aliases.some((a) => a.toLowerCase().includes(q))
      )
    : unplaced;
  const overflow = filtered.length - VISIBLE_CAP;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={unplaced.length === 0}
          title={
            unplaced.length === 0
              ? "All entities are placed on this map"
              : `Pick one of ${unplaced.length} unplaced entit${unplaced.length === 1 ? "y" : "ies"} to drop on ${activeMapName}`
          }
        >
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">Place Pin</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <Input
            autoFocus
            placeholder={`Search ${unplaced.length} unplaced entit${unplaced.length === 1 ? "y" : "ies"}…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground italic">
                {unplaced.length === 0 ? "Nothing to place" : "No matches"}
              </div>
            )}
            {filtered.slice(0, VISIBLE_CAP).map((e) => {
              const style = resolvePinStyle(e.type);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                  onClick={() => {
                    onPick(e.id);
                    setOpen(false);
                    setFilter("");
                  }}
                >
                  <span
                    className="shrink-0"
                    aria-hidden
                    dangerouslySetInnerHTML={{ __html: pinSvg({ color: style.color, shape: style.shape }) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{e.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{e.type}</div>
                  </div>
                </button>
              );
            })}
            {overflow > 0 && (
              <div className="px-2 py-1.5 text-[10px] text-muted-foreground italic">
                +{overflow} more — refine your search.
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 py-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground px-2 py-3 italic">{text}</div>;
}

interface RowProps {
  entity: Entity;
  state: "placed" | "unplaced";
  coord?: { x: number; y: number };
  overridden?: boolean;
  isPending?: boolean;
  pinOverride?: PinOverride;
  label?: string;
  /** Other maps the entity could be duplicated to (excludes the active one). */
  otherMaps?: { id: string; name: string }[];
  onPlace?: () => void;
  onMove?: () => void;
  onGoTo?: () => void;
  onRemove?: () => void;
  onReset?: () => void;
  onNudge?: (dx: number, dy: number) => void;
  onChangeXY?: (x: number, y: number) => void;
  onChangeLabel?: (label: string | undefined) => void;
  onChangePin?: (pin: PinOverride | undefined) => void;
  onDuplicateToMap?: (mapId: string) => void;
}

function EntityRow({
  entity, state, coord, overridden, isPending, pinOverride, label, otherMaps,
  onPlace, onMove, onGoTo, onRemove, onReset, onNudge, onChangeXY, onChangeLabel, onChangePin, onDuplicateToMap,
}: RowProps) {
  const style = resolvePinStyle(entity.type, pinOverride);
  return (
    <div className={`group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40 ${isPending ? "ring-1 ring-primary bg-accent/30" : ""}`}>
      <span
        className="shrink-0"
        aria-hidden
        // Inline preset-color preview keeps the row visually in sync with the map pin.
        dangerouslySetInnerHTML={{ __html: pinSvg({ color: style.color, shape: style.shape }) }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-1.5">
          {label || entity.title}
          {overridden && <Badge variant="secondary" className="h-4 text-[9px] px-1">edited</Badge>}
        </div>
        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
          {entity.type}{coord ? ` · ${coord.x}, ${coord.y}` : ""}
          <PinStateBadge placed={state === "placed"} />
        </div>
      </div>
      {state === "unplaced" && (
        <Button size="sm" variant={isPending ? "default" : "ghost"} onClick={onPlace} className="h-7 px-2" title="Click on the map to place">
          <Crosshair className="h-3.5 w-3.5" />
        </Button>
      )}
      {state === "placed" && coord && (
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onGoTo} title="Fly to"><Target className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onMove} title="Re-place"><MapPin className="h-3.5 w-3.5" /></Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Style + advanced">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <PinStyleEditor
                entityType={entity.type}
                value={pinOverride}
                onChange={(v) => onChangePin?.(v)}
              />
              <div className="space-y-1">
                <Label className="text-[11px]">Label override</Label>
                <Input
                  className="h-8 text-xs"
                  value={label ?? ""}
                  placeholder={entity.title}
                  onChange={(e) => onChangeLabel?.(e.target.value || undefined)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">x</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={coord.x}
                    onChange={(e) => onChangeXY?.(Number(e.target.value) || 0, coord.y)}
                  />
                </div>
                <div>
                  <Label className="text-[11px]">y</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={coord.y}
                    onChange={(e) => onChangeXY?.(coord.x, Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Nudge</Label>
                <div className="grid grid-cols-3 gap-1 w-28">
                  <span />
                  <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => onNudge?.(0, 100)}>↑</Button>
                  <span />
                  <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => onNudge?.(-100, 0)}>←</Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => onNudge?.(0, -100)}>↓</Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs p-0" onClick={() => onNudge?.(100, 0)}>→</Button>
                </div>
              </div>
              {otherMaps && otherMaps.length > 0 && onDuplicateToMap && (
                <div className="space-y-1 pt-1 border-t border-border">
                  <Label className="text-[11px]">Duplicate to map</Label>
                  <Select onValueChange={(v) => onDuplicateToMap(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose map…" /></SelectTrigger>
                    <SelectContent>
                      {otherMaps.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {onReset && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onReset} title="Discard local edit" aria-label="Discard local edit"><RotateCcw className="h-3.5 w-3.5" /></Button>}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={onRemove} title="Remove placement" aria-label="Remove placement"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

/** Visual preset/color/shape/label-mode editor. Outputs a minimal PinOverride
 *  (only fields that differ from the entity-type preset) — we never persist
 *  preset defaults, so frontmatter stays clean. */
function PinStyleEditor({
  entityType,
  value,
  onChange,
}: {
  entityType: string;
  value: PinOverride | undefined;
  onChange: (v: PinOverride | undefined) => void;
}) {
  const presetId = (value?.preset ?? defaultPresetForType(entityType)) as PinPresetId;
  const preset = PIN_PRESETS[presetId];
  const merged = resolvePinStyle(entityType, value);

  const update = (patch: Partial<typeof merged> & { preset?: PinPresetId }) => {
    onChange(diffPinOverride(entityType, { ...merged, ...patch }));
  };

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[11px]">Pin preset</Label>
        <Select value={presetId} onValueChange={(v) => update({ preset: v as PinPresetId })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            {(Object.keys(PIN_PRESETS) as PinPresetId[]).map((id) => (
              <SelectItem key={id} value={id} className="text-xs">{PIN_PRESETS[id].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Color</Label>
          <Input type="color" className="h-8 p-1" value={merged.color} onChange={(e) => update({ color: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px]">Shape</Label>
          <Select value={merged.shape} onValueChange={(v) => update({ shape: v as typeof merged.shape })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["teardrop","circle","square","diamond","shield","star"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-[11px]">Label mode</Label>
        <Select value={merged.labelMode} onValueChange={(v) => update({ labelMode: v as typeof merged.labelMode })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["auto","always","hover","never"].map((m) => (
              <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <div className="flex justify-between"><Label className="text-[11px]">Priority</Label><span className="text-[10px] text-muted-foreground">{merged.priority}</span></div>
        <Slider min={0} max={10} step={1} value={[merged.priority]} onValueChange={([v]) => update({ priority: v })} />
      </div>
      <div>
        <div className="flex justify-between"><Label className="text-[11px]">Min zoom</Label><span className="text-[10px] text-muted-foreground">{merged.labelMinZoom}</span></div>
        <Slider min={-6} max={4} step={1} value={[merged.labelMinZoom]} onValueChange={([v]) => update({ labelMinZoom: v })} />
      </div>
      {value && Object.keys(value).length > 0 && (
        <Button size="sm" variant="ghost" className="h-7 text-xs w-full" onClick={() => onChange(undefined)}>
          Reset to "{preset.label}" preset
        </Button>
      )}
    </div>
  );
}

