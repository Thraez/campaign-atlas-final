import { useEffect, useMemo, useState, useCallback } from "react";
import { MapContainer, Marker, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, Crosshair, Download, RotateCcw, MapPin, Target, Trash2, FileCode, Layers as LayersIcon, MapPin as PinIcon, Settings2, Package, FolderOpen, Shapes, Route as RouteIcon, CloudFog, BookOpen, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity, MapDocument } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMapLayers } from "@/atlas/useMapLayers";
import { MapLayerPanel } from "@/atlas/MapLayerPanel";
import { MapSettingsPanel } from "@/atlas/MapSettingsPanel";
import { AtlasMinimap } from "@/atlas/AtlasMinimap";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { classifyDraftStatus } from "@/atlas/yaml/canon";
import { DraftStatusBadge } from "@/atlas/yaml/StatusBadge";
import {
  buildPlacementJson,
  buildPlacementPatch,
  type PlacementOverride,
} from "@/atlas/yaml/buildPatches";
import { ExportChangesModal } from "@/atlas/ExportChangesModal";
import { ImportPanel } from "@/atlas/import/ImportPanel";
import { TabFrame } from "@/atlas/tabs/TabFrame";
import { RegionsTab } from "@/atlas/tabs/RegionsTab";
import { RoutesTab } from "@/atlas/tabs/RoutesTab";
import { FogTab } from "@/atlas/tabs/FogTab";
import { EntitiesTab } from "@/atlas/tabs/EntitiesTab";
import { PublishCheckTab } from "@/atlas/tabs/PublishCheckTab";
import { validateProject } from "@/atlas/yaml/validateProject";
import { MapImportWizard } from "@/atlas/import/MapImportWizard";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { RegionLayer } from "@/atlas/regions/RegionLayer";
import { useRouteDraft } from "@/atlas/routes/useRouteDraft";
import { RouteLayer } from "@/atlas/routes/RouteLayer";
import { useFogDraft } from "@/atlas/fog/useFogDraft";
import { FogLayer } from "@/atlas/fog/FogLayer";
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

