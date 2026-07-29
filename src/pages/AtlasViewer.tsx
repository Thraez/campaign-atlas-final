import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type MutableRefObject } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polygon,
  Polyline,
  ImageOverlay,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadAtlasContent, loadSearchIndex, type SearchIndexEntry } from "@/atlas/content/loader";
import { AtlasLoadState } from "@/atlas/content/AtlasLoadState";
import { logger } from "@/lib/logger";
import type {
  AtlasProject,
  Entity,
  MapDocument,
  MapPlacement,
  Point,
  GridOverlay,
  MapScale,
} from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Search,
  ArrowLeft,
  Compass,
  Grid3x3,
  CalendarClock,
  LayoutGrid,
  Ruler,
  Star,
  KeyRound,
  Maximize2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AtlasMinimap } from "@/atlas/AtlasMinimap";
import { OceanBackground } from "@/atlas/ocean/OceanBackground";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundscapeLayer } from "@/atlas/sound/SoundscapeLayer";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { OfflineMenu, OfflineStatus } from "@/atlas/OfflineStatus";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { isDmToolsEnabled } from "@/atlas/dmTools";
import { SearchPalette } from "@/atlas/search/SearchPalette";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { MapCreditOverlay } from "@/atlas/map/MapCreditOverlay";
import { useHasDesktopAside } from "@/hooks/use-has-desktop-aside";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RulerLayer } from "@/atlas/ruler/RulerLayer";
import { ScaleBarController, type ScaleBarState } from "@/atlas/scale/ScaleBar";
import { serializeDeepLink, parseDeepLink } from "@/atlas/deepLink";
import {
  ROUTE_MODE_LABEL,
  routeDistancePx,
  formatTravelTime,
  gridLines,
} from "@/atlas/map/geometry";
import { atlasToLatLng } from "@/atlas/map/coords";
import { useVisitedPlaces } from "@/atlas/visited/useVisitedPlaces";
import { pinDiscoveryClass } from "@/atlas/wander/pinDiscoveryClass";
import { selectWanderTarget } from "@/atlas/wander/selectWanderTarget";
import { discoveryMeter } from "@/atlas/wander/discoveryMeter";
import { WanderControl } from "@/atlas/wander/WanderControl";
import { createPortal } from "react-dom";
import { HoverPeekCard } from "@/atlas/peek/HoverPeekCard";
import { usePeekController } from "@/atlas/peek/usePeekController";
import { resolvePeekEntityId } from "@/atlas/peek/resolvePeekEntityId";
import { playerTypeLabel } from "@/atlas/content/typeLabel";

// Flat CRS for non-globe world (top-left origin via lat = height - y)
const FlatCRS = L.extend({}, L.CRS.Simple) as L.CRS;

import { resolvePinStyle, pinSvg, type PinPreset } from "@/atlas/pins/presets";
import { shouldShowLabel } from "@/atlas/pins/labelVisibility";

function pinIconForStyle(
  style: PinPreset,
  opts?: { dim?: boolean; extraClass?: string; ariaLabel?: string },
): L.DivIcon {
  // iconSize defines the hit area Leaflet uses for click/touch dispatch. The
  // visual SVG is smaller (~22px) but we expose a 44x44 hit area so mobile
  // touch targets meet WCAG 2.5.5 (Target Size, Level AAA). The SVG centers
  // visually inside the box via the `atlas-viewer-pin` CSS rule.
  const cls = opts?.extraClass ? `atlas-viewer-pin ${opts.extraClass}` : "atlas-viewer-pin";
  const svgHtml = pinSvg({ color: style.color, shape: style.shape }, { dim: opts?.dim });
  // Inject role + aria-label into the SVG so screen readers announce the pin name.
  const html = opts?.ariaLabel
    ? svgHtml.replace(
        "<svg ",
        `<svg role="img" aria-label="${opts.ariaLabel.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" `,
      )
    : svgHtml;
  return L.divIcon({
    className: cls,
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 36],
  });
}

function MapController({
  flyTo,
}: {
  flyTo: { x: number; y: number; height: number; zoom?: number } | null;
}) {
  const map = useMap();
  const prefersReducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (!flyTo) return;
    const [lat, lng] = atlasToLatLng(flyTo.x, flyTo.y, flyTo.height);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const targetZoom =
      flyTo.zoom != null && Number.isFinite(flyTo.zoom) ? flyTo.zoom : Math.max(map.getZoom(), -1);
    if (prefersReducedMotion) {
      map.setView([lat, lng], targetZoom, { animate: false });
    } else {
      map.flyTo([lat, lng], targetZoom, { duration: 0.6 });
    }
  }, [flyTo, map, prefersReducedMotion]);
  return null;
}

