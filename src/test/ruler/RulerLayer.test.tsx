import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Capture the click handler registered via useMapEvents so tests can fire it.
const { capturedHandlers, measureCalls } = vi.hoisted(() => {
  const capturedHandlers = {
    click: null as
      | ((e: { latlng: { lng: number; lat: number } }) => void)
      | null,
  };
  const measureCalls: Array<{ x: number; y: number }[]> = [];
  return { capturedHandlers, measureCalls };
});

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import(
    "../helpers/reactLeafletMock"
  );
  const base = makeReactLeafletModule();
  const fakeMap = {
    ...base.useMap(),
    getContainer: () => document.createElement("div"),
  };
  return {
    ...base,
    useMap: () => fakeMap,
    useMapEvents: (
      handlers: Record<
        string,
        (e: { latlng: { lng: number; lat: number } }) => void
      >,
    ) => {
      capturedHandlers.click = handlers.click;
      return fakeMap;
    },
  };
});

// Render portals inline so screen queries find them in the component tree.
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("@/atlas/editor/mapClickCoord", () => ({
  mapClickToAtlasCoord: (lng: number, lat: number, mapHeight: number) => ({
    x: lng,
    y: mapHeight - lat,
  }),
}));

vi.mock("@/atlas/ruler/measureDistance", () => ({
  measureDistance: (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    measureCalls.push([p1, p2]);
    return { label: "5.0 mi", px: 100 };
  },
}));

// Import after mocks are set up.
const { RulerLayer } = await import("@/atlas/ruler/RulerLayer");

const click = (lng: number, lat: number) => {
  act(() => {
    capturedHandlers.click?.({ latlng: { lng, lat } });
  });
};

function renderRuler(active = true, onClear?: () => void, mapId = "map-1") {
  const { rerender } = render(
    <RulerLayer active={active} mapId={mapId} mapHeight={1000} onClear={onClear} />,
  );
  return { rerender };
}

describe("Q7 — RulerLayer: third-click reset, hint, Escape", () => {
  beforeEach(() => {
    capturedHandlers.click = null;
  });

  it("shows hint when active with no points placed", () => {
    renderRuler();
    expect(screen.getByTestId("ruler-hint")).toBeInTheDocument();
  });

  it("shows hint after first click (p1 set, p2 not yet placed)", () => {
    renderRuler();
    click(100, 900); // first click → p1
    expect(screen.getByTestId("ruler-hint")).toBeInTheDocument();
  });

  it("hides hint after second click (measurement complete)", () => {
    renderRuler();
    click(100, 900); // p1
    click(200, 800); // p2 → measurement done
    expect(screen.queryByTestId("ruler-hint")).not.toBeInTheDocument();
  });

  it("third click resets to a fresh measurement (hint shows again)", () => {
    renderRuler();
    click(100, 900); // p1
    click(200, 800); // p2
    expect(screen.queryByTestId("ruler-hint")).not.toBeInTheDocument();
    click(300, 700); // third click → new p1
    expect(screen.getByTestId("ruler-hint")).toBeInTheDocument();
  });

  it("Escape clears the measurement and restores the hint", () => {
    renderRuler();
    click(100, 900); // p1
    click(200, 800); // p2
    expect(screen.queryByTestId("ruler-hint")).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByTestId("ruler-hint")).toBeInTheDocument();
  });

  it("Escape calls onClear callback", () => {
    const onClear = vi.fn();
    renderRuler(true, onClear);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("does not show hint when ruler is inactive", () => {
    renderRuler(false);
    expect(screen.queryByTestId("ruler-hint")).not.toBeInTheDocument();
  });
});

describe("N116 — RulerLayer: wrap-around (wrapX) point placement", () => {
  beforeEach(() => {
    capturedHandlers.click = null;
    measureCalls.length = 0;
  });

  it("keeps a click on a wrapped copy at its clicked lng instead of snapping to the canonical tile", () => {
    render(<RulerLayer active mapId="map-1" mapHeight={1000} />);
    // On a wrapX map, Leaflet renders wrapped tile copies at dx = -width, 0, +width,
    // so a click on the left copy arrives with lng outside the canonical [0, width) range.
    click(-50, 900); // p1, wrapped copy
    click(30, 800); // p2, canonical copy

    expect(measureCalls).toHaveLength(1);
    const [p1, p2] = measureCalls[0];
    expect(p1.x).toBe(-50);
    expect(p2.x).toBe(30);
  });
});

describe("N114 — RulerLayer: reset on active map change", () => {
  beforeEach(() => {
    capturedHandlers.click = null;
  });

  it("clears an in-progress measurement when the active map changes", () => {
    const { rerender } = renderRuler(true, undefined, "map-1");
    click(100, 900); // p1
    click(200, 800); // p2
    expect(screen.getByText("5.0 mi")).toBeInTheDocument();
    expect(screen.queryByTestId("ruler-hint")).not.toBeInTheDocument();

    rerender(
      <RulerLayer active mapId="map-2" mapHeight={1000} />,
    );

    expect(screen.queryByText("5.0 mi")).not.toBeInTheDocument();
    expect(screen.getByTestId("ruler-hint")).toBeInTheDocument();
  });

  it("does not clear the measurement when re-rendering with the same map id", () => {
    const { rerender } = renderRuler(true, undefined, "map-1");
    click(100, 900); // p1
    click(200, 800); // p2
    expect(screen.getByText("5.0 mi")).toBeInTheDocument();

    rerender(
      <RulerLayer active mapId="map-1" mapHeight={1000} />,
    );

    expect(screen.getByText("5.0 mi")).toBeInTheDocument();
  });
});
