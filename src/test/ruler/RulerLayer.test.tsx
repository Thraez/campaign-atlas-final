import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Capture the click handler registered via useMapEvents so tests can fire it.
const { capturedHandlers } = vi.hoisted(() => {
  const capturedHandlers = {
    click: null as
      | ((e: { latlng: { lng: number; lat: number } }) => void)
      | null,
  };
  return { capturedHandlers };
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
  measureDistance: () => ({ label: "5.0 mi", px: 100 }),
}));

// Import after mocks are set up.
const { RulerLayer } = await import("@/atlas/ruler/RulerLayer");

const click = (lng: number, lat: number) => {
  act(() => {
    capturedHandlers.click?.({ latlng: { lng, lat } });
  });
};

function renderRuler(active = true, onClear?: () => void) {
  const { rerender } = render(
    <RulerLayer active={active} mapHeight={1000} onClear={onClear} />,
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