export default function AtlasPlacementEditor() {
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>(() => {
    try {
      const v3 = localStorage.getItem(STORAGE_KEY);
      if (v3) return JSON.parse(v3);
      // Forward-migration: v2 entries are already keyed by `${mapId}:${entityId}`
      // and only carry x/y — directly compatible with the v3 shape.
      const v2raw = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
      if (v2raw) return JSON.parse(v2raw);
      // v1 was entityId-keyed; defer mapId resolution until project loads.
      const v1raw = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
      if (!v1raw) return {};
      const v1 = JSON.parse(v1raw) as Record<string, Override>;
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
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

  const patchMap = (patch: Partial<MapDocument>) => {
    if (!baseMap) return;
    setMapOverride((s) => ({ ...s, [baseMap.id]: { ...(s[baseMap.id] ?? {}), ...patch } }));
  };
  const resetMap = () => {
    if (!baseMap) return;
    setMapOverride((s) => { const n = { ...s }; delete n[baseMap.id]; return n; });
  };

  const layerEditor = useMapLayers(activeMap);

  // Region draft state — shared between RegionsTab (form) and the map (RegionLayer).
  const entityIdSet = useMemo(() => new Set((project?.entities ?? []).map((e) => e.id)), [project]);
  const dmEntityIdSet = useMemo(
    () => new Set((project?.entities ?? []).filter((e) => e.visibility === "dm" || e.visibility === "hidden").map((e) => e.id)),
    [project]
  );
  const regionDraft = useRegionDraft(activeMap, { entityIds: entityIdSet, dmEntityIds: dmEntityIdSet });
  const routeDraft = useRouteDraft(project, activeMap, { entityIds: entityIdSet, dmEntityIds: dmEntityIdSet });
  const fogDraft = useFogDraft(activeMap);
  const [showFogPreview, setShowFogPreview] = useState(true);

  /** Per-tab filter state (placed/unplaced/visibility/type/tag). */
  const [stateFilter, setStateFilter] = useState<"all" | "placed" | "unplaced">("all");
  const [visFilter, setVisFilter] = useState<"all" | "player" | "rumor" | "dm" | "hidden">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  /** When true, finishing a placement automatically queues the next unplaced entity. */
  const [chainPlaceMode, setChainPlaceMode] = useState(false);

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

  /** Merge a partial override into the local draft. */
  const mutateOverride = useCallback((entityId: string, patch: Partial<OverrideValue>) => {
    if (!activeMap) return;
    setOverrides((o) => {
      const k = overrideKey(activeMap.id, entityId);
      const current = (k in o ? o[k] : null) ?? canonPlacement(activeMap.id, entityId);
      if (!current) return o;
      const merged: OverrideValue = {
        x: patch.x ?? current.x,
        y: patch.y ?? current.y,
        label: patch.label !== undefined ? patch.label : (current as OverrideValue).label,
        pin: patch.pin !== undefined ? patch.pin : (current as OverrideValue).pin,
      };
      return { ...o, [k]: merged };
    });
  }, [activeMap, canonPlacement]);

  const setCoord = (entityId: string, coord: { x: number; y: number }) => mutateOverride(entityId, coord);
  const setLabel = (entityId: string, label: string | undefined) => mutateOverride(entityId, { label });
  const setPinOverride = (entityId: string, pin: PinOverride | undefined) => mutateOverride(entityId, { pin });
  const nudge = (entityId: string, dx: number, dy: number) => {
    const c = effectiveCoord(entityId);
    if (!c) return;
    mutateOverride(entityId, { x: c.x + dx, y: c.y + dy });
  };
  const removeCoord = (entityId: string) => {
    if (!activeMap) return;
    setOverrides((o) => ({ ...o, [overrideKey(activeMap.id, entityId)]: null }));
  };
  const clearOverride = (entityId: string) => {
    if (!activeMap) return;
    const k = overrideKey(activeMap.id, entityId);
    setOverrides((o) => { const next = { ...o }; delete next[k]; return next; });
  };
  /** Duplicate a placement to another map: writes the same coords as a draft. */
  const duplicateToMap = (entityId: string, targetMapId: string) => {
    setOverrides((o) => {
      const src = effectivePlacement(entityId);
      if (!src) return o;
      return { ...o, [overrideKey(targetMapId, entityId)]: { x: src.x, y: src.y, label: src.label, pin: src.pin } };
    });
    toast.success(`Duplicated to ${project?.maps.find((m) => m.id === targetMapId)?.name ?? targetMapId}`);
  };

  const onMapClick = (lng: number, lat: number) => {
    if (!pendingId || !activeMap) return;
    const x = Math.round(lng);
    const y = Math.round(activeMap.height - lat);
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

  const exportJson = () => {
    if (!project || !activeMap) return;
    const artifact = buildPlacementJson({ project, mapId: activeMap.id, placements: buildDraftPlacements() });
    download(artifact.filename, artifact.content, artifact.mime);
  };

  const [lastExportAt, setLastExportAt] = useState<number | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [mapImportOpen, setMapImportOpen] = useState(false);
  // Per-tab last-export timestamps so each tab header can show its own status.
  const [tabExportAt, setTabExportAt] = useState<Record<string, number>>({});
  const markTabExport = (tab: string) => setTabExportAt((s) => ({ ...s, [tab]: Date.now() }));

  const exportPatch = () => {
    if (!project || !activeMap) return;
    const artifact = buildPlacementPatch({ project, mapId: activeMap.id, placements: buildDraftPlacements() });
    const result = validatePatchYaml(artifact.content, "placement");
    if (!result.ok) {
      toast.error(`Patch validation failed: ${result.errors[0]}`);
      return;
    }
    if (result.warnings.length) toast.warning(result.warnings[0]);
    download(artifact.filename, artifact.content, artifact.mime);
    setLastExportAt(Date.now());
    markTabExport("pins");
  };

  const dirtyCount = Object.keys(overrides).filter((k) => activeMap && k.startsWith(`${activeMap.id}:`)).length;
  const draftStatus = classifyDraftStatus({ dirtyCount, lastExportAt });

  // Project-wide validation, scoped per tab so each tab badge shows its own counts.
  const draftPlacementsForValidation = useMemo(() => buildDraftPlacements(), [buildDraftPlacements]);
  const validation = useMemo(
    () => project && activeMap
      ? validateProject({
          project,
          draftPlacements: draftPlacementsForValidation,
          draftMap: activeMap,
          draftLocalLayers: layerEditor.localLayers,
          lastExportAt,
        })
      : null,
    [project, activeMap, draftPlacementsForValidation, layerEditor.localLayers, lastExportAt]
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
  const entityIssues = issuesByScope((i) => i.code === "invalid-visibility" || i.code === "unknown-entity");


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
      <div className="px-3 py-1.5 text-[11px] bg-primary/10 text-foreground border-b border-primary/20 flex items-center justify-between gap-2">
        <span
          className="flex items-center gap-2 min-w-0"
          title="YAML canon (committed) → local draft (this browser) → exported patch → committed to GitHub → generated runtime atlas.json"
        >
          <DraftStatusBadge status={draftStatus} />
          <span className="truncate">
            <strong>YAML is canon.</strong> Edits here are local drafts — export a patch and commit it to publish.
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
        {project.maps.length > 1 && (
          <Select value={activeMap.id} onValueChange={(v) => { setActiveMapId(v); setPendingId(null); }}>
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
        <span className="text-xs text-muted-foreground hidden md:inline">
          {dirtyCount > 0 ? `${dirtyCount} unsaved on ${activeMap.name}` : "Matches YAML canon"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => { setOverrides({}); toast.info("Cleared overrides"); }} title="Discard local changes">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="default" size="sm" onClick={() => setExportModalOpen(true)} className="gap-1" title="Open the unified export modal">
          <Package className="h-4 w-4" /><span className="hidden md:inline">Export DM Changes</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={exportPatch} className="gap-1" title="Quick: download placements .yaml">
          <FileCode className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={exportJson} className="gap-1" title="Quick: download placements .json">
          <Download className="h-4 w-4" />
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/atlas">View as player →</Link>
        </Button>
      </header>

      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative min-h-0">
          <MapContainer
            crs={FlatCRS}
            center={[activeMap.height / 2, activeMap.width / 2]}
            zoom={-2}
            minZoom={-6}
            maxZoom={4}
            attributionControl={false}
            style={{ width: "100%", height: "100%", background: activeMap.oceanColor ?? "#18313f", cursor: (pendingId || regionDraft.drawing) ? "crosshair" : undefined }}
          >
            <FlyTo target={flyTo} />
            <MapClickCapture onClick={onMapClick} />

            {/* Map base image layers — built-in + locally edited/uploaded. */}
            {showLayers && layerEditor.mergedLayers.map((layer) => (
              <ImageOverlay
                key={layer.id}
                url={normalizeAtlasAssetUrl(layer.src)}
                bounds={[
                  [activeMap.height - (layer.y + layer.height), layer.x],
                  [activeMap.height - layer.y, layer.x + layer.width],
                ] as L.LatLngBoundsLiteral}
                opacity={layer.opacity}
                eventHandlers={{ click: () => layerEditor.setSelectedId(layer.id) }}
                interactive={true}
              />
            ))}

            {/* Z-order: layers → regions → routes → fog → pins → handles. */}
            {showRegions && <RegionLayer map={activeMap} api={regionDraft} visible={showRegions} />}
            <RouteLayer map={activeMap} api={routeDraft} />
            <FogLayer map={activeMap} api={fogDraft} preview={showFogPreview} />

            {placed.map((e) => {
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
                    click: () => setPendingId(null),
                  }}
                />
              );
            })}
            <AtlasMinimap map={activeMap} layers={layerEditor.mergedLayers} />
          </MapContainer>

          {pendingId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs shadow-lg flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5" />
              Click on the map to place "{project.entities.find((e) => e.id === pendingId)?.title}"
              <button className="ml-2 underline" onClick={() => setPendingId(null)}>cancel</button>
            </div>
          )}
        </div>

        <aside className="w-[420px] hidden md:flex flex-col border-l border-border bg-card">
          <Tabs defaultValue="pins" className="flex-1 flex flex-col min-h-0">
            {/* 8-tab Creator Cockpit. Two rows of compact icon-only triggers. */}
            <TabsList className="grid grid-cols-4 mx-3 mt-3 h-auto gap-y-1 p-1">
              <TabsTrigger value="pins" className="gap-1 text-[11px] py-1.5"><PinIcon className="h-3.5 w-3.5" />Pins</TabsTrigger>
              <TabsTrigger value="maps" className="gap-1 text-[11px] py-1.5"><LayersIcon className="h-3.5 w-3.5" />Maps</TabsTrigger>
              <TabsTrigger value="regions" className="gap-1 text-[11px] py-1.5"><Shapes className="h-3.5 w-3.5" />Regions</TabsTrigger>
              <TabsTrigger value="routes" className="gap-1 text-[11px] py-1.5"><RouteIcon className="h-3.5 w-3.5" />Routes</TabsTrigger>
              <TabsTrigger value="fog" className="gap-1 text-[11px] py-1.5"><CloudFog className="h-3.5 w-3.5" />Fog</TabsTrigger>
              <TabsTrigger value="entities" className="gap-1 text-[11px] py-1.5"><BookOpen className="h-3.5 w-3.5" />Entities</TabsTrigger>
              <TabsTrigger value="import" className="gap-1 text-[11px] py-1.5"><FolderOpen className="h-3.5 w-3.5" />Import</TabsTrigger>
              <TabsTrigger value="publish" className="gap-1 text-[11px] py-1.5"><ShieldCheck className="h-3.5 w-3.5" />Publish</TabsTrigger>
            </TabsList>

            <TabsContent value="pins" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              <TabFrame
                title="Pins"
                builtFromYamlCount={project.placements.filter((p) => p.mapId === activeMap.id).length}
                localDraftCount={dirtyCount}
                blockingCount={pinIssues.blocking}
                warningCount={pinIssues.warning}
                lastExportAt={tabExportAt.pins ?? null}
                onExport={exportPatch}
                exportLabel="Export pins"
                exportDisabled={dirtyCount === 0}
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
            </TabsContent>

            <TabsContent value="maps" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              {/* Maps tab combines layers + map settings + batch import — same canon target (world.yaml > maps[]). */}
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
                  />
                </TabsContent>
                <TabsContent value="settings" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
                  {baseMap && <MapSettingsPanel map={activeMap} baseMap={baseMap} onPatch={patchMap} onReset={resetMap} />}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="regions" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              <RegionsTab
                project={project}
                map={activeMap}
                api={regionDraft}
                blockingCount={regionIssues.blocking}
                warningCount={regionIssues.warning}
                lastExportAt={tabExportAt.regions ?? null}
                onExported={() => markTabExport("regions")}
                onFitTo={(r) => {
                  if (!r.points.length) return;
                  const cx = r.points.reduce((s, p) => s + p[0], 0) / r.points.length;
                  const cy = r.points.reduce((s, p) => s + p[1], 0) / r.points.length;
                  setFlyTo({ lat: activeMap.height - cy, lng: cx });
                }}
              />
            </TabsContent>

            <TabsContent value="routes" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              <RoutesTab
                project={project}
                map={activeMap}
                api={routeDraft}
                blockingCount={routeIssues.blocking}
                warningCount={routeIssues.warning}
                lastExportAt={tabExportAt.routes ?? null}
                onExported={() => markTabExport("routes")}
                onFitTo={(pts) => {
                  if (!pts.length) return;
                  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
                  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
                  setFlyTo({ lat: activeMap.height - cy, lng: cx });
                }}
              />
            </TabsContent>

            <TabsContent value="fog" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
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
                lastExportAt={tabExportAt.fog ?? null}
                onExported={() => markTabExport("fog")}
              />
            </TabsContent>

            <TabsContent value="entities" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              <EntitiesTab
                project={project}
                blockingCount={entityIssues.blocking}
                warningCount={entityIssues.warning}
                lastExportAt={tabExportAt.entities ?? null}
                onExported={() => markTabExport("entities")}
              />
            </TabsContent>

            <TabsContent value="import" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              <ImportPanel knownEntityNames={new Set(project.entities.flatMap((e) => [e.id.toLowerCase(), e.title.toLowerCase(), ...e.aliases.map((a) => a.toLowerCase())]))} />
            </TabsContent>

            <TabsContent value="publish" className="flex-1 flex-col min-h-0 m-0 hidden data-[state=active]:flex">
              <PublishCheckTab
                project={project}
                draftMap={activeMap}
                draftPlacements={draftPlacementsForValidation}
                draftLocalLayers={layerEditor.localLayers}
                lastExportAt={lastExportAt}
                onGoToMap={(mid) => { setActiveMapId(mid); toast.info(`Switched to ${project.maps.find((m) => m.id === mid)?.name ?? mid}`); }}
                onGoToEntity={(eid) => {
                  const c = effectiveCoord(eid);
                  if (c && activeMap) setFlyTo({ lat: activeMap.height - c.y, lng: c.x });
                  setFilter(project.entities.find((e) => e.id === eid)?.title ?? "");
                }}
                onExportAll={() => setExportModalOpen(true)}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <style>{`@keyframes atlas-pulse { 0%,100% { filter: drop-shadow(0 0 0 hsl(var(--primary))); } 50% { filter: drop-shadow(0 0 6px hsl(var(--primary))); } }`}</style>
      <ExportChangesModal
        open={exportModalOpen}
        onOpenChange={(o) => { setExportModalOpen(o); if (!o) setLastExportAt(Date.now()); }}
        project={project}
        activeMap={activeMap}
        draftPlacements={buildDraftPlacements()}
        mergedLayers={layerEditor.mergedLayers}
        localLayers={layerEditor.localLayers}
        draftRegions={regionDraft.effective}
        draftRoutes={routeDraft.effective}
        draftFog={fogDraft.fog}
        regionsDirty={regionDraft.dirty}
        routesDirty={routeDraft.dirty}
        fogDirty={fogDraft.dirty}
      />
      <MapImportWizard
        open={mapImportOpen}
        onOpenChange={setMapImportOpen}
        currentMap={activeMap}
        defaultWorldId={activeMap.worldId}
      />
    </div>
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
        <div className="text-[10px] text-muted-foreground truncate">
          {entity.type}{coord ? ` · ${coord.x}, ${coord.y}` : ""}
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
          {onReset && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onReset} title="Discard local edit"><RotateCcw className="h-3.5 w-3.5" /></Button>}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={onRemove} title="Remove placement"><Trash2 className="h-3.5 w-3.5" /></Button>
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

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.success(`Downloaded ${filename}`);
}
