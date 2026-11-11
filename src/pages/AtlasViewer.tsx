import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
} from "react";
import { MapContainer, useMap } from "react-leaflet";
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
import { Link } from "react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AtlasMinimap, minimapHeightFor } from "@/atlas/AtlasMinimap";
import { OceanBackground } from "@/atlas/ocean/OceanBackground";
import { SoundSettingsProvider } from "@/atlas/sound/SoundSettingsProvider";
import { SoundscapeLayer } from "@/atlas/sound/SoundscapeLayer";
import { SoundControl } from "@/atlas/sound/SoundControl";
import { OfflineMenu, OfflineStatus } from "@/atlas/OfflineStatus";
import { setOfflineMap, type OfflineMap } from "@/pwa";
import { isDmToolsEnabled } from "@/atlas/dmTools";
import { SearchPalette } from "@/atlas/search/SearchPalette";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { ReadingPanelWelcome } from "@/atlas/entity/ReadingPanelWelcome";
import { pickStarters } from "@/atlas/entity/pickStarters";
import { MapCreditOverlay } from "@/atlas/map/MapCreditOverlay";
import { useHasDesktopAside } from "@/hooks/use-has-desktop-aside";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import { CalmModeToggle } from "@/atlas/CalmModeToggle";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RulerLayer } from "@/atlas/ruler/RulerLayer";
import { ScaleBarController, type ScaleBarState } from "@/atlas/scale/ScaleBar";
import { serializeDeepLink, parseDeepLink } from "@/atlas/deepLink";
import { resolveDeepLink } from "@/atlas/resolveDeepLink";
import { pushViewerSearch, replaceViewerSearch } from "@/atlas/viewerHistory";
import { WrappedWorld } from "@/atlas/map/WrappedWorld";
import { atlasToLatLng } from "@/atlas/map/coords";
import { whenMapHasSize } from "@/atlas/map/whenMapHasSize";
import { useVisitedPlaces } from "@/atlas/visited/useVisitedPlaces";
import { selectWanderTarget } from "@/atlas/wander/selectWanderTarget";
import { discoveryMeter } from "@/atlas/wander/discoveryMeter";
import { WanderControl } from "@/atlas/wander/WanderControl";
import { createPortal } from "react-dom";
import { HoverPeekCard } from "@/atlas/peek/HoverPeekCard";
import { usePeekController } from "@/atlas/peek/usePeekController";
import { resolvePeekEntityId } from "@/atlas/peek/resolvePeekEntityId";
import { FlatCRS } from "@/atlas/map/flatCRS";
import { AtlasCanvas, type CanvasCamera, type CanvasCameraState } from "@/atlas/canvas/AtlasCanvas";
import { buildMapTree, type MapTree } from "@/atlas/ocean/mapTree";
import type { TreeView } from "@/atlas/ocean/zoomHandoff";
import { MapBreadcrumb } from "@/atlas/map/MapBreadcrumb";
import { creditsForView } from "@/atlas/map/viewCredits";

import { PinLegend } from "@/atlas/pins/PinLegend";
import { FitMapOnOpen } from "@/atlas/map/FitMapOnOpen";

function MapController({
  flyTo,
}: {
  flyTo: { x: number; y: number; height: number; zoom?: number } | null;
}) {
  const map = useMap();
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (!flyTo) return;
    const [lat, lng] = atlasToLatLng(flyTo.x, flyTo.y, flyTo.height);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // A zero-size (hidden) map would make Leaflet project to NaN and throw.
    return whenMapHasSize(map, () => {
      const targetZoom =
        flyTo.zoom != null && Number.isFinite(flyTo.zoom)
          ? flyTo.zoom
          : Math.max(map.getZoom(), -1);
      if (reduceMotion) {
        map.setView([lat, lng], targetZoom, { animate: false });
      } else {
        map.flyTo([lat, lng], targetZoom, { duration: 0.6 });
      }
    });
  }, [flyTo, map, reduceMotion]);
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
  mapWidth,
  mapHeight,
  fitRef,
}: {
  mapWidth: number;
  mapHeight: number;
  fitRef: MutableRefObject<(() => void) | null>;
}) {
  const map = useMap();
  const reduceMotion = useReduceMotion();

  // Keep the reset-view callback current after every render in which deps change
  useLayoutEffect(() => {
    fitRef.current = () => {
      map.fitBounds(
        [
          [0, 0],
          [mapHeight, mapWidth],
        ],
        { animate: !reduceMotion, duration: 0.5 },
      );
    };
    return () => {
      fitRef.current = null;
    };
  }, [map, mapHeight, mapWidth, fitRef, reduceMotion]);

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
  /** The map tree (R-30). `tree.ocean` is set for v2 output only. */
  tree: MapTree;
}

