import { useEffect, useMemo, useRef, useState, useCallback, forwardRef } from "react";
import { MapContainer, Marker, Popup, Polygon, Polyline, ImageOverlay, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadAtlasContent, loadSearchIndex, type SearchIndexEntry } from "@/atlas/content/loader";
import type { AtlasProject, Entity, MapDocument, MapPlacement, Point, Route, GridOverlay, MapScale } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  loadNote,
  saveNote,
  deleteNote,
  exportNotesJson,
  importNotesJson,
} from "@/atlas/notes/playerNotes";
import {
  Search, X, MapPin, ArrowLeft, Compass, Eye, EyeOff, Grid3x3, CalendarClock,
  Link2, Check, LayoutGrid, Printer,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AtlasMinimap } from "@/atlas/AtlasMinimap";
import { OfflineMenu, OfflineStatus } from "@/atlas/OfflineStatus";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { printEntityHandout } from "@/atlas/printHandout";
import { isDmToolsEnabled } from "@/atlas/dmTools";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

// Flat CRS for non-globe world (top-left origin via lat = height - y)
const FlatCRS = L.extend({}, L.CRS.Simple) as L.CRS;

import { resolvePinStyle, pinSvg, type PinPreset } from "@/atlas/pins/presets";

function pinIconForStyle(style: PinPreset, opts?: { dim?: boolean }): L.DivIcon {
  return L.divIcon({
    className: "atlas-viewer-pin",
    html: pinSvg({ color: style.color, shape: style.shape }, { dim: opts?.dim }),
    iconSize: [22, 22],
    iconAnchor: [11, 20],
  });
}

function MapController({ flyTo }: { flyTo: { x: number; y: number; height: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!flyTo) return;
    map.flyTo([flyTo.height - flyTo.y, flyTo.x], Math.max(map.getZoom(), -1), { duration: 0.6 });
  }, [flyTo, map]);
  return null;
}

// Build a multi-polygon for fog: outer ring covers the whole map, each
// reveal becomes an inner ring (hole) using Leaflet's array-of-rings format.
function fogPositions(map: MapDocument, reveals: Point[][]): L.LatLngExpression[][] {
  const outer: L.LatLngExpression[] = [
    [0, 0], [0, map.width], [map.height, map.width], [map.height, 0],
  ];
  const holes: L.LatLngExpression[][] = reveals.map((poly) =>
    poly.map(([x, y]) => [map.height - y, x] as [number, number])
  );
  return [outer, ...holes];
}

const ROUTE_MODE_LABEL: Record<string, string> = {
  foot: "on foot", horse: "on horseback", ship: "by ship", cart: "by cart", fly: "flying", custom: "",
};

function routeDistancePx(points: Point[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    d += Math.hypot(dx, dy);
  }
  return d;
}

function formatTravelTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours.toFixed(hours < 4 ? 1 : 0)} h`;
  const days = hours / 24;
  return `${days.toFixed(days < 4 ? 1 : 0)} days`;
}

function gridLines(map: MapDocument, grid: GridOverlay): L.LatLngExpression[][] {
  const lines: L.LatLngExpression[][] = [];
  if (grid.kind === "square") {
    for (let x = 0; x <= map.width; x += grid.size) {
      lines.push([[0, x], [map.height, x]]);
    }
    for (let y = 0; y <= map.height; y += grid.size) {
      lines.push([[y, 0], [y, map.width]]);
    }
    return lines;
  }
  // pointy-top hex grid
  const r = grid.size;
  const w = Math.sqrt(3) * r;
  const h = 2 * r;
  const dy = (3 / 4) * h;
  for (let row = 0, py = 0; py <= map.height + h; row++, py = row * dy) {
    const offset = row % 2 === 0 ? 0 : w / 2;
    for (let px = -offset; px <= map.width + w; px += w) {
      const cx = px + w / 2;
      const cy = py;
      const verts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 2;
        const vx = cx + r * Math.cos(ang);
        const vy = cy + r * Math.sin(ang);
        verts.push([map.height - vy, vx]);
      }
      verts.push(verts[0]);
      lines.push(verts);
    }
  }
  return lines;
}

interface ViewerState {
  project: AtlasProject;
  index: SearchIndexEntry[];
}

export default function AtlasViewer() {
  const [data, setData] = useState<ViewerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ x: number; y: number; height: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [showFog, setShowFog] = useState(true);
  const [showGrid, setShowGrid] = useState<boolean | null>(null); // null = use map default

  useEffect(() => {
    Promise.all([loadAtlasContent(true), loadSearchIndex()])
      .then(([project, index]) => {
        setData({ project, index });
        setActiveMapId(project.worlds[0]?.defaultMapId ?? project.maps[0]?.id ?? null);
        const params = new URLSearchParams(window.location.search);
        const want = params.get("entity");
        if (want) {
          setOpenId(want);
          setMobilePanelOpen(true);
          const placement = project.placements.find((p) => p.entityId === want);
          if (placement) {
            const m = project.maps.find((mm) => mm.id === placement.mapId);
            if (m) {
              setActiveMapId(m.id);
              setFlyTarget({ x: placement.x, y: placement.y, height: m.height });
            }
          }
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const activeMap: MapDocument | undefined = useMemo(
    () => data?.project.maps.find((m) => m.id === activeMapId),
    [data, activeMapId]
  );
  const placementsOnMap: MapPlacement[] = useMemo(
    () => (data && activeMap ? data.project.placements.filter((p) => p.mapId === activeMap.id) : []),
    [data, activeMap]
  );
  const entityById = useMemo(() => {
    const m = new Map<string, Entity>();
    data?.project.entities.forEach((e) => m.set(e.id, e));
    return m;
  }, [data]);

  const openEntity = useCallback(
    (id: string, fly = true) => {
      setOpenId(id);
      setMobilePanelOpen(true);
      if (fly && data && activeMap) {
        const placement = data.project.placements.find((p) => p.entityId === id && p.mapId === activeMap.id);
        if (placement) setFlyTarget({ x: placement.x, y: placement.y, height: activeMap.height });
      }
    },
    [data, activeMap]
  );

  // Intercept wikilink clicks inside rendered HTML
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.atlas-wikilink");
      if (!target) return;
      const id = target.getAttribute("data-entity-id");
      if (!id) return;
      e.preventDefault();
      openEntity(id);
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [openEntity, openId]);

  // Cmd/Ctrl-K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="font-display text-2xl text-primary">
            {offline ? "Atlas not available offline yet" : "Atlas not built yet"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {offline
              ? "Open the atlas once while online to cache it for offline use."
              : error}
          </p>
          {!offline && (
            <p className="text-xs text-muted-foreground">
              Run <code className="px-1.5 py-0.5 rounded bg-muted">npm run atlas:build</code> to generate <code>public/atlas/atlas.json</code>.
            </p>
          )}
          <Button asChild variant="secondary"><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back to home</Link></Button>
        </div>
      </div>
    );
  }

  if (!data || !activeMap) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading atlas…
      </div>
    );
  }

  const openEntity_ = openId ? entityById.get(openId) : null;
  const openPlacements = openEntity_
    ? data.project.placements.filter((p) => p.entityId === openEntity_.id)
    : [];

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <a href="#atlas-main" className="skip-to-main">Skip to map</a>
      <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
        <Link to="/" className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2">
          <Compass className="h-5 w-5" aria-hidden="true" /> <span className="hidden sm:inline">Astrath Atlas</span>
        </Link>
        <div className="flex-1" />
        {data.project.maps.length > 1 && (
          <Select value={activeMap.id} onValueChange={setActiveMapId}>
            <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Choose map"><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.project.maps.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {activeMap.fog?.enabled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFog((v) => !v)}
            title={showFog ? "Hide fog" : "Show fog"}
            aria-label={showFog ? "Hide fog of war" : "Show fog of war"}
            aria-pressed={showFog}
          >
            {showFog ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          </Button>
        )}
        {activeMap.grid && (
          <Button
            variant={(showGrid ?? activeMap.grid.enabled !== false) ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowGrid((v) => !(v ?? activeMap.grid!.enabled !== false))}
            title="Toggle grid"
            aria-label="Toggle grid overlay"
            aria-pressed={showGrid ?? activeMap.grid.enabled !== false}
          >
            <Grid3x3 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setSearchOpen(true)} className="gap-2" aria-label="Search atlas (Ctrl+K)">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">⌘K</kbd>
        </Button>
        <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
          <Link to="/atlas/browse" title="Browse all entries"><LayoutGrid className="h-4 w-4 mr-1" aria-hidden="true" />Browse</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
          <Link to="/atlas/timeline" title="Timeline of dated entries"><CalendarClock className="h-4 w-4 mr-1" aria-hidden="true" />Timeline</Link>
        </Button>
        {__INCLUDE_EDITOR__ && isDmToolsEnabled() && (
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link to="/atlas/edit" title="DM placement editor">Edit pins</Link>
          </Button>
        )}
        <OfflineMenu />
        <span className="hidden md:block text-[11px] text-muted-foreground ml-2">
          Updated {new Date(data.project.publishedAt).toLocaleDateString()}
        </span>
      </header>
      <OfflineStatus />

      <div className="flex-1 flex relative min-h-0">
        <main
          id="atlas-main"
          className="flex-1 relative min-h-0"
          aria-label={`Interactive map: ${activeMap.name}. Use arrow keys to pan, plus and minus to zoom.`}
        >
          <MapContainer
            crs={FlatCRS}
            center={[activeMap.height / 2, activeMap.width / 2]}
            zoom={-2}
            minZoom={-6}
            maxZoom={4}
            zoomControl
            keyboard
            keyboardPanDelta={80}
            attributionControl={false}
            style={{ width: "100%", height: "100%", background: activeMap.oceanColor ?? "#18313f" }}
          >
            <MapController flyTo={flyTarget} />

            {/* Horizontal wrap: render copies at -W, 0, +W when wrapX enabled */}
            {(activeMap.wrapX ? [-activeMap.width, 0, activeMap.width] : [0]).map((dx) => (
              <WrappedWorld
                key={`wrap-${dx}`}
                dx={dx}
                map={activeMap}
                placements={placementsOnMap}
                entityById={entityById}
                showFog={showFog}
                showGrid={showGrid}
                onOpenEntity={openEntity}
              />
            ))}

            {/* (markers, layers, regions, routes, fog, grid handled inside WrappedWorld) */}

            <AtlasMinimap map={activeMap} layers={activeMap.layers} />
          </MapContainer>
        </main>

        {/* Desktop side panel */}
        <aside className="hidden md:flex w-[420px] border-l border-border bg-card flex-col">
          <EntityPanel
            ref={panelRef}
            entity={openEntity_}
            placements={openPlacements}
            entityById={entityById}
            onOpenEntity={openEntity}
            onClose={() => setOpenId(null)}
            onShowOnMap={(p) => {
              setActiveMapId(p.mapId);
              const m = data.project.maps.find((mm) => mm.id === p.mapId);
              if (m) setFlyTarget({ x: p.x, y: p.y, height: m.height });
            }}
          />
        </aside>
      </div>

      {/* Mobile bottom sheet */}
      <Sheet open={mobilePanelOpen && !!openEntity_} onOpenChange={setMobilePanelOpen}>
        <SheetContent side="bottom" className="h-[80vh] p-0 md:hidden">
          <EntityPanel
            ref={panelRef}
            entity={openEntity_}
            placements={openPlacements}
            entityById={entityById}
            onOpenEntity={openEntity}
            onClose={() => setMobilePanelOpen(false)}
            onShowOnMap={(p) => {
              setActiveMapId(p.mapId);
              const m = data.project.maps.find((mm) => mm.id === p.mapId);
              if (m) setFlyTarget({ x: p.x, y: p.y, height: m.height });
              setMobilePanelOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Search palette */}
      {searchOpen && (
        <SearchPalette
          query={query}
          setQuery={setQuery}
          index={data.index}
          entityById={entityById}
          placements={data.project.placements}
          onPick={(id, fly) => {
            setSearchOpen(false);
            setQuery("");
            openEntity(id, fly);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

interface WrappedWorldProps {
  dx: number;
  map: MapDocument;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  showFog: boolean;
  showGrid: boolean | null;
  onOpenEntity: (id: string, fly?: boolean) => void;
}

function WrappedWorld({ dx, map, placements, entityById, showFog, showGrid, onOpenEntity }: WrappedWorldProps) {
  const H = map.height;
  return (
    <>
      {[...map.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => (
        <ImageOverlay
          key={`${layer.id}-${dx}`}
          url={normalizeAtlasAssetUrl(layer.src)}
          bounds={[
            [H - (layer.y + layer.height), layer.x + dx],
            [H - layer.y, layer.x + layer.width + dx],
          ] as L.LatLngBoundsLiteral}
          opacity={layer.opacity}
        />
      ))}

      {(map.regions ?? []).map((region) => {
        const ent = region.entityId ? entityById.get(region.entityId) : undefined;
        const color = region.color ?? (ent ? resolvePinStyle(ent.type).color : "#7fb069");
        const positions = region.points.map(([x, y]) => [H - y, x + dx] as [number, number]);
        return (
          <Polygon
            key={`${region.id}-${dx}`}
            positions={positions}
            pathOptions={{
              color, weight: 1.5, fillColor: color,
              fillOpacity: region.fillOpacity ?? 0.18,
              opacity: region.strokeOpacity ?? 0.85,
            }}
            eventHandlers={region.entityId ? { click: () => onOpenEntity(region.entityId!, false) } : undefined}
          >
            <Popup>
              <div className="text-sm font-medium">{region.name}</div>
              {ent?.summary && <div className="text-xs opacity-70">{ent.summary}</div>}
            </Popup>
          </Polygon>
        );
      })}

      {(map.routes ?? []).map((route) => {
        const pts = (route.resolvedPoints ?? []).map(([x, y]) => [H - y, x + dx] as [number, number]);
        if (pts.length < 2) return null;
        const color = route.color ?? "#cfd6dc";
        const distPx = routeDistancePx(route.resolvedPoints ?? []);
        const scale: MapScale | undefined = map.scale;
        const distLabel = scale ? `${(distPx * scale.unitsPerPixel).toFixed(1)} ${scale.unitLabel}` : `${Math.round(distPx)} px`;
        const travel = scale && route.speed ? formatTravelTime((distPx * scale.unitsPerPixel) / route.speed) : null;
        const modeLabel = route.mode ? ROUTE_MODE_LABEL[route.mode] : "";
        return (
          <Polyline
            key={`${route.id}-${dx}`}
            positions={pts}
            pathOptions={{
              color, weight: route.weight ?? 3, opacity: 0.9,
              dashArray: route.dashed ? "8 6" : undefined,
              lineCap: "round", lineJoin: "round",
            }}
          >
            <Tooltip sticky direction="top" opacity={0.95}>
              <div className="text-xs">
                <div className="font-medium">{route.name}</div>
                <div className="opacity-80">{distLabel}{travel ? ` · ${travel} ${modeLabel}` : ""}</div>
              </div>
            </Tooltip>
          </Polyline>
        );
      })}

      {showFog && map.fog?.enabled && (
        <Polygon
          positions={(() => {
            const outer: L.LatLngExpression[] = [
              [0, dx], [0, map.width + dx], [H, map.width + dx], [H, dx],
            ];
            const holes: L.LatLngExpression[][] = map.fog!.reveals.map((poly) =>
              poly.map(([x, y]) => [H - y, x + dx] as [number, number])
            );
            return [outer, ...holes];
          })()}
          pathOptions={{
            color: "transparent",
            fillColor: map.fog.color ?? "rgba(8,12,20,0.55)",
            fillOpacity: 1, weight: 0, interactive: false, fillRule: "evenodd",
          } as L.PathOptions}
        />
      )}

      {map.grid && (showGrid ?? map.grid.enabled !== false) && gridLines(map, map.grid).map((line, i) => (
        <Polyline
          key={`grid-${dx}-${i}`}
          positions={line.map((p) => {
            const [lat, lng] = p as [number, number];
            return [lat, lng + dx] as [number, number];
          })}
          pathOptions={{
            color: map.grid!.color ?? "rgba(255,255,255,0.08)",
            weight: 1, opacity: 1, interactive: false,
          }}
        />
      ))}

      <PlacementMarkers
        dx={dx}
        H={H}
        placements={placements}
        entityById={entityById}
        onOpenEntity={onOpenEntity}
      />

    </>
  );
}

/** Renders pin markers with preset-derived shape/color, and computes which
 *  labels are permanently visible based on per-pin priority + labelMinZoom +
 *  a screen-space collision pass (higher priority wins). */
function PlacementMarkers({
  dx, H, placements, entityById, onOpenEntity,
}: {
  dx: number; H: number;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  onOpenEntity: (id: string, fly?: boolean) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const h = () => setZoom(map.getZoom());
    map.on("zoomend", h);
    return () => { map.off("zoomend", h); };
  }, [map]);

  // Resolve preset + decide label visibility (permanent / hover / none).
  // Order by priority desc; suppress lower-priority permanent labels that fall
  // within ~70 px of a higher-priority one already shown at this zoom.
  const enriched = placements
    .map((p) => {
      const ent = entityById.get(p.entityId);
      if (!ent) return null;
      const style = resolvePinStyle(ent.type, p.pin as import("@/atlas/pins/presets").PinOverride | undefined);
      return { p, ent, style };
    })
    .filter((x): x is { p: MapPlacement; ent: Entity; style: PinPreset } => !!x)
    .sort((a, b) => b.style.priority - a.style.priority);

  const labelDecisions = new Map<string, "always" | "hover" | "none">();
  const taken: { x: number; y: number }[] = [];
  for (const { p, style } of enriched) {
    let mode: "always" | "hover" | "none";
    if (style.labelMode === "never") mode = "none";
    else if (style.labelMode === "hover") mode = "hover";
    else if (style.labelMode === "always") mode = "always";
    else mode = zoom >= style.labelMinZoom ? "always" : "hover";
    if (mode === "always") {
      const pt = map.latLngToContainerPoint([H - p.y, p.x + dx]);
      const collides = taken.some((t) => Math.hypot(t.x - pt.x, t.y - pt.y) < 70);
      if (collides) mode = "hover";
      else taken.push(pt);
    }
    labelDecisions.set(`${p.id}-${dx}`, mode);
  }

  return (
    <>
      {enriched.map(({ p, ent, style }) => {
        const dim = ent.visibility === "rumor";
        const labelMode = labelDecisions.get(`${p.id}-${dx}`) ?? "none";
        const labelText = p.label ?? ent.title;
        return (
          <Marker
            key={`${p.id}-${dx}`}
            position={[H - p.y, p.x + dx]}
            icon={pinIconForStyle(style, { dim })}
            eventHandlers={{ click: () => onOpenEntity(p.entityId, false) }}
          >
            {labelMode !== "none" && (
              <Tooltip
                permanent={labelMode === "always"}
                direction="top"
                offset={[0, -12]}
                opacity={dim ? 0.7 : 0.95}
                className={`atlas-pin-label atlas-pin-label--${ent.visibility}`}
              >
                {labelText}
              </Tooltip>
            )}
            <Popup>
              <div className="text-sm font-medium">{ent.title}</div>
              {ent.summary && <div className="text-xs opacity-70">{ent.summary}</div>}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

interface EntityPanelProps {
  entity: Entity | null;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  onOpenEntity: (id: string) => void;
  onClose: () => void;
  onShowOnMap: (p: MapPlacement) => void;
}

function CopyLinkButton({ entityId }: { entityId: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(async () => {
    try {
      const base = window.location.origin + (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
      await navigator.clipboard.writeText(`${base}/atlas?entity=${encodeURIComponent(entityId)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [entityId]);
  return (
    <Button variant="ghost" size="icon" onClick={handle} title="Copy share link">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
    </Button>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "just now";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(t).toLocaleDateString();
}

