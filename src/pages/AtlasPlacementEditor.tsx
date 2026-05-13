import { useEffect, useMemo, useState, useCallback } from "react";
import { MapContainer, Marker, Polygon, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, Crosshair, Download, RotateCcw, MapPin, Target, Trash2, FileCode, Layers as LayersIcon, MapPin as PinIcon, Settings2, Package, FolderOpen, Shapes, Route as RouteIcon, CloudFog, BookOpen, ShieldCheck } from "lucide-react";
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

const FlatCRS = L.extend({}, L.CRS.Simple) as L.CRS;
// Bumped to v2: storage shape changed from { [entityId]: Override } to
// { [`${mapId}:${entityId}`]: Override } so one entity can be placed on
// multiple maps independently.
const STORAGE_KEY = "atlas-placement-overrides-v2";
const LEGACY_STORAGE_KEY = "atlas-placement-overrides-v1";

type Override = { x: number; y: number } | null; // null = explicitly removed

interface Overrides {
  [mapEntityKey: string]: Override; // key = `${mapId}:${entityId}`
}

const overrideKey = (mapId: string, entityId: string) => `${mapId}:${entityId}`;

function pinIcon(color: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: "atlas-edit-pin",
    html: `<div style="
      width:20px;height:20px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${color};
      border:2px solid #0a0a0acc;box-shadow:0 2px 8px #000a;
      ${pulse ? "animation: atlas-pulse 1.2s ease-in-out infinite;" : ""}
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 18],
  });
}

const TYPE_COLOR: Record<string, string> = {
  settlement: "#f4c95d",
  capital: "#f0a830",
  region: "#7fb069",
  ruin: "#b07d62",
  dungeon: "#8e5cd9",
  npc: "#5cb8d9",
  faction: "#d95c8e",
  mystery: "#a070ff",
  default: "#cfd6dc",
};

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
      const v2 = localStorage.getItem(STORAGE_KEY);
      if (v2) return JSON.parse(v2);
      // One-time migration from v1 (entityId-keyed) using a single-map assumption.
      const v1raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!v1raw) return {};
      const v1 = JSON.parse(v1raw) as Record<string, Override>;
      const migrated: Overrides = {};
      // We don't yet know the mapId here — defer until project loads.
      // Stash under a sentinel; resolved on project load.
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
        if (migrated) localStorage.removeItem(LEGACY_STORAGE_KEY);
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

  // Resolve effective coords for an entity on the active map: per-map override
  // wins, else first existing placement on activeMap.
  const effectiveCoord = useCallback((entityId: string): { x: number; y: number } | null => {
    if (!activeMap) return null;
    const k = overrideKey(activeMap.id, entityId);
    if (k in overrides) return overrides[k];
    if (!project) return null;
    const p = project.placements.find((pl) => pl.entityId === entityId && pl.mapId === activeMap.id);
    return p ? { x: p.x, y: p.y } : null;
  }, [overrides, project, activeMap]);

  const entitiesForWorld = useMemo(() => {
    if (!project || !activeMap) return [] as Entity[];
    const worldId = project.maps.find((m) => m.id === activeMap.id)?.worldId;
    return project.entities.filter((e) => !e.world || e.world === worldId);
  }, [project, activeMap]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entitiesForWorld;
    return entitiesForWorld.filter((e) =>
      e.title.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [entitiesForWorld, filter]);

  const placed = filtered.filter((e) => effectiveCoord(e.id));
  const unplaced = filtered.filter((e) => !effectiveCoord(e.id));

  const setCoord = (entityId: string, coord: { x: number; y: number }) => {
    if (!activeMap) return;
    setOverrides((o) => ({ ...o, [overrideKey(activeMap.id, entityId)]: coord }));
  };
  const removeCoord = (entityId: string) => {
    if (!activeMap) return;
    setOverrides((o) => ({ ...o, [overrideKey(activeMap.id, entityId)]: null }));
  };
  const clearOverride = (entityId: string) => {
    if (!activeMap) return;
    const k = overrideKey(activeMap.id, entityId);
    setOverrides((o) => {
      const next = { ...o };
      delete next[k];
      return next;
    });
  };

  const onMapClick = (lng: number, lat: number) => {
    if (!pendingId || !activeMap) return;
    const x = Math.round(lng);
    const y = Math.round(activeMap.height - lat);
    setCoord(pendingId, { x, y });
    toast.success(`Placed "${project?.entities.find((e) => e.id === pendingId)?.title}" at ${x},${y} on ${activeMap.name}`);
    setPendingId(null);
  };

  const goTo = (entityId: string) => {
    const c = effectiveCoord(entityId);
    if (!c || !activeMap) return;
    setFlyTo({ lat: activeMap.height - c.y, lng: c.x });
  };

  /** Build current draft placements (effective coords for every entity on activeMap). */
  const buildDraftPlacements = useCallback(() => {
    if (!project || !activeMap) return [];
    const out: PlacementOverride[] = [];
    for (const e of project.entities) {
      const c = effectiveCoord(e.id);
      if (c) out.push({ entityId: e.id, mapId: activeMap.id, x: c.x, y: c.y });
    }
    return out;
  }, [project, activeMap, effectiveCoord]);

  const exportJson = () => {
    if (!project || !activeMap) return;
    const artifact = buildPlacementJson({ project, mapId: activeMap.id, placements: buildDraftPlacements() });
    download(artifact.filename, artifact.content, artifact.mime);
  };

  const [lastExportAt, setLastExportAt] = useState<number | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
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
  const pinIssues = issuesByScope((i) => i.code.includes("placement") || i.code === "out-of-bounds" || i.code === "invalid-coord");
  const mapIssues = issuesByScope((i) => i.code === "duplicate-layer-id" || i.code === "empty-map" || i.code === "missing-asset");
  const regionIssues = issuesByScope((i) => i.code.includes("region") || i.code === "spoiler-leak");
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
            style={{ width: "100%", height: "100%", background: activeMap.oceanColor ?? "#18313f", cursor: pendingId ? "crosshair" : undefined }}
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

            {/* Region polygons rendered lightly so they don't dominate the editor */}
            {showRegions && (activeMap.regions ?? []).map((region) => {
              const positions = region.points.map(([x, y]) => [activeMap.height - y, x] as [number, number]);
              const color = region.color ?? "#7fb069";
              return (
                <Polygon
                  key={region.id}
                  positions={positions}
                  pathOptions={{
                    color,
                    weight: 1,
                    fillColor: color,
                    fillOpacity: 0.08,
                    opacity: 0.5,
                    interactive: false,
                  }}
                />
              );
            })}

            {placed.map((e) => {
              const c = effectiveCoord(e.id)!;
              const color = TYPE_COLOR[e.type] ?? TYPE_COLOR.default;
              return (
                <Marker
                  key={e.id}
                  position={[activeMap.height - c.y, c.x]}
                  icon={pinIcon(color, pendingId === e.id)}
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

            <TabsContent value="pins" className="flex-1 flex flex-col min-h-0 m-0">
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
                <div className="-m-3">
                  <div className="p-3 border-b border-border">
                    <Input placeholder="Filter entities…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  </div>
                  <Section title={`Unplaced (${unplaced.length})`}>
                    {unplaced.map((e) => (
                      <EntityRow key={e.id} entity={e} state="unplaced" isPending={pendingId === e.id} onPlace={() => setPendingId(e.id)} />
                    ))}
                    {unplaced.length === 0 && <Empty text="All entities have a coordinate." />}
                  </Section>
                  <Section title={`Placed (${placed.length})`}>
                    {placed.map((e) => {
                      const c = effectiveCoord(e.id)!;
                      const overridden = overrideKey(activeMap.id, e.id) in overrides;
                      return (
                        <EntityRow
                          key={e.id}
                          entity={e}
                          state="placed"
                          coord={c}
                          overridden={overridden}
                          isPending={pendingId === e.id}
                          onGoTo={() => goTo(e.id)}
                          onMove={() => setPendingId(e.id)}
                          onRemove={() => removeCoord(e.id)}
                          onReset={overridden ? () => clearOverride(e.id) : undefined}
                        />
                      );
                    })}
                    {placed.length === 0 && <Empty text="Pick something on the left to place." />}
                  </Section>
                </div>
              </TabFrame>
            </TabsContent>

            <TabsContent value="maps" className="flex-1 flex flex-col min-h-0 m-0">
              {/* Maps tab combines layers + map settings — same canon target (world.yaml > maps[]). */}
              <Tabs defaultValue="layers" className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-3 mt-2 grid grid-cols-2">
                  <TabsTrigger value="layers" className="text-[11px]"><LayersIcon className="h-3.5 w-3.5 mr-1" />Layers</TabsTrigger>
                  <TabsTrigger value="settings" className="text-[11px]"><Settings2 className="h-3.5 w-3.5 mr-1" />Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="layers" className="flex-1 flex flex-col min-h-0 m-0">
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
                <TabsContent value="settings" className="flex-1 flex flex-col min-h-0 m-0">
                  {baseMap && <MapSettingsPanel map={activeMap} baseMap={baseMap} onPatch={patchMap} onReset={resetMap} />}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="regions" className="flex-1 flex flex-col min-h-0 m-0">
              <RegionsTab
                project={project}
                map={activeMap}
                blockingCount={regionIssues.blocking}
                warningCount={regionIssues.warning}
                lastExportAt={tabExportAt.regions ?? null}
                onExported={() => markTabExport("regions")}
              />
            </TabsContent>

            <TabsContent value="routes" className="flex-1 flex flex-col min-h-0 m-0">
              <RoutesTab
                project={project}
                map={activeMap}
                blockingCount={routeIssues.blocking}
                warningCount={routeIssues.warning}
                lastExportAt={tabExportAt.routes ?? null}
                onExported={() => markTabExport("routes")}
              />
            </TabsContent>

            <TabsContent value="fog" className="flex-1 flex flex-col min-h-0 m-0">
              <FogTab
                map={activeMap}
                blockingCount={mapIssues.blocking}
                warningCount={mapIssues.warning}
                lastExportAt={tabExportAt.fog ?? null}
                onExported={() => markTabExport("fog")}
              />
            </TabsContent>

            <TabsContent value="entities" className="flex-1 flex flex-col min-h-0 m-0">
              <EntitiesTab
                project={project}
                blockingCount={entityIssues.blocking}
                warningCount={entityIssues.warning}
                lastExportAt={tabExportAt.entities ?? null}
                onExported={() => markTabExport("entities")}
              />
            </TabsContent>

            <TabsContent value="import" className="flex-1 flex flex-col min-h-0 m-0">
              <ImportPanel knownEntityNames={new Set(project.entities.flatMap((e) => [e.id.toLowerCase(), e.title.toLowerCase(), ...e.aliases.map((a) => a.toLowerCase())]))} />
            </TabsContent>

            <TabsContent value="publish" className="flex-1 flex flex-col min-h-0 m-0">
              <PublishCheckTab
                project={project}
                draftMap={activeMap}
                draftPlacements={draftPlacementsForValidation}
                draftLocalLayers={layerEditor.localLayers}
                lastExportAt={lastExportAt}
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
  onPlace?: () => void;
  onMove?: () => void;
  onGoTo?: () => void;
  onRemove?: () => void;
  onReset?: () => void;
}

function EntityRow({ entity, state, coord, overridden, isPending, onPlace, onMove, onGoTo, onRemove, onReset }: RowProps) {
  const color = TYPE_COLOR[entity.type] ?? TYPE_COLOR.default;
  return (
    <div className={`group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40 ${isPending ? "ring-1 ring-primary bg-accent/30" : ""}`}>
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-1.5">
          {entity.title}
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
      {state === "placed" && (
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onGoTo} title="Fly to"><Target className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onMove} title="Re-place"><MapPin className="h-3.5 w-3.5" /></Button>
          {onReset && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onReset} title="Discard local edit"><RotateCcw className="h-3.5 w-3.5" /></Button>}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={onRemove} title="Remove placement"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
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