function ViewSyncController({
  mapId,
  mapHeight,
  onViewChange,
}: {
  mapId: string;
  mapHeight: number;
  onViewChange: (cx: number, cy: number, cz: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const c = map.getCenter();
      onViewChange(c.lng, mapHeight - c.lat, map.getZoom());
    };
    map.on("moveend", update);
    map.on("zoomend", update);
    return () => {
      map.off("moveend", update);
      map.off("zoomend", update);
    };
  }, [map, mapId, mapHeight, onViewChange]);
  return null;
}

function FitBoundsController({
  mapId,
  mapWidth,
  mapHeight,
  flyTarget,
  fitRef,
}: {
  mapId: string;
  mapWidth: number;
  mapHeight: number;
  flyTarget: { x: number; y: number; height: number; zoom?: number } | null;
  fitRef: MutableRefObject<(() => void) | null>;
}) {
  const map = useMap();
  const seenMapIdRef = useRef<string | null>(null);

  // Keep the reset-view callback current after every render in which deps change
  useLayoutEffect(() => {
    fitRef.current = () => {
      map.fitBounds([[0, 0], [mapHeight, mapWidth]], { animate: true, duration: 0.5 });
    };
    return () => {
      fitRef.current = null;
    };
  }, [map, mapHeight, mapWidth, fitRef]);

  useEffect(() => {
    if (seenMapIdRef.current === mapId) return;
    seenMapIdRef.current = mapId;
    if (flyTarget !== null) return; // fly already pending; MapController handles it
    map.fitBounds([[0, 0], [mapHeight, mapWidth]], { animate: false });
  }, [mapId, mapWidth, mapHeight, flyTarget, map]);

  return null;
}

function MaxBoundsController({
  mapId,
  mapWidth,
  mapHeight,
  wrapX,
}: {
  mapId: string;
  mapWidth: number;
  mapHeight: number;
  wrapX?: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (wrapX) {
      // Horizontal scrolling is intentional on wrap maps; clear any bounds.
      map.setMaxBounds(undefined);
      return;
    }
    const pad = Math.max(mapWidth, mapHeight) * 0.1;
    map.options.maxBoundsViscosity = 0.75;
    map.setMaxBounds([
      [-pad, -pad],
      [mapHeight + pad, mapWidth + pad],
    ]);
  }, [mapId, mapWidth, mapHeight, wrapX, map]);
  return null;
}

interface ViewerState {
  project: AtlasProject;
}