type FlyTarget = { x: number; y: number; height: number; zoom?: number };

const OCEAN_KEY = "ocean";
const viewKeyOf = (mapId: string | null) => (mapId === null ? OCEAN_KEY : `map:${mapId}`);

/** The `resolveDeepLink` option for v2 output: the ocean's height and the ids the tree can show. */
const oceanOption = (tree: MapTree) =>
  tree.ocean ? { height: tree.ocean.height, isMap: (id: string) => tree.byId.has(id) } : undefined;

/** The `c=` this output writes: its own campaign on v2, nothing on v1 (R-35). */
const campaignOf = (d: ViewerState) => (d.tree.ocean ? (d.project.campaign?.id ?? null) : null);

/** The one notice a link into another campaign, or to something this output lacks, gets. Fixed text. */
const NOT_FOUND_NOTICE = "Not found in this campaign";

/** The local picker (R-34), on its default port. Only offered on a local host. */
const PICKER_PORT = 4300;
const isLocalHost = (h: string) => h === "localhost" || h === "127.0.0.1";

/** Zoom to keep when flying within the view on screen (as v1's flyTo does). */
const keepZoom = (vc: { zoom: number } | null) => Math.max(vc?.zoom ?? -1, -1);

/** A fly target (a point in the view's own pixels) as a canvas camera. */
function cameraAt(t: FlyTarget, fallbackZoom: number): CanvasCameraState {
  return { center: [t.x, t.y], zoom: t.zoom ?? fallbackZoom };
}

/**
 * The campaign's name in the top bar. A label, not a picker: a campaign site can't switch
 * campaigns. It links to the local picker (R-34) only on a local host; the check is the
 * hostname alone, so nothing in a deployed build can turn it on.
 */
function CampaignChip({ name }: { name: string }) {
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const cls =
    "shrink-0 max-w-[9rem] sm:max-w-[14rem] truncate rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground";
  return isLocalHost(host) ? (
    <a
      className={`${cls} hover:text-foreground`}
      href={`${window.location.protocol}//${host}:${PICKER_PORT}/`}
      title="Choose another campaign (local)"
      data-campaign-chip=""
    >
      {name}
    </a>
  ) : (
    <span className={cls} data-campaign-chip="">
      {name}
    </span>
  );
}

