import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, useMap, useMapEvents, Popup, Polygon, Polyline, Circle, SVGOverlay, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { useAtlas, isVisibleInPlayer } from "@/atlas/store";
import { w2ll, ll2w, worldBounds, worldDistance, worldUnitsToKm, normalizeLayerFrame, shortestPathSegments } from "@/atlas/coords";
import { Pin, MapLayer } from "@/atlas/types";
import { MinimapBridge } from "@/atlas/Minimap";

// Custom flat CRS. The world is flat (not a globe). We downscale internal
// coordinates by WORLD_SCALE so Leaflet's pixel math stays within float
// precision even at high zoom. Without this, large worlds (e.g. 200k units)
// produce visible skew/rotation/stretching of ImageOverlays when zoomed in.
const WORLD_SCALE = 1 / 256;
const FlatCRS = L.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(WORLD_SCALE, 0, -WORLD_SCALE, 0),
}) as L.CRS;

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}

const PIN_GLYPH: Record<string, string> = {
  city: "◆", town: "●", village: "⌂", capital: "♛", fortress: "▣",
  ruin: "⌁", dungeon: "⚔", cave: "◒", temple: "△", divine_site: "✦",
  resonance_site: "◈", faction_base: "⚑", black_market: "◇", npc: "◎",
  shop: "◧", wilderness_landmark: "▲", portal: "◉", mystery: "?",
  resource_deposit: "⬡", player_base: "⌂", battle_site: "×", custom: "•",
};

function pinIcon(p: Pin, selected = false) {
  const inner = p.icon
    ? `<img src="${p.icon}" alt="" draggable="false" />`
    : `<span class="atlas-pin-glyph">${PIN_GLYPH[p.type] ?? "📍"}</span>`;
  return L.divIcon({
    className: "",
    html: `<div class="atlas-pin-wrap${selected ? ' is-selected' : ''}" title="${p.name.replace(/"/g, '&quot;')}">
      <div class="atlas-pin">${inner}</div>
      <div class="atlas-pin-tail"></div>
      <div class="atlas-pin-label">${p.name.replace(/</g, '&lt;')}</div>
    </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
    popupAnchor: [0, -34],
  });
}

function partyIcon(color = "#f4c95d", name = "Party", selected = false) {
  return L.divIcon({
    className: "",
    html: `<div class="atlas-pin-wrap${selected ? ' is-selected' : ''}" title="${name.replace(/"/g, '&quot;')}">
      <div class="atlas-pin party"${color ? ` style="--party-color:${color}"` : ''}><span class="atlas-pin-glyph">✦</span></div>
      <div class="atlas-pin-tail"></div>
      <div class="atlas-pin-label">${name.replace(/</g, '&lt;')}</div>
    </div>`,
    iconSize: [38, 46],
    iconAnchor: [19, 42],
    popupAnchor: [0, -38],
  });
}

function layerHandleIcon(label: string, kind: "move" | "resize") {
  const glyph = kind === "move" ? "✥" : "⤡";
  return L.divIcon({
    className: "",
    html: `<div class="atlas-layer-handle ${kind}" title="${label}">${glyph}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function MapController() {
  const world = useAtlas((s) => s.atlas.world);
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(worldBounds(world));
    const minZ = Math.min(world.minZoom, world.maxZoom);
    const maxZ = Math.max(world.maxZoom, minZ);
    map.setMinZoom(minZ);
    map.setMaxZoom(maxZ);
    map.setMaxBounds(bounds);
    const cur = map.getZoom();
    if (cur < minZ) map.setZoom(minZ, { animate: false });
    else if (cur > maxZ) map.setZoom(maxZ, { animate: false });
  }, [world, map]);
  return null;
}

