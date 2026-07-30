import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { Entity, MapDocument } from "@/atlas/content/schema";

// Custom Polygon mock that exposes the registered click handler (if any) as a
// data attribute + click listener, so tests can assert whether the region's
// onOpenEntity handler is wired up under different ruler states.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("./helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  return {
    ...base,
    Polygon: React.forwardRef<
      HTMLDivElement,
      {
        children?: React.ReactNode;
        eventHandlers?: { click?: () => void };
      }
    >(function PolygonMock({ children, eventHandlers }, ref) {
      return (
        <div
          data-leaflet="Polygon"
          data-has-click-handler={String(!!eventHandlers?.click)}
          onClick={() => eventHandlers?.click?.()}
          ref={ref}
        >
          {children}
        </div>
      );
    }),
  };
});

const { WrappedWorld } = await import("@/pages/AtlasViewer");

const ENTITY: Entity = {
  id: "region-ent-1",
  title: "Region Entity",
  type: "location",
  visibility: "player",
  aliases: [],
  tags: [],
  body: "",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "content/region-ent-1.md",
  links: [],
  backlinks: [],
  images: [],
};

const MAP: MapDocument = {
  id: "map-1",
  worldId: "world-1",
  name: "Test Map",
  width: 1000,
  height: 1000,
  layers: [],
  regions: [
    {
      id: "region-1",
      mapId: "map-1",
      name: "Test Region",
      entityId: "region-ent-1",
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      visibility: "player",
    },
  ],
};

function renderWorld(rulerActive: boolean | undefined, onOpenEntity = vi.fn()) {
  const utils = render(
    <WrappedWorld
      dx={0}
      map={MAP}
      placements={[]}
      entityById={new Map([["region-ent-1", ENTITY]])}
      showGrid={false}
      onOpenEntity={onOpenEntity}
      visited={new Set()}
      openId={null}
      rulerActive={rulerActive}
    />,
  );
  return { ...utils, onOpenEntity };
}

describe("N113 — region clicks vs. active ruler tool", () => {
  it("wires a click handler that opens the entity when the ruler is inactive", () => {
    const { container, onOpenEntity } = renderWorld(false);
    const polygon = container.querySelector('[data-leaflet="Polygon"]') as HTMLElement;
    expect(polygon.getAttribute("data-has-click-handler")).toBe("true");
    polygon.click();
    expect(onOpenEntity).toHaveBeenCalledWith("region-ent-1", false);
  });

  it("wires a click handler that opens the entity when rulerActive is omitted", () => {
    const { container, onOpenEntity } = renderWorld(undefined);
    const polygon = container.querySelector('[data-leaflet="Polygon"]') as HTMLElement;
    expect(polygon.getAttribute("data-has-click-handler")).toBe("true");
    polygon.click();
    expect(onOpenEntity).toHaveBeenCalledWith("region-ent-1", false);
  });

  it("does not wire an open-entity click handler while the ruler is active", () => {
    const { container, onOpenEntity } = renderWorld(true);
    const polygon = container.querySelector('[data-leaflet="Polygon"]') as HTMLElement;
    expect(polygon.getAttribute("data-has-click-handler")).toBe("false");
    polygon.click();
    expect(onOpenEntity).not.toHaveBeenCalled();
  });
});
