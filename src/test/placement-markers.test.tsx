import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { MapPlacement, Entity } from "@/atlas/content/schema";

// Custom Marker mock that exposes riseOnHover / riseOffset as data attributes
// so tests can assert the props are forwarded by PlacementMarkers.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("./helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  return {
    ...base,
    Marker: React.forwardRef<
      HTMLDivElement,
      {
        children?: React.ReactNode;
        riseOnHover?: boolean;
        riseOffset?: number;
      }
    >(function MarkerMock({ children, riseOnHover, riseOffset }, ref) {
      return (
        <div
          data-leaflet="Marker"
          data-rise-on-hover={String(riseOnHover ?? false)}
          data-rise-offset={String(riseOffset ?? 0)}
          ref={ref}
        >
          {children}
        </div>
      );
    }),
  };
});

const { PlacementMarkers } = await import("@/pages/AtlasViewer");

const ENTITY: Entity = {
  id: "loc-1",
  title: "Loc One",
  type: "location",
  visibility: "player",
  aliases: [],
  tags: [],
  body: "",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "content/loc-1.md",
  links: [],
  backlinks: [],
  images: [],
};

const PLACEMENT: MapPlacement = {
  id: "p-1",
  entityId: "loc-1",
  mapId: "map-1",
  x: 200,
  y: 300,
  visibility: "player",
};

function renderMarkers(placements: MapPlacement[] = [PLACEMENT]) {
  return render(
    <PlacementMarkers
      dx={0}
      H={1000}
      placements={placements}
      entityById={new Map([["loc-1", ENTITY]])}
      onOpenEntity={vi.fn()}
      visited={new Set()}
      openId={null}
    />,
  );
}

describe("Q8 — PlacementMarkers: riseOnHover on each Marker", () => {
  it("renders a Marker for the placement", () => {
    const { container } = renderMarkers();
    const marker = container.querySelector('[data-leaflet="Marker"]');
    expect(marker).not.toBeNull();
  });

  it("passes riseOnHover=true to each Marker", () => {
    const { container } = renderMarkers();
    const marker = container.querySelector('[data-leaflet="Marker"]');
    expect(marker?.getAttribute("data-rise-on-hover")).toBe("true");
  });

  it("passes a positive riseOffset to each Marker", () => {
    const { container } = renderMarkers();
    const marker = container.querySelector('[data-leaflet="Marker"]');
    const offset = Number(marker?.getAttribute("data-rise-offset") ?? 0);
    expect(offset).toBeGreaterThan(0);
  });

  it("applies riseOnHover to every Marker when multiple placements are given", () => {
    const p2: MapPlacement = {
      id: "p-2",
      entityId: "loc-1",
      mapId: "map-1",
      x: 400,
      y: 500,
      visibility: "player",
    };
    const { container } = renderMarkers([PLACEMENT, p2]);
    const markers = container.querySelectorAll('[data-leaflet="Marker"]');
    expect(markers).toHaveLength(2);
    markers.forEach((m) => {
      expect(m.getAttribute("data-rise-on-hover")).toBe("true");
    });
  });
});