function SmoothWheelZoom() {
  const map = useMap();
  const wheelRef = useRef<{ target: number; point: L.Point | null; frame: number | null }>({ target: 0, point: null, frame: null });

  useEffect(() => {
    const container = map.getContainer();
    const wheelState = wheelRef.current;
    map.scrollWheelZoom.disable();
    wheelState.target = map.getZoom();

    const tick = () => {
      const state = wheelState;
      const zoom = map.getZoom();
      const diff = state.target - zoom;
      if (!state.point || Math.abs(diff) < 0.002) {
        if (state.point) map.setZoomAround(state.point, state.target, { animate: false });
        state.frame = null;
        return;
      }
      const nextZoom = zoom + diff * 0.24;
      map.setZoomAround(state.point, nextZoom, { animate: false });
      state.frame = window.requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
      const state = wheelState;
      const min = map.getMinZoom();
      const max = map.getMaxZoom();
      const impulse = -(event.deltaY * modeScale) / 520;
      const base = state.frame == null ? map.getZoom() : state.target;
      state.target = Math.max(min, Math.min(max, base + impulse));
      state.point = map.mouseEventToContainerPoint(event as MouseEvent);
      if (state.frame == null) state.frame = window.requestAnimationFrame(tick);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
      const { frame } = wheelState;
      if (frame != null) window.cancelAnimationFrame(frame);
      wheelState.frame = null;
      wheelState.target = map.getZoom();
    };
  }, [map]);
  return null;
}

type MapLayerWorld = Parameters<typeof w2ll>[0];
type LayerFrame = Pick<MapLayer, "x" | "y" | "width" | "height">;

function layerFrameToPaneRect(map: L.Map, world: MapLayerWorld, frame: LayerFrame) {
  const topLeft = map.latLngToLayerPoint(w2ll(world, frame.x, frame.y));
  const bottomRight = map.latLngToLayerPoint(w2ll(world, frame.x + frame.width, frame.y + frame.height));
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);
  return { x, y, width: Math.abs(bottomRight.x - topLeft.x), height: Math.abs(bottomRight.y - topLeft.y) };
}

function ClickHandler({
  draftPoints, setDraftPoints, measurePoints, setMeasurePoints,
}: {
  draftPoints: [number, number][]; setDraftPoints: (p: [number, number][]) => void;
  measurePoints: [number, number][]; setMeasurePoints: (p: [number, number][]) => void;
}) {
  const tool = useAtlas((s) => s.tool);
  const world = useAtlas((s) => s.atlas.world);
  const addPin = useAtlas((s) => s.addPin);
  const setTool = useAtlas((s) => s.setTool);
  const select = useAtlas((s) => s.select);
  const addFogReveal = useAtlas((s) => s.addFogReveal);

  useMapEvents({
    click(e) {
      const [x, y] = ll2w(world, e.latlng.lat, e.latlng.lng);
      if (tool === "addPin") {
        const id = `pin-${Date.now()}`;
        addPin({ id, type: "custom", name: "New Pin", x, y, visibility: "dm" });
        select(id); setTool("select"); return;
      }
      if (tool === "drawRegion" || tool === "drawRoute") {
        setDraftPoints([...draftPoints, [x, y]]);
        return;
      }
      if (tool === "measure") {
        if (measurePoints.length >= 2) setMeasurePoints([[x, y]]);
        else setMeasurePoints([...measurePoints, [x, y]]);
        return;
      }
      if (tool === "revealFog") {
        addFogReveal({ id: `fog-${Date.now()}`, shape: "circle", x, y, radius: 8000, revealLevel: "visited" });
        return;
      }
      select(null);
    },
  });
  return null;
}

