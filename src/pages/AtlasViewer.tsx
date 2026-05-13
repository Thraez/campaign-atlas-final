import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadAtlasContent, loadSearchIndex, type SearchIndexEntry } from "@/atlas/content/loader";
import type { AtlasProject, Entity, MapDocument, MapPlacement } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Search, X, MapPin, ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

// Flat CRS for non-globe world (top-left origin via lat = height - y)
const FlatCRS = L.extend({}, L.CRS.Simple) as L.CRS;

const ICON_BY_TYPE: Record<string, string> = {
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

function pinIcon(color: string, dim = false): L.DivIcon {
  return L.divIcon({
    className: "atlas-viewer-pin",
    html: `<div style="
      width:18px;height:18px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${color};
      border:2px solid #1b1b1bcc;box-shadow:0 2px 6px #0008;
      opacity:${dim ? 0.55 : 1};
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 16],
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

  useEffect(() => {
    Promise.all([loadAtlasContent(true), loadSearchIndex()])
      .then(([project, index]) => {
        setData({ project, index });
        setActiveMapId(project.worlds[0]?.defaultMapId ?? project.maps[0]?.id ?? null);
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
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="font-display text-2xl text-primary">Atlas not built yet</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground">
            Run <code className="px-1.5 py-0.5 rounded bg-muted">npm run atlas:build</code> to generate <code>public/atlas/atlas.json</code>.
          </p>
          <Button asChild variant="secondary"><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back to editor</Link></Button>
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
      <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
        <Link to="/" className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2">
          <Compass className="h-5 w-5" /> <span className="hidden sm:inline">Astrath Atlas</span>
        </Link>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => setSearchOpen(true)} className="gap-2">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">⌘K</kbd>
        </Button>
        <span className="hidden md:block text-[11px] text-muted-foreground ml-2">
          Updated {new Date(data.project.publishedAt).toLocaleDateString()}
        </span>
      </header>

      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative min-h-0">
          <MapContainer
            crs={FlatCRS}
            center={[activeMap.height / 2, activeMap.width / 2]}
            zoom={-2}
            minZoom={-6}
            maxZoom={4}
            zoomControl
            attributionControl={false}
            style={{ width: "100%", height: "100%", background: activeMap.oceanColor ?? "#18313f" }}
          >
            <MapController flyTo={flyTarget} />
            {placementsOnMap.map((p) => {
              const ent = entityById.get(p.entityId);
              if (!ent) return null;
              const color = ICON_BY_TYPE[ent.type] ?? ICON_BY_TYPE.default;
              const dim = ent.visibility === "rumor";
              return (
                <Marker
                  key={p.id}
                  position={[activeMap.height - p.y, p.x]}
                  icon={pinIcon(color, dim)}
                  eventHandlers={{ click: () => openEntity(p.entityId, false) }}
                >
                  <Popup>
                    <div className="text-sm font-medium">{ent.title}</div>
                    {ent.summary && <div className="text-xs opacity-70">{ent.summary}</div>}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

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

interface EntityPanelProps {
  entity: Entity | null;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  onOpenEntity: (id: string) => void;
  onClose: () => void;
  onShowOnMap: (p: MapPlacement) => void;
}

const EntityPanel = (() => {
  const Cmp = (
    { entity, placements, entityById, onOpenEntity, onClose, onShowOnMap }: EntityPanelProps,
    ref: React.Ref<HTMLDivElement>
  ) => {
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
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{entity.type}</div>
            <h2 className="font-display text-xl text-foreground truncate">{entity.title}</h2>
            {entity.aliases.length > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                aka {entity.aliases.join(", ")}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {entity.summary && (
              <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">{entity.summary}</p>
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
              dangerouslySetInnerHTML={{ __html: entity.bodyHtml }}
            />

            {entity.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {entity.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
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
      </div>
    );
  };
  Cmp.displayName = "EntityPanel";
  // forwardRef wrap
  return Object.assign(
    (props: EntityPanelProps & { ref?: React.Ref<HTMLDivElement> }) => Cmp(props, props.ref ?? null),
  );
})() as React.FC<EntityPanelProps & { ref?: React.Ref<HTMLDivElement> }>;

interface SearchProps {
  query: string;
  setQuery: (q: string) => void;
  index: SearchIndexEntry[];
  entityById: Map<string, Entity>;
  placements: MapPlacement[];
  onPick: (id: string, fly: boolean) => void;
  onClose: () => void;
}

function SearchPalette({ query, setQuery, index, placements, onPick, onClose }: SearchProps) {
  const placedIds = useMemo(() => new Set(placements.map((p) => p.entityId)), [placements]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 30);
    const score = (e: SearchIndexEntry): number => {
      let s = 0;
      if (e.title.toLowerCase().includes(q)) s += 10;
      if (e.title.toLowerCase().startsWith(q)) s += 10;
      if (e.aliases.some((a) => a.toLowerCase().includes(q))) s += 6;
      if (e.tags.some((t) => t.toLowerCase().includes(q))) s += 3;
      if ((e.summary ?? "").toLowerCase().includes(q)) s += 2;
      if ((e.excerpt ?? "").toLowerCase().includes(q)) s += 1;
      return s;
    };
    return index
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.e);
  }, [query, index]);

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search places, regions, NPCs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-auto"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No matches.</div>
          ) : (
            results.map((r) => {
              const placed = placedIds.has(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => onPick(r.id, placed)}
                  className="w-full text-left px-3 py-2 hover:bg-accent/40 border-b border-border/50 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.type}</span>
                    {placed && <MapPin className="h-3 w-3 text-primary ml-auto" />}
                  </div>
                  {r.summary && <div className="text-xs text-muted-foreground line-clamp-1">{r.summary}</div>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