export default function AtlasViewer() {
  const [data, setData] = useState<ViewerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null: the ocean (v2 output), or nothing yet.
  const [activeMapId, setActiveMapIdState] = useState<string | null>(null);
  const activeMapIdRef = useRef<string | null>(null);
  const setActiveMapId = useCallback((id: string | null) => {
    activeMapIdRef.current = id;
    setActiveMapIdState(id);
  }, []);
  // v2: where the canvas looks, and the last camera of each view the user left.
  const [camera, setCamera] = useState<CanvasCamera>("fit");
  const viewMemory = useRef(new Map<string, CanvasCameraState>());
  const [openId, setOpenId] = useState<string | null>(null);
  // v2: a link named another campaign or something this output doesn't have (R-35).
  const [notFound, setNotFound] = useState(false);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
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

  // The viewer's own path, and the query string it last wrote or applied.
  // Back from the viewer to another page, or Back over an in-page `#` link,
  // fires popstate too; neither should re-apply (or rewrite) the viewer URL.
  const viewerPathRef = useRef(typeof window === "undefined" ? "" : window.location.pathname);
  const shownSearchRef = useRef<string | null>(null);

  // Keep URL in sync with viewport (replace — no new Back entries for pan/zoom)
  const urlReady = data !== null && (activeMapId !== null || data.tree.ocean !== null);
  useEffect(() => {
    if (!urlReady || window.location.pathname !== viewerPathRef.current) return;
    replaceViewerSearch(
      serializeDeepLink({
        campaign: campaignOf(data),
        mapId: activeMapId,
        entityId: openId,
        center: viewCenter ? { x: viewCenter.x, y: viewCenter.y } : null,
        zoom: viewCenter?.zoom ?? null,
      }),
    );
    shownSearchRef.current = window.location.search;
  }, [data, urlReady, activeMapId, openId, viewCenter]);

  // Load and Back/Forward read the viewport at call time, not at render.
  const hasDesktopAsideRef = useRef(hasDesktopAside);
  useLayoutEffect(() => {
    hasDesktopAsideRef.current = hasDesktopAside;
  }, [hasDesktopAside]);

  /** Show what the current URL names: one rule for load and Back/Forward (resolveDeepLink). */
  const applyUrl = useCallback(
    ({ project, tree }: ViewerState, currentMapId: string | null) => {
      let link = parseDeepLink(window.location.search);
      // v2: `c` is a check, not a switch. Another campaign's id, or a map or entity this output
      // doesn't hold, opens the ocean fitted with the same notice and drops every other param,
      // whatever the id is or whether it exists elsewhere (R-35: no oracle).
      const missing =
        !!tree.ocean &&
        ((link.campaign != null &&
          project.campaign != null &&
          link.campaign !== project.campaign.id) ||
          (link.mapId != null && !tree.byId.has(link.mapId)) ||
          (link.entityId != null && !project.entities.some((e) => e.id === link.entityId)));
      setNotFound(missing);
      if (missing) {
        link = { campaign: null, mapId: null, entityId: null, center: null, zoom: null };
        replaceViewerSearch(serializeDeepLink({ campaign: project.campaign?.id ?? null, ...link }));
      }
      shownSearchRef.current = window.location.search;
      const r = resolveDeepLink(link, project, {
        currentMapId,
        defaultMapId: project.worlds[0]?.defaultMapId ?? project.maps[0]?.id ?? null,
        hasDesktopAside: hasDesktopAsideRef.current,
        ocean: oceanOption(tree),
      });
      setActiveMapId(r.mapId);
      setOpenId(r.openId);
      setMobilePanelOpen(r.openSheet);
      if (!tree.ocean) {
        if (r.fly) setFlyTarget(r.fly);
        return;
      }
      // v2: the camera is the canvas's. Same view and no point named: leave it where it is.
      const sameView = r.mapId === currentMapId;
      if (r.fly) {
        const cam = cameraAt(r.fly, sameView ? keepZoom(viewCenterRef.current) : 0);
        setCamera(cam);
        handleViewChange(cam.center[0], cam.center[1], cam.zoom);
      } else if (!sameView || missing) {
        setCamera("fit");
        setViewCenter(null);
        viewCenterRef.current = null;
      }
    },
    [setActiveMapId, handleViewChange],
  );

  // Back navigation: restore entity/map when the user presses Back
  const popStateHandler = useCallback(() => {
    if (!data || window.location.pathname !== viewerPathRef.current) return;
    if (window.location.search === shownSearchRef.current) return;
    applyUrl(data, activeMapId);
  }, [data, activeMapId, applyUrl]);

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
        const loaded = { project, tree: buildMapTree(project) };
        setData(loaded);
        applyUrl(loaded, null);
      })
      .catch((e: Error) => setError(e.message));
  }, [applyUrl]);

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
    () =>
      data?.tree.ocean
        ? activeMapId !== null
          ? data.tree.byId.get(activeMapId)?.map
          : undefined
        : data?.project.maps.find((m) => m.id === activeMapId),
    [data, activeMapId],
  );
  const isV2 = !!data?.tree.ocean;
  const view: TreeView = activeMap ? { kind: "map", mapId: activeMap.id } : { kind: "ocean" };
  // The offline menu and banner describe what is stored for this map.
  const offlineMap: OfflineMap | null = useMemo(() => {
    if (!activeMap) return null;
    const layerSrcs = activeMap.layers.map((l) => l.src);
    return { key: [activeMap.id, ...layerSrcs].join("\n"), layerSrcs };
  }, [activeMap]);
  useEffect(() => setOfflineMap(offlineMap), [offlineMap]);
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

  // v1: the first world's. v2: the world of the map in view, on the ocean every world's.
  const { credits: worldCredits, assetCredits: worldAssetCredits } = useMemo(
    () => (data ? creditsForView(data.project, activeMap ?? null) : {}),
    [data, activeMap],
  );
  const worldName = data?.project.worlds[0]?.name ?? "Atlas";
  /** The loaded atlas's own name: its campaign in a v2 build, else its world. */
  const siteName = data?.project.campaign?.name ?? worldName;
  /** What the toolbar and panel call the atlas: the campaign in v2, as `siteName`. */
  const titleName = isV2 ? siteName : worldName;

  /** A few entries to offer in the reading panel before anything is opened. */
  const starterEntries = useMemo(() => {
    if (!data) return [];
    const placed = new Set(data.project.placements.map((p) => p.entityId));
    return pickStarters(data.project.entities, (id) => placed.has(id));
  }, [data]);
  const showCredits =
    worldCredits?.page !== false && (data?.project.entities.some((e) => e.credit) ?? false);

  const { visited, mark: markVisitedEntity } = useVisitedPlaces();

  const pointerFine =
    typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;
  const peekCtl = usePeekController({ pointerFine });

  // Read through a ref so the callback stays the same object while the peek
  // opens and closes; a new one would re-render every pin on the map.
  const peekEnterRef = useRef(peekCtl.onTriggerEnter);
  useLayoutEffect(() => {
    peekEnterRef.current = peekCtl.onTriggerEnter;
  }, [peekCtl.onTriggerEnter]);
  const onPinPeek = useCallback((id: string, ev: MouseEvent) => {
    const r = {
      top: ev.clientY,
      bottom: ev.clientY + 1,
      left: ev.clientX,
      right: ev.clientX + 1,
      width: 1,
      height: 1,
    } as DOMRect;
    peekEnterRef.current(id, r);
  }, []);
  // Turning the ruler on unbinds region handlers mid-hover, so no mouseout comes.
  const { dismiss: dismissPeek } = peekCtl;
  useEffect(() => {
    if (rulerActive) dismissPeek();
  }, [rulerActive, dismissPeek]);

  /**
   * v2: show `next` at `cam` ("memory": where the user left that view, else
   * fitted). `push` adds a Back entry: a handoff, a click into a map, a crumb;
   * panning and zooming inside a view only replace it (the sync effect above).
   */
  const goView = useCallback(
    (next: TreeView, cam: CanvasCamera | "memory", push: boolean) => {
      const mapId = next.kind === "map" ? next.mapId : null;
      const c = cam === "memory" ? (viewMemory.current.get(viewKeyOf(mapId)) ?? "fit") : cam;
      const vc = c === "fit" ? null : { x: c.center[0], y: c.center[1], zoom: c.zoom };
      if (push) {
        pushViewerSearch(
          serializeDeepLink({
            campaign: data ? campaignOf(data) : null,
            mapId,
            entityId: openId,
            center: vc ? { x: vc.x, y: vc.y } : null,
            zoom: vc?.zoom ?? null,
          }),
        );
      }
      shownSearchRef.current = window.location.search;
      setNotFound(false);
      setActiveMapId(mapId);
      setCamera(c);
      setViewCenter(vc);
      viewCenterRef.current = vc;
    },
    [data, openId, setActiveMapId],
  );

  /** v2: the canvas reports the camera of the view on screen; remember it per view. */
  const onCanvasCamera = useCallback(
    (c: CanvasCameraState) => {
      viewMemory.current.set(viewKeyOf(activeMapIdRef.current), c);
      setCamera(c);
      handleViewChange(c.center[0], c.center[1], c.zoom);
    },
    [handleViewChange],
  );
  const onCanvasViewChange = useCallback(
    (next: TreeView, c: CanvasCameraState) => goView(next, c, true),
    [goView],
  );
  const onCanvasEnterMap = useCallback(
    (id: string) => goView({ kind: "map", mapId: id }, "fit", true),
    [goView],
  );

  /** Put a placement's spot in view (a pin's "show on map", wander). v1 flies, v2 sets the camera. */
  const showPlacement = useCallback(
    (p: { mapId: string; x: number; y: number }, push: boolean) => {
      const m = data?.project.maps.find((mm) => mm.id === p.mapId);
      if (!data || !m) return;
      if (!data.tree.ocean) {
        setActiveMapId(p.mapId);
        setFlyTarget({ x: p.x, y: p.y, height: m.height });
        return;
      }
      if (!data.tree.byId.has(p.mapId)) return;
      const same = activeMapIdRef.current === p.mapId;
      const cam = cameraAt(
        { x: p.x, y: p.y, height: m.height },
        same ? keepZoom(viewCenterRef.current) : 0,
      );
      // A spot on the map already in view is a pan: replace. Another map is a step: push.
      goView({ kind: "map", mapId: p.mapId }, cam, push && !same);
    },
    [data, goView, setActiveMapId],
  );

  const openEntity = useCallback(
    (id: string, fly = true) => {
      const activeId = activeMapIdRef.current;
      // Same rule as a URL naming this map and entity with no center: stay on
      // the active map and fly to the entity's placement there, if it has one.
      // v2 on the ocean: the entity's map (a child map too; no cross-map fly yet).
      const ocean = data?.tree.ocean;
      const r =
        data && (activeId || ocean)
          ? resolveDeepLink(
              { mapId: activeId, entityId: id, center: null, zoom: null },
              data.project,
              {
                currentMapId: activeId,
                defaultMapId: activeId,
                hasDesktopAside,
                ocean: oceanOption(data.tree),
              },
            )
          : null;
      const switching = !!ocean && !!r && r.mapId !== activeId;
      const cam = switching && fly && r?.fly ? cameraAt(r.fly, 0) : null;
      // Push a history entry so Back returns to the previous entity (or no-entity state)
      const vc = switching ? null : viewCenterRef.current;
      pushViewerSearch(
        serializeDeepLink({
          campaign: data ? campaignOf(data) : null,
          mapId: switching ? r.mapId : activeId,
          entityId: id,
          center: cam ? { x: cam.center[0], y: cam.center[1] } : vc ? { x: vc.x, y: vc.y } : null,
          zoom: cam ? cam.zoom : (vc?.zoom ?? null),
        }),
      );
      shownSearchRef.current = window.location.search;
      setNotFound(false);
      setOpenId(id);
      // Only open the bottom sheet on viewports where the desktop aside
      // isn't rendered; otherwise the Radix overlay covers the screen
      // while the panel is the user-visible target (the gray-screen bug).
      if (!hasDesktopAside) setMobilePanelOpen(true);
      if (switching) {
        goView({ kind: "map", mapId: r.mapId! }, cam ?? "fit", false);
      } else if (fly && r?.fly) {
        if (ocean) {
          setCamera(cameraAt(r.fly, keepZoom(viewCenterRef.current)));
        } else {
          setFlyTarget(r.fly);
        }
      }
    },
    [data, hasDesktopAside, goView],
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
    if (data.tree.ocean) {
      showPlacement(target, false);
      openEntity(target.entityId, false);
      return;
    }
    if (target.mapId !== activeMapId) setActiveMapId(target.mapId);
    const targetMap = data.project.maps.find((m) => m.id === target.mapId);
    openEntity(target.entityId, false);
    if (targetMap) setFlyTarget({ x: target.x, y: target.y, height: targetMap.height });
  }, [data, visited, activeMapId, openEntity, showPlacement, setActiveMapId]);

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
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        // Desktop entity panel is a plain <aside>, not a Radix Sheet, so it
        // gets no built-in Escape-to-close. The mobile Sheet already closes
        // on Escape on its own (Radix Dialog), so only handle this here.
        if (hasDesktopAside && openId !== null) {
          setOpenId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekCtl, searchOpen, hasDesktopAside, openId]);

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
  if (!activeMap && !isV2) {
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
  const hasChildFrames =
    !!activeMap && (data.tree.byId.get(activeMap.id)?.children.length ?? 0) > 0;
  const showLegend = isV2 && (!activeMap || hasChildFrames);
  const openPlacements = openEntity_
    ? data.project.placements.filter((p) => p.entityId === openEntity_.id)
    : [];

  // Everything a map view draws over its images; the same for both outputs. v2's canvas
  // draws the images itself.
  const mapLayers = activeMap ? (
    <>
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
          peekEnabled={pointerFine}
          rulerActive={rulerActive}
          showImageLayers={!isV2}
        />
      ))}

      {/* (markers, layers, regions, routes, fog, grid handled inside WrappedWorld) */}

      <AtlasMinimap map={activeMap} layers={activeMap.layers} />
    </>
  ) : null;

  return (
    <SoundSettingsProvider>
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        <a href="#atlas-main" className="skip-to-main">
          Skip to map
        </a>
        <header
          className={`atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border ${isV2 ? "flex-wrap md:flex-nowrap" : ""}`}
        >
          <AtlasNavMenu
            publishedAt={data.project.publishedAt}
            showCredits={showCredits}
            worldName={titleName}
          />
          {/* The name used to be `hidden sm:inline`, so a phone showed only the
              compass — someone opening a shared link couldn't see which world
              they were looking at. Truncate instead of hiding. */}
          <Link
            to="/"
            className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2 min-w-0"
            aria-label={isV2 ? "Home" : undefined}
          >
            <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
            {/* v2: the campaign's name is the chip beside it. */}
            {!isV2 && <span className="truncate max-w-[8.5rem] sm:max-w-none">{titleName}</span>}
          </Link>
          {isV2 && data.project.campaign && <CampaignChip name={data.project.campaign.name} />}
          {isV2 ? (
            <div className="order-last basis-full min-w-0 md:order-none md:basis-auto md:flex-1 md:pl-3">
              <MapBreadcrumb tree={data.tree} view={view} onGo={(v) => goView(v, "memory", true)} />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {!isV2 && activeMap && data.project.maps.length > 1 && (
            <Select
              value={activeMap.id}
              onValueChange={(id) => {
                setActiveMapId(id);
                setFlyTarget(null);
              }}
            >
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
          {activeMap?.grid && (
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
          <CalmModeToggle />
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
        {notFound && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground"
          >
            <span>{NOT_FOUND_NOTICE}</span>
            <button
              type="button"
              className="underline hover:text-foreground"
              onClick={() => setNotFound(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex-1 flex relative min-h-0">
          <main
            id="atlas-main"
            className="flex-1 relative min-h-0"
            aria-label={`Interactive map: ${activeMap?.name ?? "Ocean"}. Use arrow keys to pan, plus and minus to zoom.`}
          >
            {isV2 && (
              <AtlasCanvas
                tree={data.tree}
                view={view}
                camera={camera}
                className={rulerActive ? "atlas-ruler" : ""}
                onCameraChange={onCanvasCamera}
                onEnterMap={onCanvasEnterMap}
                onViewChange={onCanvasViewChange}
              >
                {mapLayers}
              </AtlasCanvas>
            )}
            {showLegend && (
              <div className="atlas-canvas-legend pointer-events-none absolute left-14 top-3 z-[500] rounded border border-border bg-background/85 px-2 py-1 text-xs text-muted-foreground">
                <span aria-hidden="true">▭</span> map: zoom in or click
              </div>
            )}
            {!isV2 && activeMap && (
              <>
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
                  <FitMapOnOpen
                    mapId={activeMap.id}
                    mapWidth={activeMap.width}
                    mapHeight={activeMap.height}
                    skip={flyTarget !== null}
                  />
                  <FitBoundsController
                    mapWidth={activeMap.width}
                    mapHeight={activeMap.height}
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
                  {mapLayers}
                </MapContainer>
              </>
            )}

            {activeMap && (
              <>
                <MapCreditOverlay
                  map={activeMap}
                  assetCredits={worldAssetCredits}
                  credits={worldCredits}
                  clearanceBottomPx={
                    12 /* minimap's own bottom-3 offset */ + minimapHeightFor(activeMap) + 8
                  }
                />

                {/* Pin legend — top-right map corner, collapsed by default */}
                <PinLegend placements={placementsOnMap} entityById={entityById} />

                <SoundControl
                  hasSoundscape={
                    activeMap.soundscape?.enabled !== false &&
                    (activeMap.soundscape?.areas?.length ?? 0) > 0
                  }
                />
              </>
            )}

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
            {activeMap && scaleBar && (
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
              onClick={() => (isV2 ? setCamera("fit") : fitMapRef.current?.())}
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
                onShowOnMap={(p) => showPlacement(p, true)}
                onPeek={(id, rect) => peekCtl.onTriggerEnter(id, rect)}
                onPeekLeave={peekCtl.onTriggerLeave}
                // Desktop only: the mobile sheet opens because an entity was
                // picked, so its empty state is never on screen.
                emptyState={
                  <ReadingPanelWelcome
                    worldName={titleName}
                    starters={starterEntries}
                    onOpenEntity={openEntity}
                  />
                }
                credits={worldCredits}
                assetCredits={worldAssetCredits}
                siteName={siteName}
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
                  showPlacement(p, true);
                  setMobilePanelOpen(false);
                }}
                onPeek={(id, rect) => peekCtl.onTriggerEnter(id, rect)}
                onPeekLeave={peekCtl.onTriggerLeave}
                credits={worldCredits}
                assetCredits={worldAssetCredits}
                siteName={siteName}
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
              placements={isV2 && !activeMap ? data.project.placements : placementsOnMap}
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
                  if (pl && isV2) {
                    showPlacement(pl, false);
                    openEntity(id, false);
                  } else if (pl) {
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