function FogLayer() {
  const world = useAtlas((s) => s.atlas.world);
  const fog = useAtlas((s) => s.atlas.fog);
  // Render an SVG mask covering the world. Reveals are punched out as black holes.
  const sw = w2ll(world, 0, world.height);
  const ne = w2ll(world, world.width, 0);
  const overlayBounds: [[number, number], [number, number]] = [
    [sw[0], sw[1]], [ne[0], ne[1]],
  ];
  const W = world.width, H = world.height;
  return (
    <SVGOverlay bounds={overlayBounds} attributes={{ viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", style: "pointer-events:none" }}>
      <defs>
        <mask id="fog-mask">
          <rect x={0} y={0} width={W} height={H} fill="white" />
          {fog.revealedRegions.map((r) => r.shape === "circle" && r.x != null && r.y != null ? (
            <circle key={r.id} cx={r.x} cy={r.y} r={r.radius || 5000} fill="black" />
          ) : null)}
        </mask>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="rgba(8,12,20,0.85)" mask="url(#fog-mask)" />
    </SVGOverlay>
  );
}

export function AtlasMap() {
  const atlas = useAtlas((s) => s.atlas);
  const view = useAtlas((s) => s.view);
  const select = useAtlas((s) => s.select);
  const moveParty = useAtlas((s) => s.moveParty);
  const updatePin = useAtlas((s) => s.updatePin);
  const updateLayer = useAtlas((s) => s.updateLayer);
  const selectedId = useAtlas((s) => s.selectedId);
  const tool = useAtlas((s) => s.tool);
  const setTool = useAtlas((s) => s.setTool);
  const addRegion = useAtlas((s) => s.addRegion);
  const addRoute = useAtlas((s) => s.addRoute);
  const deleteRegion = useAtlas((s) => s.deleteRegion);
  const deleteRoute = useAtlas((s) => s.deleteRoute);
  const addRelation = useAtlas((s) => s.addRelation);
  const deleteRelation = useAtlas((s) => s.deleteRelation);

  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [relationFromId, setRelationFromId] = useState<string | null>(null);

  useEffect(() => {
    setDraftPoints([]);
    if (tool !== "measure") setMeasurePoints([]);
    if (tool !== "addRelation") setRelationFromId(null);
  }, [tool]);

  const finishDraft = () => {
    if (draftPoints.length < 2) { setDraftPoints([]); return; }
    if (tool === "drawRegion" && draftPoints.length >= 3) {
      addRegion({
        id: `region-${Date.now()}`, type: "area", name: "New Region", shape: "polygon",
        points: draftPoints, fillColor: "#f4c95d", borderColor: "#f4c95d", opacity: 0.25, visibility: "public",
      });
    } else if (tool === "drawRoute") {
      addRoute({
        id: `route-${Date.now()}`, name: "New Route", points: draftPoints,
        color: "#f4c95d", style: "solid", visibility: "public",
      });
    }
    setDraftPoints([]);
    setTool("select");
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (tool === "drawRegion" || tool === "drawRoute") {
        if (e.key === "Escape") { setDraftPoints([]); setTool("select"); }
        else if (e.key === "Enter") finishDraft();
      } else if (tool === "addRelation" && e.key === "Escape") {
        setRelationFromId(null); setTool("select");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line
  }, [tool, draftPoints]);

  const { world, layers, pins, party, regions, routes, relations, fog } = atlas;
  const bounds = useMemo(() => worldBounds(world), [world]);

  const visibleLayers = layers
    .filter((l) => view === "dm" || isVisibleInPlayer(l.visibility))
    .sort((a, b) => a.zIndex - b.zIndex);
  const visiblePins = pins.filter((p) => view === "dm" || isVisibleInPlayer(p.visibility));
  const visibleRegions = regions.filter((r) => view === "dm" || isVisibleInPlayer(r.visibility));
  const visibleRoutes = (routes ?? []).filter((r) => view === "dm" || isVisibleInPlayer(r.visibility));
  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);
  const visibleRelations = (relations ?? []).filter((r) => {
    if (view !== "dm" && !isVisibleInPlayer(r.visibility)) return false;
    const a = pinById.get(r.from); const b = pinById.get(r.to);
    if (!a || !b) return false;
    if (view !== "dm" && (!isVisibleInPlayer(a.visibility) || !isVisibleInPlayer(b.visibility))) return false;
    return true;
  });

  const measureKm = measurePoints.length === 2
    ? worldUnitsToKm(world, worldDistance(world, measurePoints[0][0], measurePoints[0][1], measurePoints[1][0], measurePoints[1][1]))
    : 0;
  const speedKmPerDay = atlas.travelSpeeds.unit === "km_per_day"
    ? atlas.travelSpeeds.normal
    : atlas.travelSpeeds.normal * 1.60934;
  const measureDays = measureKm > 0 ? measureKm / speedKmPerDay : 0;
  const selectLayer = useCallback((id: string) => select(id), [select]);
  const moveLayer = useCallback((id: string, x: number, y: number) => updateLayer(id, { x, y }), [updateLayer]);

  return (
    <>
    {(tool === "drawRegion" || tool === "drawRoute") && (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 border border-border rounded px-3 py-1.5 text-xs flex items-center gap-2 shadow">
        <span>Click to add points • Enter to finish • Esc to cancel</span>
        <button className="text-primary" onClick={finishDraft}>Finish</button>
      </div>
    )}
    {tool === "measure" && measurePoints.length === 2 && (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 border border-border rounded px-3 py-1.5 text-xs shadow">
        Distance: <strong>{measureKm.toFixed(1)} km</strong> · ~{measureDays.toFixed(1)} days at normal pace
      </div>
    )}
    {tool === "addRelation" && (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 border border-border rounded px-3 py-1.5 text-xs flex items-center gap-2 shadow">
        <span>{relationFromId ? "Click the second pin to link" : "Click the first pin to start a relation"} • Esc to cancel</span>
        {relationFromId && <button className="text-primary" onClick={() => setRelationFromId(null)}>Reset</button>}
      </div>
    )}
    <MapContainer
      crs={FlatCRS}
      bounds={bounds}
      maxBoundsViscosity={1.0}
      zoomSnap={0}
      zoomDelta={0.25}
      wheelPxPerZoomLevel={120}
      wheelDebounceTime={0}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      inertia={false}
      worldCopyJump={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      style={{ position: "absolute", inset: 0, background: world.oceanColor }}
      attributionControl={false}
    >
      <MapController />
      <SmoothWheelZoom />
      <ClickHandler
        draftPoints={draftPoints} setDraftPoints={setDraftPoints}
        measurePoints={measurePoints} setMeasurePoints={setMeasurePoints}
      />

      {visibleRegions.map((r) => r.shape === "polygon" && r.points && (
        <Polygon
          key={r.id}
          positions={r.points.map(([x, y]) => w2ll(world, x, y))}
          pathOptions={{ color: r.borderColor, fillColor: r.fillColor, fillOpacity: r.opacity, weight: 2 }}
          eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); select(r.id); } }}
        >
          <Popup>
            <strong>{r.name}</strong>
            {view === "dm" && <div><button onClick={() => deleteRegion(r.id)}>Delete</button></div>}
          </Popup>
        </Polygon>
      ))}

      {visibleRoutes.map((r) => (
        <Polyline
          key={r.id}
          positions={r.points.map(([x, y]) => w2ll(world, x, y))}
          pathOptions={{
            color: r.color || "#f4c95d", weight: 3,
            dashArray: r.style === "dashed" ? "8,6" : r.style === "dotted" ? "2,6" : undefined,
          }}
          eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); select(r.id); } }}
        >
          <Popup>
            <strong>{r.name}</strong>
            {view === "dm" && <div><button onClick={() => deleteRoute(r.id)}>Delete</button></div>}
          </Popup>
        </Polyline>
      ))}

      {visibleRelations.map((r) => {
        const a = pinById.get(r.from)!;
        const b = pinById.get(r.to)!;
        const segs = shortestPathSegments(world, a.x, a.y, b.x, b.y);
        const color = r.color || "#7fd1ff";
        const dashArray = r.lineStyle === "dashed" ? "8,6" : r.lineStyle === "dotted" ? "2,6" : undefined;
        return (
          <div key={r.id}>
            {segs.map((seg, i) => (
              <Polyline
                key={i}
                positions={seg.map(([x, y]) => w2ll(world, x, y))}
                pathOptions={{ color, weight: 2.5, dashArray, opacity: selectedId === r.id ? 1 : 0.85 }}
                eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); select(r.id); } }}
              >
                <Popup>
                  <strong>{r.label || r.type}</strong>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{a.name} ↔ {b.name}</div>
                  {r.description && <p style={{ marginTop: 6 }}>{r.description}</p>}
                  {view === "dm" && <div><button onClick={() => deleteRelation(r.id)}>Delete</button></div>}
                </Popup>
              </Polyline>
            ))}
          </div>
        );
      })}

      {(tool === "drawRegion" || tool === "drawRoute") && draftPoints.length > 0 && (
        <>
          {tool === "drawRegion" && draftPoints.length >= 3 ? (
            <Polygon positions={draftPoints.map(([x, y]) => w2ll(world, x, y))}
              pathOptions={{ color: "#f4c95d", dashArray: "4,4", fillOpacity: 0.15 }} />
          ) : (
            <Polyline positions={draftPoints.map(([x, y]) => w2ll(world, x, y))}
              pathOptions={{ color: "#f4c95d", dashArray: "4,4", weight: 2 }} />
          )}
          {draftPoints.map(([x, y], i) => (
            <CircleMarker key={i} center={w2ll(world, x, y)} radius={4}
              pathOptions={{ color: "#f4c95d", fillColor: "#f4c95d", fillOpacity: 1 }} />
          ))}
        </>
      )}

      {measurePoints.length >= 1 && (
        <>
          {measurePoints.map(([x, y], i) => (
            <CircleMarker key={i} center={w2ll(world, x, y)} radius={5}
              pathOptions={{ color: "#fff", fillColor: "#f4c95d", fillOpacity: 1 }} />
          ))}
          {measurePoints.length === 2 && (
            <Polyline positions={measurePoints.map(([x, y]) => w2ll(world, x, y))}
              pathOptions={{ color: "#fff", weight: 2, dashArray: "6,4" }} />
          )}
        </>
      )}

      {view === "dm" && fog.revealedRegions.map((r) => r.shape === "circle" && r.x != null && r.y != null && (
        <Circle key={r.id} center={w2ll(world, r.x, r.y)} radius={r.radius || 5000}
          pathOptions={{ color: "#7fd1ff", fillOpacity: 0.05, dashArray: "4,4" }} />
      ))}

      {visibleLayers.map((l) => (
        <DraggableImageLayer
          key={l.id}
          layer={l}
          isSelected={selectedId === l.id}
          interactiveDM={view === "dm"}
          onSelect={selectLayer}
          onMove={moveLayer}
        />
      ))}

      {/* Layer drag/resize handles (DM only, when selected and unlocked) */}
      {view === "dm" && visibleLayers.map((l) => {
        if (selectedId !== l.id || l.locked) return null;
        const center = w2ll(world, l.x + l.width / 2, l.y + l.height / 2);
        const corner = w2ll(world, l.x + l.width, l.y); // bottom-right corner in world
        return (
          <div key={`handles-${l.id}`}>
            <Marker
              position={center}
              icon={layerHandleIcon(`Move ${l.name}`, "move")}
              draggable
              eventHandlers={{
                drag: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  const [cx, cy] = ll2w(world, ll.lat, ll.lng);
                  updateLayer(l.id, { x: cx - l.width / 2, y: cy - l.height / 2 });
                },
              }}
            />
            <Marker
              position={corner}
              icon={layerHandleIcon(`Resize ${l.name}`, "resize")}
              draggable
              eventHandlers={{
                drag: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  const [bx, by] = ll2w(world, ll.lat, ll.lng);
                  updateLayer(l.id, {
                    width: Math.max(100, bx - l.x),
                    height: Math.max(100, by - l.y),
                  });
                },
              }}
            />
          </div>
        );
      })}

      {visiblePins.map((p) => (
        <Marker
          key={p.id}
          position={w2ll(world, p.x, p.y)}
          icon={pinIcon(p, selectedId === p.id)}
          draggable={view === "dm"}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              if (tool === "addRelation") {
                if (!relationFromId) { setRelationFromId(p.id); return; }
                if (relationFromId === p.id) { setRelationFromId(null); return; }
                const id = `rel-${Date.now()}`;
                addRelation({
                  id, from: relationFromId, to: p.id, type: "road",
                  visibility: "public", lineStyle: "solid", color: "#7fd1ff",
                  label: "New relation",
                });
                setRelationFromId(null);
                setTool("select");
                select(id);
                return;
              }
              select(p.id);
            },
            dragend: (e) => {
              const m = e.target as L.Marker;
              const ll = m.getLatLng();
              const [x, y] = ll2w(world, ll.lat, ll.lng);
              updatePin(p.id, { x, y });
            },
          }}
        >
          <Popup>
            <strong>{p.name}</strong>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{p.type}</div>
            {(view === "dm" ? p.dmDescription : p.playerDescription) && (
              <p style={{ marginTop: 6 }}>{view === "dm" ? p.dmDescription : p.playerDescription}</p>
            )}
          </Popup>
        </Marker>
      ))}

      {party.visible !== false && (
        <Marker
          position={w2ll(world, party.x, party.y)}
          icon={partyIcon(party.color, party.name, selectedId === party.id)}
          draggable={view === "dm"}
          eventHandlers={{
            click: (e) => { L.DomEvent.stopPropagation(e); select(party.id); },
            dragend: (e) => {
              const m = e.target as L.Marker;
              const ll = m.getLatLng();
              const [x, y] = ll2w(world, ll.lat, ll.lng);
              moveParty(x, y);
            },
          }}
        >
          <Popup><strong>{party.name}</strong></Popup>
        </Marker>
      )}
      <MinimapBridge />
      {view === "player" && fog.mode === "player" && <FogLayer />}
    </MapContainer>
    </>
  );
}

