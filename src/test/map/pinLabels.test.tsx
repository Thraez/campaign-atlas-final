/**
 * Tickets 11 and 20: permanent pin labels, decided once per zoom, de-clutter
 * the way they did: of two pins closer than 70 screen px, the higher priority
 * keeps its permanent label, in every wrap copy; at a closer zoom both show.
 * On one mounted map, each label's mode follows the zoom both ways.
 * Real Leaflet + react-leaflet in jsdom.
 */
import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { MapContainer } from "react-leaflet";
import L from "leaflet";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { FlatCRS } from "@/atlas/map/flatCRS";
import { WrappedWorld } from "@/atlas/map/WrappedWorld";
import { makeEntity, makeMap, makePlacement } from "../helpers/makeProject";

const entities = new Map<string, Entity>([
  ["capital", makeEntity({ id: "capital", title: "Crown", type: "capital" })],
  ["town", makeEntity({ id: "town", title: "Hamlet", type: "settlement" })],
]);
// 40 map units apart: 40 px at zoom 0, 160 px at zoom 2.
const placements: MapPlacement[] = [
  makePlacement({ id: "town@overview", entityId: "town", x: 540, y: 500 }),
  makePlacement({ id: "capital@overview", entityId: "capital", x: 500, y: 500 }),
];
const map = makeMap({ wrapX: true, layers: [] });

/** Text of the labels on screen (permanent ones; hover labels open only on hover). */
function shownLabels() {
  return Array.from(document.querySelectorAll(".atlas-pin-label"))
    .map((el) => el.textContent)
    .sort();
}

/** Each pin's bound label, with the entity title from the marker's `title` ("Crown, Capital"). */
function boundLabels(m: L.Map) {
  const out: { title: string; tooltip: L.Tooltip }[] = [];
  m.eachLayer((layer) => {
    const tooltip = layer instanceof L.Marker ? layer.getTooltip() : undefined;
    if (tooltip) out.push({ title: (layer as L.Marker).options.title!.split(",")[0], tooltip });
  });
  return out;
}

/** Each pin's label as `title:mode`. */
function labelModes(m: L.Map) {
  return boundLabels(m)
    .map(({ title, tooltip }) => `${title}:${tooltip.options.permanent ? "always" : "hover"}`)
    .sort();
}

/** The bound Tooltip objects of one pin (one per wrap copy). */
function tooltipsOf(m: L.Map, title: string) {
  return boundLabels(m)
    .filter((b) => b.title === title)
    .map((b) => b.tooltip);
}

/** Mounts the map once, with all three wrap copies; returns the Leaflet map. */
function renderMap(zoom: number): L.Map {
  let leaflet: L.Map | null = null;
  render(
    <MapContainer
      ref={(m) => {
        if (m) leaflet = m;
      }}
      crs={FlatCRS}
      center={[500, 500]}
      zoom={zoom}
      style={{ width: 800, height: 600 }}
    >
      {[-map.width, 0, map.width].map((dx) => (
        <WrappedWorld
          key={dx}
          dx={dx}
          map={map}
          placements={placements}
          entityById={entities}
          showGrid={null}
          onOpenEntity={() => {}}
          visited={new Set()}
          openId={null}
        />
      ))}
    </MapContainer>,
  );
  if (!leaflet) throw new Error("map not created");
  return leaflet;
}

function zoomTo(m: L.Map, zoom: number) {
  act(() => {
    m.setZoom(zoom, { animate: false });
  });
}

const x3 = (s: string) => [s, s, s];

describe("pin label de-cluttering", () => {
  it("each label's mode follows the zoom, in and out, on one mounted map", () => {
    const m = renderMap(0);
    const collided = [...x3("Crown:always"), ...x3("Hamlet:hover")];
    const apart = [...x3("Crown:always"), ...x3("Hamlet:always")];
    // Colliding: the higher priority keeps its permanent label, in every copy.
    expect(labelModes(m)).toEqual(collided);
    expect(shownLabels()).toEqual(x3("Crown"));
    const crown = tooltipsOf(m, "Crown");
    expect(crown).toHaveLength(3);

    // Far enough apart: both show.
    zoomTo(m, 2);
    expect(labelModes(m)).toEqual(apart);
    expect(shownLabels()).toEqual([...x3("Crown"), ...x3("Hamlet")]);

    zoomTo(m, 0);
    expect(labelModes(m)).toEqual(collided);
    expect(shownLabels()).toEqual(x3("Crown"));

    // Crown's decision never changed, so its labels were never rebuilt.
    const after = tooltipsOf(m, "Crown");
    expect(after).toHaveLength(3);
    after.forEach((t) => expect(crown).toContain(t));
  });
});