function NotesPanel({ entityId, entityTitle }: { entityId: string; entityTitle: string }) {
  const initial = useMemo(() => loadNote(entityId), [entityId]);
  const [text, setText] = useState(initial?.text ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [open, setOpen] = useState(!!initial?.text);
  const debounceRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Reset state when the user navigates to a different entity.
  useEffect(() => {
    const fresh = loadNote(entityId);
    setText(fresh?.text ?? "");
    setSavedAt(fresh?.updatedAt ?? null);
    setOpen(!!fresh?.text);
  }, [entityId]);

  // Debounced autosave.
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveNote(entityId, text);
      if (text === "") {
        setSavedAt(null);
      } else {
        setSavedAt(new Date().toISOString());
      }
    }, 800) as unknown as number;
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [entityId, text]);

  const handleClear = useCallback(() => {
    if (text && !window.confirm(`Delete your note for "${entityTitle}"? This cannot be undone.`)) return;
    setText("");
    deleteNote(entityId);
    setSavedAt(null);
  }, [entityId, entityTitle, text]);

  const handleExport = useCallback(() => {
    const json = exportNotesJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-player-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = importNotesJson(String(reader.result ?? ""));
      if (result.imported > 0) {
        toast.success(`Imported ${result.imported} note(s)`);
        const fresh = loadNote(entityId);
        setText(fresh?.text ?? "");
        setSavedAt(fresh?.updatedAt ?? null);
      } else if (result.errors.length > 0) {
        toast.error(`Import failed: ${result.errors[0]}`);
      } else {
        toast.message("No notes to import");
      }
    };
    reader.readAsText(file);
  }, [entityId]);

  return (
    <div className="pt-3 border-t border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>My notes {savedAt && <span className="normal-case text-[10px] text-muted-foreground/70 ml-1">— saved {formatRelative(savedAt)}</span>}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Private notes for this entry. Stored only in your browser."
            rows={6}
            className="text-sm"
            aria-label={`Private notes for ${entityTitle}`}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-muted-foreground">
              Stored locally in this browser. Never uploaded.
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={handleExport} title="Export all your notes as JSON">
                Export
              </Button>
              <Button size="sm" variant="ghost" onClick={() => importInputRef.current?.click()} title="Import notes from JSON">
                Import
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }}
              />
              {text.length > 0 && (
                <Button size="sm" variant="ghost" onClick={handleClear} title="Clear this note">
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EntityPanel = forwardRef<HTMLDivElement, EntityPanelProps>(function EntityPanel(
  { entity, placements, onOpenEntity, onClose, onShowOnMap },
  ref
) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!entity) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <MapPin className="h-6 w-6 mx-auto opacity-50" />
          <p>Select a pin or search for a place to read its lore.</p>
        </div>
      </div>
    );
  }

  const imageUrl = (src: string) => normalizeAtlasAssetUrl(src);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{entity.type}</div>
          <h2 className="font-display text-xl text-foreground truncate">{entity.title}</h2>
          {entity.aliases.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">aka {entity.aliases.join(", ")}</div>
          )}
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => printEntityHandout(entity)}
            title="Download as printable handout (PDF)"
            aria-label="Download handout as PDF"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
          </Button>
          <CopyLinkButton entityId={entity.id} />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel"><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {entity.summary && (
            <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">{entity.summary}</p>
          )}

          {entity.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {entity.images.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  onClick={() => setLightboxSrc(imageUrl(src))}
                  className="flex-shrink-0 rounded border border-border overflow-hidden hover:border-primary transition focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <img
                    src={imageUrl(src)}
                    alt={`${entity.title} image ${i + 1}`}
                    className="h-24 w-24 object-cover block"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </button>
              ))}
            </div>
          )}

          {placements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {placements.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" className="gap-1" onClick={() => onShowOnMap(p)}>
                  <MapPin className="h-3.5 w-3.5" /> Show on map
                </Button>
              ))}
            </div>
          )}

          <div
            ref={ref}
            className="atlas-prose prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(entity.bodyHtml) }}
          />

          <NotesPanel entityId={entity.id} entityTitle={entity.title} />

          {entity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {entity.tags.map((t) => (
                <Link key={t} to={`/atlas/tag/${encodeURIComponent(t)}`}>
                  <Badge variant="outline" className="hover:bg-accent cursor-pointer">#{t}</Badge>
                </Link>
              ))}
            </div>
          )}

          {entity.backlinks.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Mentioned in</div>
              <div className="flex flex-wrap gap-1.5">
                {entity.backlinks.map((b) => (
                  <button
                    key={b.id}
                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-accent transition"
                    onClick={() => onOpenEntity(b.id)}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Lightbox */}
      <Dialog open={!!lightboxSrc} onOpenChange={(open) => !open && setLightboxSrc(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/90 border-none overflow-hidden">
          <DialogTitle className="sr-only">{entity.title} image</DialogTitle>
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt={`${entity.title}`}
              className="max-w-full max-h-[85vh] object-contain mx-auto"
              onClick={() => setLightboxSrc(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

interface SearchProps {
  query: string;
  setQuery: (q: string) => void;
  index: SearchIndexEntry[];
  entityById: Map<string, Entity>;
  placements: MapPlacement[];
  onPick: (id: string, fly: boolean) => void;
  onClose: () => void;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
}

// Build a 140-char snippet around the first match of `q` in `body`.
function snippet(body: string | undefined, q: string): string | null {
  if (!body || !q) return null;
  const lower = body;
  const idx = lower.indexOf(q);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 50);
  const end = Math.min(body.length, idx + q.length + 90);
  const slice = (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return escapeHtml(slice).replace(re, (m) => `<mark class="bg-primary/30 text-foreground rounded-sm px-0.5">${escapeHtml(m)}</mark>`);
}

function SearchPalette({ query, setQuery, index, placements, onPick, onClose }: SearchProps) {
  const placedIds = useMemo(() => new Set(placements.map((p) => p.entityId)), [placements]);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const allTypes = useMemo(() => {
    const m = new Map<string, number>();
    index.forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [index]);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    index.forEach((e) => e.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [index]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = index;
    if (activeType) pool = pool.filter((e) => e.type === activeType);
    if (activeTag) pool = pool.filter((e) => e.tags.includes(activeTag));
    if (!q) return pool.slice(0, 40).map((e) => ({ e, snip: null as string | null }));

    const score = (e: SearchIndexEntry): number => {
      let s = 0;
      const t = e.title.toLowerCase();
      if (t === q) s += 30;
      if (t.startsWith(q)) s += 14;
      if (t.includes(q)) s += 10;
      if (e.aliases.some((a) => a.toLowerCase().includes(q))) s += 6;
      if (e.tags.some((tt) => tt.toLowerCase().includes(q))) s += 3;
      if ((e.summary ?? "").toLowerCase().includes(q)) s += 2;
      if ((e.body ?? "").includes(q)) s += 1;
      return s;
    };
    return pool
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map(({ e }) => ({ e, snip: snippet(e.body, q) }));
  }, [query, index, activeType, activeTag]);

  // Reset selection when filters or query change.
  useEffect(() => {
    setActiveIndex(-1);
  }, [query, activeType, activeTag]);

  // Scroll active item into view.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const r = results[idx];
      if (r) onPick(r.e.id, placedIds.has(r.e.id));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search titles, lore body, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-auto"
          />
          <Link to="/atlas/timeline" onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap">
            Timeline →
          </Link>
        </div>

        {(allTypes.length > 1 || allTags.length > 0) && (
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border/50 bg-muted/20">
            <button
              onClick={() => setActiveType(null)}
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${activeType === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            >
              all
            </button>
            {allTypes.map(([t, n]) => (
              <button
                key={t}
                onClick={() => setActiveType(activeType === t ? null : t)}
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${activeType === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
              >
                {t} <span className="opacity-60">{n}</span>
              </button>
            ))}
            {allTags.length > 0 && <span className="w-full h-0" />}
            {allTags.map(([t, n]) => (
              <button
                key={t}
                onClick={() => setActiveTag(activeTag === t ? null : t)}
                className={`text-[10px] px-2 py-0.5 rounded ${activeTag === t ? "bg-secondary text-secondary-foreground" : "bg-muted/60 hover:bg-accent"}`}
              >
                #{t} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No matches.</div>
          ) : (
            results.map(({ e: r, snip }, i) => {
              const placed = placedIds.has(r.id);
              const active = i === activeIndex;
              return (
                <button
                  key={r.id}
                  data-index={i}
                  onClick={() => onPick(r.id, placed)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-3 py-2 border-b border-border/50 last:border-b-0 ${
                    active ? "bg-accent/60" : "hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.type}</span>
                    {r.dateRaw && <span className="text-[10px] text-muted-foreground">· {r.dateRaw}</span>}
                    {placed && <MapPin className="h-3 w-3 text-primary ml-auto" />}
                  </div>
                  {snip ? (
                    <div
                      className="text-xs text-muted-foreground line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(snip) }}
                    />
                  ) : (
                    r.summary && <div className="text-xs text-muted-foreground line-clamp-1">{r.summary}</div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