// Draggable image overlay. Click to select; when selected & unlocked in DM view,
// drag the image directly. Pixel deltas are translated to world units via the
// map's projection so movement tracks the cursor exactly at any zoom.
function DraggableImageLayer({
  layer, isSelected, interactiveDM, onSelect, onMove,
}: {
  layer: MapLayer;
  isSelected: boolean;
  interactiveDM: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const map = useMap();
  const world = useAtlas((s) => s.atlas.world);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const layerRef = useLatest(layer);
  const onSelectRef = useLatest(onSelect);
  const onMoveRef = useLatest(onMove);

  useEffect(() => {
    setPane(map.getPane("overlayPane") ?? null);
  }, [map]);

  useEffect(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;
    const frame = layerRef.current;
    const rect = layerFrameToPaneRect(map, world, frame);
    container.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;
    container.style.zIndex = String(frame.zIndex);
    container.style.opacity = String(frame.opacity);
    container.classList.toggle("atlas-layer-selected", isSelected);
    img.src = frame.src;
  }, [map, world, layer.x, layer.y, layer.width, layer.height, layer.opacity, layer.zIndex, layer.src, isSelected, layerRef]);

  useEffect(() => {
    const updateFrame = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = layerFrameToPaneRect(map, world, layerRef.current);
      container.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      container.style.width = `${rect.width}px`;
      container.style.height = `${rect.height}px`;
    };
    map.on("move zoom resize viewreset", updateFrame);
    updateFrame();
    return () => { map.off("move zoom resize viewreset", updateFrame); };
  }, [map, world, layerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const draggable = interactiveDM && !layer.locked;
    el.style.cursor = draggable ? "grab" : "default";
    el.style.pointerEvents = interactiveDM ? "auto" : "none";
    const onClick = (ev: MouseEvent) => { ev.stopPropagation(); onSelectRef.current(layerRef.current.id); };
    el.addEventListener("click", onClick);
    if (!draggable) return () => el.removeEventListener("click", onClick);

    let drag: { pointerId: number; startClient: L.Point; startFrame: LayerFrame; nextFrame: LayerFrame; frame: number | null } | null = null;

    const applyVisualFrame = () => {
      if (!drag) return;
      drag.frame = null;
      const rect = layerFrameToPaneRect(map, world, drag.nextFrame);
      el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const current = layerRef.current;
      onSelectRef.current(current.id);
      const startFrame = { x: current.x, y: current.y, width: current.width, height: current.height };
      drag = { pointerId: ev.pointerId, startClient: L.point(ev.clientX, ev.clientY), startFrame, nextFrame: startFrame, frame: null };
      el.setPointerCapture(ev.pointerId);
      el.style.cursor = "grabbing";
      map.dragging.disable();
    };
    const onMoveEv = (ev: PointerEvent) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dxPx = ev.clientX - drag.startClient.x;
      const dyPx = ev.clientY - drag.startClient.y;
      const origin = map.containerPointToLatLng(L.point(0, 0));
      const moved = map.containerPointToLatLng(L.point(dxPx, dyPx));
      const [wx0, wy0] = ll2w(world, origin.lat, origin.lng);
      const [wx1, wy1] = ll2w(world, moved.lat, moved.lng);
      drag.nextFrame = normalizeLayerFrame(world, {
        ...drag.startFrame,
        x: drag.startFrame.x + (wx1 - wx0),
        y: drag.startFrame.y + (wy1 - wy0),
      });
      if (drag.frame == null) drag.frame = window.requestAnimationFrame(applyVisualFrame);
    };
    const onUp = (ev: PointerEvent) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const finalFrame = drag.nextFrame;
      if (drag.frame != null) window.cancelAnimationFrame(drag.frame);
      const rect = layerFrameToPaneRect(map, world, finalFrame);
      el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      onMoveRef.current(layerRef.current.id, finalFrame.x, finalFrame.y);
      drag = null;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      el.style.cursor = "grab";
      map.dragging.enable();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMoveEv);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMoveEv);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick);
      if (drag?.frame != null) window.cancelAnimationFrame(drag.frame);
      map.dragging.enable();
    };
  }, [map, world, layer.locked, interactiveDM, layerRef, onMoveRef, onSelectRef]);

  const layerNode = (
    <div ref={containerRef} className="atlas-image-layer" role="presentation">
      <img ref={imgRef} alt="" draggable="false" />
    </div>
  );
  return pane ? createPortal(layerNode, pane) : null;
}