export default function AtlasViewer() {
  const [data, setData] = useState<ViewerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{
    x: number;
    y: number;
    height: number;
    zoom?: number;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Search index is deliberately NOT part of the initial load — it's fetched
  // lazily on first search-open so players who never search never pay for it.
  // The ref dedupes: once a fetch has started, later opens reuse its result
  // (or, while in flight, await the same promise) instead of re-fetching.
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[] | null>(null);
  const searchIndexRequestRef = useRef<Promise<void> | null>(null);
  // The bottom sheet renders the entity panel at *every* viewport below the
  // desktop-aside breakpoint (1024px) — not just mobile. Otherwise tablets
  // sit in a dead zone where neither the aside nor the sheet is mounted.
  const hasDesktopAside = useHasDesktopAside();
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [showGrid, setShowGrid] = useState<boolean | null>(null); // null = use map default
  const [rulerActive, setRulerActive] = useState(false);
  // Aside expanded/collapsed state, persisted across reloads so a DM who
  // prefers the full-width map keeps it that way.
  const [asideExpanded, setAsideExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("atlas.viewer.asidePinned") !== "false";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("atlas.viewer.asidePinned", String(asideExpanded));
  }, [asideExpanded]);

  const [viewCenter, setViewCenter] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const viewCenterRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const fitMapRef = useRef<(() => void) | null>(null);
  const [scaleBar, setScaleBar] = useState<ScaleBarState | null>(null);

  const handleViewChange = useCallback((cx: number, cy: number, cz: number) => {
    const vc = { x: cx, y: cy, zoom: cz };
    setViewCenter(vc);
    viewCenterRef.current = vc;
  }, []);

  // Keep URL in sync with viewport (replaceState — no new Back entries for pan/zoom)
  useEffect(() => {
    if (!activeMapId) return;
    window.history.replaceState(
      null,
      "",
      "?" +
        serializeDeepLink({
          mapId: activeMapId,
          entityId: openId,
          center: viewCenter ? { x: viewCenter.x, y: viewCenter.y } : null,
          zoom: viewCenter?.zoom ?? null,
        }),
    );
  }, [activeMapId, openId, viewCenter]);

  // Back navigation: restore entity/map when the user presses Back
  const popStateHandler = useCallback(() => {
    const dl = parseDeepLink(window.location.search);
    setOpenId(dl.entityId);
    if (dl.mapId && data?.project.maps.some((m) => m.id === dl.mapId)) {
      setActiveMapId(dl.mapId);
    }
    if (dl.center && data) {
      const mapIdForFly = dl.mapId ?? activeMapId;
      const targetMap = data.project.maps.find((m) => m.id === mapIdForFly);
      if (targetMap) {
        setFlyTarget({
          x: dl.center.x,
          y: dl.center.y,
          height: targetMap.height,
          zoom: dl.zoom ?? undefined,
        });
      }
    }
    if (!dl.entityId) setMobilePanelOpen(false);
  }, [data, activeMapId]);

  useEffect(() => {
    window.addEventListener("popstate", popStateHandler);
    return () => window.removeEventListener("popstate", popStateHandler);
  }, [popStateHandler]);

  // Extracted so a failed load can be retried in place (Try again button,
  // or auto-retry on the `online` event) without a full page reload.
  const attemptLoad = useCallback(() => {
    loadAtlasContent(true)
      .then((project) => {
        setError(null);
        setData({ project });
        const defaultMapId = project.worlds[0]?.defaultMapId ?? project.maps[0]?.id ?? null;
        const dl = parseDeepLink(window.location.search);
        // Use map from deep link if valid, else fall back to default
        const targetMapId =
          dl.mapId && project.maps.some((m) => m.id === dl.mapId) ? dl.mapId : defaultMapId;
        setActiveMapId(targetMapId);
        if (dl.entityId) {
          setOpenId(dl.entityId);
          // Sheet only matters when the aside isn't mounted.
          if (!hasDesktopAside) setMobilePanelOpen(true);
        }
        if (dl.center) {
          // Full deep link: fly to the exact shared viewport
          const mapForFly = project.maps.find((m) => m.id === targetMapId);
          if (mapForFly) {
            setFlyTarget({
              x: dl.center.x,
              y: dl.center.y,
              height: mapForFly.height,
              zoom: dl.zoom ?? undefined,
            });
          }
        } else if (dl.entityId) {
          // Old-style ?entity= link: fly to the entity's placement (backward compat)
          const placement = project.placements.find((p) => p.entityId === dl.entityId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; URL-driven entity open should respect the viewport at call time, not re-derive on every hasDesktopAside change
  }, []);

  useEffect(() => {
    attemptLoad();
  }, [attemptLoad]);

  const retryLoad = useCallback(() => {
    setError(null);
    attemptLoad();
  }, [attemptLoad]);

  // Auto-retry once when connectivity returns — only bound while an error
  // is showing, so it can't loop or fire once the load has succeeded.
  useEffect(() => {
    if (!error) return;
    window.addEventListener("online", retryLoad);
    return () => window.removeEventListener("online", retryLoad);
  }, [error, retryLoad]);

  const activeMap: MapDocument | undefined = useMemo(
    () => data?.project.maps.find((m) => m.id === activeMapId),
    [data, activeMapId],
  );
  const placementsOnMap: MapPlacement[] = useMemo(
    () =>
      data && activeMap ? data.project.placements.filter((p) => p.mapId === activeMap.id) : [],
    [data, activeMap],
  );
  const entityById = useMemo(() => {
    const m = new Map<string, Entity>();
    data?.project.entities.forEach((e) => m.set(e.id, e));
    return m;
  }, [data]);

  const worldCredits = data?.project.worlds[0]?.credits;
  const worldAssetCredits = data?.project.worlds[0]?.assetCredits;
  const worldName = data?.project.worlds[0]?.name ?? "Atlas";
  const showCredits =
    worldCredits?.page !== false && (data?.project.entities.some((e) => e.credit) ?? false);

  const { visited, mark: markVisitedEntity } = useVisitedPlaces();

  const pointerFine =
    typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
  const peekCtl = usePeekController({ pointerFine });

  const onPinPeek = useCallback(
    (id: string, ev: MouseEvent) => {
      const r = {
        top: ev.clientY,
        bottom: ev.clientY + 1,
        left: ev.clientX,
        right: ev.clientX + 1,
        width: 1,
        height: 1,
      } as DOMRect;
      peekCtl.onTriggerEnter(id, r);
    },
    [peekCtl],
  );

  const openEntity = useCallback(
    (id: string, fly = true) => {
      // Push a history entry so Back returns to the previous entity (or no-entity state)
      const vc = viewCenterRef.current;
      window.history.pushState(
        null,
        "",
        "?" +
          serializeDeepLink({
            mapId: activeMapId,
            entityId: id,
            center: vc ? { x: vc.x, y: vc.y } : null,
            zoom: vc?.zoom ?? null,
          }),
      );
      setOpenId(id);
      // Only open the bottom sheet on viewports where the desktop aside
      // isn't rendered; otherwise the Radix overlay covers the screen
      // while the panel is the user-visible target (the gray-screen bug).
      if (!hasDesktopAside) setMobilePanelOpen(true);
      if (fly && data && activeMap) {
        const placement = data.project.placements.find(
          (p) => p.entityId === id && p.mapId === activeMap.id,
        );
        if (placement) setFlyTarget({ x: placement.x, y: placement.y, height: activeMap.height });
      }
    },
    [data, activeMap, hasDesktopAside, activeMapId],
  );

  // "Discovered" = an entity panel opened by ANY means (click, search, wander,
  // deep-link, Back). openId is the single choke point for all paths.
  useEffect(() => {
    if (openId) markVisitedEntity(openId);
  }, [openId, markVisitedEntity]);

  const meter = useMemo(
    () => (data ? discoveryMeter(data.project.placements, visited) : { discovered: 0, total: 0 }),
    [data, visited],
  );

  const [wanderEmpty, setWanderEmpty] = useState(false);
  const wander = useCallback(() => {
    if (!data) return;
    const target = selectWanderTarget(data.project.placements, visited);
    if (!target) {
      setWanderEmpty(true);
      return;
    }
    setWanderEmpty(false);
    if (target.mapId !== activeMapId) setActiveMapId(target.mapId);
    const targetMap = data.project.maps.find((m) => m.id === target.mapId);
    openEntity(target.entityId, false);
    if (targetMap) setFlyTarget({ x: target.x, y: target.y, height: targetMap.height });
  }, [data, visited, activeMapId, openEntity]);

  useEffect(() => {
    if (!wanderEmpty) return;
    const t = window.setTimeout(() => setWanderEmpty(false), 4000);
    return () => window.clearTimeout(t);
  }, [wanderEmpty]);

  // Intercept wikilink clicks inside rendered HTML
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.atlas-wikilink");
      if (!target) return;
      if (!pointerFine) {
        e.preventDefault();
        const id = resolvePeekEntityId(target);
        if (id) {
          const open = peekCtl.tapPeek(id, target.getBoundingClientRect());
          if (open) openEntity(open);
        }
        return;
      }
      const id = target.getAttribute("data-entity-id");
      if (!id) return;
      e.preventDefault();
      openEntity(id);
    };
    const over = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("a.atlas-wikilink");
      if (!a) return;
      const id = resolvePeekEntityId(a);
      if (id) peekCtl.onTriggerEnter(id, a.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
    };
    const out = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a.atlas-wikilink")) peekCtl.onTriggerLeave();
    };
    const move = (e: MouseEvent) => {
      peekCtl.onPointerMove({ x: e.clientX, y: e.clientY });
    };
    el.addEventListener("click", handler);
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseout", out);
    el.addEventListener("mousemove", move);
    return () => {
      el.removeEventListener("click", handler);
      el.removeEventListener("mouseover", over);
      el.removeEventListener("mouseout", out);
      el.removeEventListener("mousemove", move);
    };
  }, [openEntity, openId, pointerFine, peekCtl]);

  // Fetch the search index on first search-open, not at mount. The ref guards
  // against re-fetching on every reopen (searchOpen flips false/true a lot).
  useEffect(() => {
    if (!searchOpen || searchIndexRequestRef.current) return;
    searchIndexRequestRef.current = loadSearchIndex()
      .then((idx) => setSearchIndex(idx))
      .catch((e: Error) => {
        // Search-index failure degrades search only — the map/entity panel
        // already loaded fine and must stay up, so this must not go through
        // setError (that would replace the whole page with the error screen).
        logger.error("Failed to load search index", e);
        setSearchIndex([]);
      });
  }, [searchOpen]);

  // Cmd/Ctrl-K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        if (peekCtl.peek) {
          peekCtl.dismiss();
          return;
        }
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekCtl]);

  if (error || !data) {
    return (
      <AtlasLoadState
        error={error}
        loading={!data}
        backHref="/"
        backLabel="Back to home"
        loadingLabel="Loading atlas…"
        onRetry={retryLoad}
        extraHint={
          <p className="text-xs text-muted-foreground">
            Run <code className="px-1.5 py-0.5 rounded bg-muted">npm run atlas:build</code> to
            generate <code>public/atlas/atlas.json</code>.
          </p>
        }
      />
    );
  }

  // Atlas loaded but no map to render — either world.yaml has zero maps or
  // every map was filtered out. Give the user useful guidance instead of an
  // indefinite loading spinner.
  if (!activeMap) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <Compass className="h-10 w-10 mx-auto text-primary opacity-70" aria-hidden="true" />
          <h1 className="font-display text-2xl text-primary">Atlas has no maps yet</h1>
          <p className="text-sm text-muted-foreground">
            The atlas published, but no map is configured for this world. Add at least one map block
            to{" "}
            <code className="px-1 py-0.5 rounded bg-muted">
              content/&lt;world&gt;/_atlas/world.yaml
            </code>
            and run <code className="px-1 py-0.5 rounded bg-muted">npm run atlas:build</code> to
            regenerate.
          </p>
          {data.project.entities.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.project.entities.length} entities are present — they're searchable via the
              search palette even without a map.
            </p>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Button onClick={() => setSearchOpen(true)} variant="default" className="gap-2">
              <Search className="h-4 w-4" /> Search entities (Ctrl+K)
            </Button>
            <Button asChild variant="secondary">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const openEntity_ = openId ? (entityById.get(openId) ?? null) : null;
  const openPlacements = openEntity_
    ? data.project.placements.filter((p) => p.entityId === openEntity_.id)
    : [];

  return (
    <SoundSettingsProvider>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        <a href="#atlas-main" className="skip-to-main">
          Skip to map
        </a>
        <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
          <AtlasNavMenu publishedAt={data.project.publishedAt} showCredits={showCredits} worldName={worldName} />
          <Link
            to="/"
            className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2"
          >
            <Compass className="h-5 w-5" aria-hidden="true" />{" "}
            <span className="hidden sm:inline">{worldName}</span>
          </Link>
          <div className="flex-1" />
          {data.project.maps.length > 1 && (
            <Select value={activeMap.id} onValueChange={(id) => { setActiveMapId(id); setFlyTarget(null); }}>
              <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Choose map">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.project.maps.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button
            variant={rulerActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRulerActive((v) => !v)}
            title="Measure distance (click two points)"
            aria-label="Toggle distance ruler"
            aria-pressed={rulerActive}
          >
            <Ruler className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="gap-2"
            aria-label="Search atlas (Ctrl+K)"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">
              ⌘K
            </kbd>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <Link to="/atlas/browse" title="Browse all entries">
              <LayoutGrid className="h-4 w-4 mr-1" aria-hidden="true" />
              Browse
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <Link to="/atlas/timeline" title="Timeline of dated entries">
              <CalendarClock className="h-4 w-4 mr-1" aria-hidden="true" />
              Timeline
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <Link to="/atlas/secrets" title="Your character's secrets">
              <KeyRound className="h-4 w-4 mr-1" aria-hidden="true" />
              Secrets
            </Link>
          </Button>
          {showCredits && (
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link to="/atlas/credits" title="Image credits">
                <Star className="h-4 w-4 mr-1" aria-hidden="true" />
                Credits
              </Link>
            </Button>
          )}
          {__INCLUDE_EDITOR__ && isDmToolsEnabled() && (
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link to="/atlas/edit" title="DM placement editor">
                Edit pins
              </Link>
            </Button>
          )}
          <OfflineMenu />
          <span className="hidden lg:block text-[11px] text-muted-foreground ml-2">
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
            <OceanBackground map={activeMap} />
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
              style={{
                width: "100%",
                height: "100%",
                background:
                  activeMap.water?.enabled === false
                    ? (activeMap.oceanColor ?? "#18313f")
                    : "transparent",
                cursor: rulerActive ? "crosshair" : undefined,
              }}
            >
              <MapController flyTo={flyTarget} />
              <FitBoundsController
                mapId={activeMap.id}
                mapWidth={activeMap.width}
                mapHeight={activeMap.height}
                flyTarget={flyTarget}
                fitRef={fitMapRef}
              />
              <MaxBoundsController
                mapId={activeMap.id}
                mapWidth={activeMap.width}
                mapHeight={activeMap.height}
                wrapX={activeMap.wrapX}
              />
              <ViewSyncController
                mapId={activeMap.id}
                mapHeight={activeMap.height}
                onViewChange={handleViewChange}
              />
              <ScaleBarController scale={activeMap.scale} onChange={setScaleBar} />
              <SoundscapeLayer map={activeMap} />
              <RulerLayer
                active={rulerActive}
                mapId={activeMap.id}
                mapHeight={activeMap.height}
                scale={activeMap.scale}
              />

              {/* Horizontal wrap: render copies at -W, 0, +W when wrapX enabled */}
              {(activeMap.wrapX ? [-activeMap.width, 0, activeMap.width] : [0]).map((dx) => (
                <WrappedWorld
                  key={`wrap-${dx}`}
                  dx={dx}
                  map={activeMap}
                  placements={placementsOnMap}
                  entityById={entityById}
                  showGrid={showGrid}
                  onOpenEntity={openEntity}
                  visited={visited}
                  openId={openId}
                  onPinPeek={onPinPeek}
                  onPinPeekLeave={peekCtl.onTriggerLeave}
                  rulerActive={rulerActive}
                />
              ))}

              {/* (markers, layers, regions, routes, fog, grid handled inside WrappedWorld) */}

              <AtlasMinimap map={activeMap} layers={activeMap.layers} />
            </MapContainer>

            <MapCreditOverlay
              map={activeMap}
              assetCredits={worldAssetCredits}
              credits={worldCredits}
            />

            <SoundControl
              hasSoundscape={
                activeMap.soundscape?.enabled !== false &&
                (activeMap.soundscape?.areas?.length ?? 0) > 0
              }
            />

            {/* Wander button + discovery meter — bottom-left map overlay */}
            <WanderControl
              discovered={meter.discovered}
              total={meter.total}
              canWander={meter.discovered < meter.total}
              onWander={wander}
            />
            {wanderEmpty && (
              <div className="atlas-wander-note absolute left-3 bottom-20 z-[500] max-w-xs rounded-lg border bg-background/95 px-3 py-2 text-xs text-muted-foreground">
                You've explored everything you can reach — travel onward to uncover more.
              </div>
            )}

            {/* Scale bar — bottom-center map overlay */}
            {scaleBar && (
              <div
                className="atlas-scale-bar absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-none select-none"
                role="note"
                aria-label={`Map scale: ${scaleBar.label}`}
              >
                <div className="rounded bg-background/90 border border-border px-2 pb-1 pt-1 shadow-sm text-center">
                  <div
                    className="mx-auto border-b border-l border-r border-foreground/60 h-1.5 mb-0.5"
                    style={{ width: `${scaleBar.barWidth}px` }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] text-muted-foreground leading-none">
                    {scaleBar.label}
                  </span>
                </div>
              </div>
            )}

            {/* Reset view — bottom-right map corner */}
            <button
              type="button"
              onClick={() => fitMapRef.current?.()}
              className="absolute bottom-3 right-3 z-[500] h-8 w-8 rounded bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Reset map view"
              title="Reset view (fit map to screen)"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </main>

          {/* Desktop side panel — only mounts at lg+. Below that, the entity
            bottom sheet handles entity viewing instead. The aside can be
            collapsed to a 28px re-expand strip via the chevron in its
            header; state is persisted in localStorage. */}
          {asideExpanded ? (
            <aside className="hidden lg:flex w-[400px] border-l border-border bg-card flex-col relative">
              <button
                type="button"
                onClick={() => setAsideExpanded(false)}
                className="absolute top-2 -left-3 z-10 h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Collapse side panel"
                title="Collapse side panel"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
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
                onPeek={(id, rect) => peekCtl.onTriggerEnter(id, rect)}
                onPeekLeave={peekCtl.onTriggerLeave}
                credits={worldCredits}
                assetCredits={worldAssetCredits}
              />
            </aside>
          ) : (
            <aside className="hidden lg:flex w-7 border-l border-border bg-card items-start justify-center pt-2">
              <button
                type="button"
                onClick={() => setAsideExpanded(true)}
                className="h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Expand side panel"
                title="Expand side panel"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </aside>
          )}
        </div>

        {/* Entity bottom sheet — used at every viewport below the desktop aside
          breakpoint (1024px), including tablets. The Sheet (and its Radix
          overlay) only mounts here, so on desktop nothing dims the screen. */}
        {!hasDesktopAside && (
          <Sheet open={mobilePanelOpen && !!openEntity_} onOpenChange={setMobilePanelOpen}>
            <SheetContent side="bottom" className="h-[80vh] p-0">
              <SheetTitle className="sr-only">{openEntity_?.title ?? ""}</SheetTitle>
              <SheetDescription className="sr-only">Entity details</SheetDescription>
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
                onPeek={(id, rect) => peekCtl.onTriggerEnter(id, rect)}
                onPeekLeave={peekCtl.onTriggerLeave}
                credits={worldCredits}
                assetCredits={worldAssetCredits}
              />
            </SheetContent>
          </Sheet>
        )}

        {/* Search palette */}
        {searchOpen &&
          (searchIndex ? (
            <SearchPalette
              query={query}
              setQuery={setQuery}
              index={searchIndex}
              placements={placementsOnMap}
              onPick={(id, fly) => {
                setSearchOpen(false);
                setQuery("");
                openEntity(id, fly);
              }}
              onClose={() => setSearchOpen(false)}
            />
          ) : (
            <div
              className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
              onClick={() => setSearchOpen(false)}
            >
              <div
                role="status"
                aria-live="polite"
                className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl p-6 text-sm text-muted-foreground text-center"
              >
                Loading search…
              </div>
            </div>
          ))}
        {peekCtl.peek &&
          data &&
          entityById.get(peekCtl.peek.entityId) &&
          createPortal(
            <div
              style={{
                position: "fixed",
                left: peekCtl.peek.position.left,
                top: peekCtl.peek.position.top,
                zIndex: 1000,
              }}
            >
              <HoverPeekCard
                entity={entityById.get(peekCtl.peek.entityId)!}
                hasPlacement={data.project.placements.some(
                  (p) => p.entityId === peekCtl.peek!.entityId,
                )}
                onOpen={() => {
                  const id = peekCtl.peek!.entityId;
                  peekCtl.dismiss();
                  openEntity(id);
                }}
                onFlyToMap={() => {
                  const id = peekCtl.peek!.entityId;
                  peekCtl.dismiss();
                  const pl = data.project.placements.find((p) => p.entityId === id);
                  if (pl) {
                    if (pl.mapId !== activeMapId) setActiveMapId(pl.mapId);
                    const m = data.project.maps.find((mm) => mm.id === pl.mapId);
                    openEntity(id, false);
                    if (m) setFlyTarget({ x: pl.x, y: pl.y, height: m.height });
                  }
                }}
                onMouseEnter={peekCtl.onCardEnter}
                onMouseLeave={peekCtl.onCardLeave}
              />
            </div>,
            document.body,
          )}
      </div>
    </SoundSettingsProvider>
  );
}

interface WrappedWorldProps {
  dx: number;
  map: MapDocument;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  showGrid: boolean | null;
  onOpenEntity: (id: string, fly?: boolean) => void;
  visited: Set<string>;
  openId: string | null;
  onPinPeek?: (id: string, ev: MouseEvent) => void;
  onPinPeekLeave?: () => void;
  rulerActive?: boolean;
}

export function WrappedWorld({
  dx,
  map,
  placements,
  entityById,
  showGrid,
  onOpenEntity,
  visited,
  openId,
  onPinPeek,
  onPinPeekLeave,
  rulerActive,
}: WrappedWorldProps) {
  const H = map.height;
  return (
    <>
      {[...map.layers]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => (
          <ImageOverlay
            key={`${layer.id}-${dx}`}
            url={normalizeAtlasAssetUrl(layer.src)}
            bounds={
              [
                [H - (layer.y + layer.height), layer.x + dx],
                [H - layer.y, layer.x + layer.width + dx],
              ] as L.LatLngBoundsLiteral
            }
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
              color,
              weight: 1.5,
              fillColor: color,
              fillOpacity: region.fillOpacity ?? 0.18,
              opacity: region.strokeOpacity ?? 0.85,
            }}
            eventHandlers={
              region.entityId && !rulerActive
                ? { click: () => onOpenEntity(region.entityId!, false) }
                : undefined
            }
          >
            {/* Hover label so users don't rely on fill color alone to identify
                a region (WCAG 1.4.1). Click still opens the full popup. */}
            <Tooltip sticky direction="top" opacity={0.95}>
              <div className="text-xs font-medium">{region.name}</div>
            </Tooltip>
            <Popup>
              <div className="text-sm font-medium">{region.name}</div>
              {ent?.summary && <div className="text-xs opacity-70">{ent.summary}</div>}
            </Popup>
          </Polygon>
        );
      })}

      {(map.routes ?? []).map((route) => {
        const pts = (route.resolvedPoints ?? []).map(
          ([x, y]) => [H - y, x + dx] as [number, number],
        );
        if (pts.length < 2) return null;
        const color = route.color ?? "#cfd6dc";
        const distPx = routeDistancePx(route.resolvedPoints ?? []);
        const scale: MapScale | undefined = map.scale;
        const distLabel = scale
          ? `${(distPx * scale.unitsPerPixel).toFixed(1)} ${scale.unitLabel}`
          : `${Math.round(distPx)} px`;
        const travel =
          scale && route.speed
            ? formatTravelTime((distPx * scale.unitsPerPixel) / route.speed)
            : null;
        const modeLabel = route.mode ? ROUTE_MODE_LABEL[route.mode] : "";
        return (
          <Polyline
            key={`${route.id}-${dx}`}
            positions={pts}
            pathOptions={{
              color,
              weight: route.weight ?? 3,
              opacity: 0.9,
              dashArray: route.dashed ? "8 6" : undefined,
              lineCap: "round",
              lineJoin: "round",
            }}
          >
            <Tooltip sticky direction="top" opacity={0.95}>
              <div className="text-xs">
                <div className="font-medium">{route.name}</div>
                <div className="opacity-80">
                  {distLabel}
                  {travel ? ` · ${travel} ${modeLabel}` : ""}
                </div>
              </div>
            </Tooltip>
          </Polyline>
        );
      })}

      {map.grid &&
        (showGrid ?? map.grid.enabled !== false) &&
        gridLines(map, map.grid).map((line, i) => (
          <Polyline
            key={`grid-${dx}-${i}`}
            positions={line.map((p) => {
              const [lat, lng] = p as [number, number];
              return [lat, lng + dx] as [number, number];
            })}
            pathOptions={{
              color: map.grid!.color ?? "rgba(255,255,255,0.08)",
              weight: 1,
              opacity: 1,
              interactive: false,
            }}
          />
        ))}

      <PlacementMarkers
        dx={dx}
        H={H}
        placements={placements}
        entityById={entityById}
        onOpenEntity={onOpenEntity}
        visited={visited}
        openId={openId}
        onPinPeek={onPinPeek}
        onPinPeekLeave={onPinPeekLeave}
      />
    </>
  );
}

