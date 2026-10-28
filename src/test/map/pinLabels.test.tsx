/**
 * Ticket 11 — permanent pin labels, decided once per zoom, still de-clutter the
 * way they did: of two pins closer than 70 screen px, the higher priority keeps
 * its permanent label, in every wrap copy; at a closer zoom both show.
 * Real Leaflet + react-leaflet in jsdom.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MapContainer } from "react-leaflet";
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

function permanentLabels() {
  return Array.from(document.querySelectorAll(".atlas-pin-label")).map((el) => el.textContent);
}

function renderAt(zoom: number) {
  return render(
    <MapContainer crs={FlatCRS} center={[500, 500]} zoom={zoom} style={{ width: 800, height: 600 }}>
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
}

// Mounts per zoom: react-leaflet fixes a Tooltip's `permanent` option when the
// tooltip is created, so a zoom change doesn't flip an already-mounted label.
describe("pin label de-cluttering", () => {
  it("keeps only the higher-priority label when two collide, in every copy", () => {
    renderAt(0);
    expect(permanentLabels()).toEqual(["Crown", "Crown", "Crown"]);
  });

  it("shows both once the zoom puts them far enough apart", () => {
    renderAt(2);
    expect(permanentLabels().sort()).toEqual([
      "Crown",
      "Crown",
      "Crown",
      "Hamlet",
      "Hamlet",
      "Hamlet",
    ]);
  });
});
