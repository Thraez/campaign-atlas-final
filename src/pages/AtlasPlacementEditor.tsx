import { useEffect, useMemo, useState, useCallback } from "react";
import { MapContainer, Marker, Polygon, ImageOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, Crosshair, Download, RotateCcw, MapPin, Target, Trash2, FileCode } from "lucide-react";
import { toast } from "sonner";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity, MapDocument } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  const activeMap: MapDocument | undefined = useMemo(
    () => project?.maps.find((m) => m.id === activeMapId),
    [project, activeMapId]
  );

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

  const exportJson = () => {
    if (!project || !activeMap) return;
    const merged: Array<{ entityId: string; sourcePath: string; mapId: string; x: number; y: number }> = [];
    for (const e of project.entities) {
      const c = effectiveCoord(e.id);
      if (!c) continue;
      merged.push({ entityId: e.id, sourcePath: e.sourcePath, mapId: activeMap.id, x: c.x, y: c.y });
    }
    download(`placements-${activeMap.id}.json`, JSON.stringify(merged, null, 2), "application/json");
  };

  const exportPatch = () => {
    if (!project || !activeMap) return;
    const lines: string[] = [
      `# Placement patch — ${activeMap.name}`,
      "",
      "Paste each snippet into the corresponding entity's frontmatter, under `atlas:`.",
      "Or run: `npm run atlas:apply-placements -- placements.json`",
      "",
    ];
    for (const e of project.entities) {
      const c = effectiveCoord(e.id);
      if (!c) continue;
      lines.push(`## ${e.title}  \`${e.sourcePath || e.id}\``);
      lines.push("```yaml");
      lines.push("atlas:");
      lines.push(`  x: ${c.x}`);
      lines.push(`  y: ${c.y}`);
      lines.push("```");
      lines.push("");
    }
    download(`placements-patch-${activeMap.id}.md`, lines.join("\n"), "text/markdown");
  };

  const dirtyCount = Object.keys(overrides).filter((k) => activeMap && k.startsWith(`${activeMap.id}:`)).length;

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
      <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
        <Link to="/" className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2">
          <Compass className="h-5 w-5" /> <span className="hidden sm:inline">Placement Editor</span>
        </Link>
        <Badge variant="outline" className="ml-2 hidden sm:inline-flex">DM only</Badge>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground hidden md:inline">
          {dirtyCount > 0 ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}` : "All saved to JSON ↓"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => { setOverrides({}); toast.info("Cleared overrides"); }} title="Discard local changes">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={exportPatch} className="gap-1">
          <FileCode className="h-4 w-4" /><span className="hidden md:inline">Patch.md</span>
        </Button>
        <Button variant="default" size="sm" onClick={exportJson} className="gap-1">
          <Download className="h-4 w-4" /><span className="hidden md:inline">placements.json</span>
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
          </MapContainer>

          {pendingId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs shadow-lg flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5" />
              Click on the map to place "{project.entities.find((e) => e.id === pendingId)?.title}"
              <button className="ml-2 underline" onClick={() => setPendingId(null)}>cancel</button>
            </div>
          )}
        </div>

        <aside className="w-[360px] hidden md:flex flex-col border-l border-border bg-card">
          <div className="p-3 border-b border-border">
            <Input placeholder="Filter entities…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ScrollArea className="flex-1">
            <Section title={`Unplaced (${unplaced.length})`}>
              {unplaced.map((e) => (
                <EntityRow
                  key={e.id}
                  entity={e}
                  state="unplaced"
                  isPending={pendingId === e.id}
                  onPlace={() => setPendingId(e.id)}
                />
              ))}
              {unplaced.length === 0 && <Empty text="All entities have a coordinate." />}
            </Section>
            <Section title={`Placed (${placed.length})`}>
              {placed.map((e) => {
                const c = effectiveCoord(e.id)!;
                const overridden = e.id in overrides;
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
          </ScrollArea>
        </aside>
      </div>
      <style>{`@keyframes atlas-pulse { 0%,100% { filter: drop-shadow(0 0 0 hsl(var(--primary))); } 50% { filter: drop-shadow(0 0 6px hsl(var(--primary))); } }`}</style>
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