/** Renders pin markers with preset-derived shape/color, and computes which
 *  labels are permanently visible based on per-pin priority + labelMinZoom +
 *  a screen-space collision pass (higher priority wins). */
export function PlacementMarkers({
  dx,
  H,
  placements,
  entityById,
  onOpenEntity,
  visited,
  openId,
  onPinPeek,
  onPinPeekLeave,
}: {
  dx: number;
  H: number;
  placements: MapPlacement[];
  entityById: Map<string, Entity>;
  onOpenEntity: (id: string, fly?: boolean) => void;
  visited: Set<string>;
  openId: string | null;
  onPinPeek?: (id: string, ev: MouseEvent) => void;
  onPinPeekLeave?: () => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const h = () => setZoom(map.getZoom());
    map.on("zoomend", h);
    return () => {
      map.off("zoomend", h);
    };
  }, [map]);

  // Resolve preset + decide label visibility (permanent / hover / none).
  // Order by priority desc; suppress lower-priority permanent labels that fall
  // within ~70 px of a higher-priority one already shown at this zoom.
  const enriched = placements
    .map((p) => {
      const ent = entityById.get(p.entityId);
      if (!ent) return null;
      const style = resolvePinStyle(
        ent.type,
        p.pin as import("@/atlas/pins/presets").PinOverride | undefined,
      );
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
    else mode = shouldShowLabel(zoom, style.priority) ? "always" : "hover";
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
        const typeLabel = playerTypeLabel(ent.type);
        const a11yLabel = typeLabel ? `${ent.title}, ${typeLabel}` : ent.title;
        return (
          <Marker
            key={`${p.id}-${dx}`}
            position={[H - p.y, p.x + dx]}
            icon={pinIconForStyle(style, {
              dim,
              extraClass: [
                pinDiscoveryClass(p.entityId, visited),
                p.entityId === openId ? "atlas-viewer-pin--active" : null,
              ]
                .filter(Boolean)
                .join(" "),
              ariaLabel: a11yLabel,
            })}
            riseOnHover
            riseOffset={250}
            title={a11yLabel}
            eventHandlers={{
              click: () => onOpenEntity(p.entityId, false),
              mouseover: (e) => onPinPeek?.(p.entityId, e.originalEvent as MouseEvent),
              mouseout: () => onPinPeekLeave?.(),
            }}
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
          </Marker>
        );
      })}
    </>
  );
}
