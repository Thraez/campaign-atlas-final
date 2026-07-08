/**
 * Tests for the layer-lock control in MapLayerPanel.
 *
 * Lock now lives on the layer model (persisted, per-layer) rather than a
 * panel-local useState. These verify the panel wiring:
 *   - locking a built-in promotes it to a local edit, then sets locked=true
 *   - a locked layer's Transform controls (nudge) no-op
 *   - the toggle flips back to unlock
 * The persistence + central geometry enforcement live in useMapLayers and are
 * covered by use-map-layers-undo.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapLayerPanel } from "@/atlas/MapLayerPanel";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const LAYER: MapLayer = {
  id: "l1",
  src: "atlas/assets/maps/base.png",
  x: 0,
  y: 0,
  width: 1000,
  height: 800,
  opacity: 1,
  zIndex: 10,
};

const MAP: MapDocument = {
  id: "m1",
  worldId: "w1",
  name: "Map",
  width: 1000,
  height: 800,
  layers: [LAYER],
} as MapDocument;

function renderPanel(overrides: {
  localLayers?: LocalLayer[];
  onUpdate?: (id: string, patch: Partial<LocalLayer>) => void;
  onEditBuiltin?: (id: string) => void;
}) {
  render(
    <MapLayerPanel
      map={MAP}
      mergedLayers={[LAYER]}
      localLayers={overrides.localLayers ?? []}
      selectedId="l1"
      setSelectedId={vi.fn()}
      onAddFiles={vi.fn()}
      onAddUrl={vi.fn()}
      onEditBuiltin={overrides.onEditBuiltin ?? vi.fn()}
      onUpdate={overrides.onUpdate ?? vi.fn()}
      onDuplicate={vi.fn()}
      onRemove={vi.fn()}
      onClearAll={vi.fn()}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MapLayerPanel — layer lock", () => {
  it("locking a built-in promotes it to a local edit then sets locked=true", () => {
    const onUpdate = vi.fn();
    const onEditBuiltin = vi.fn();
    renderPanel({ localLayers: [], onUpdate, onEditBuiltin });

    fireEvent.click(screen.getByRole("button", { name: "Lock layer" }));

    expect(onEditBuiltin).toHaveBeenCalledWith("l1");
    expect(onUpdate).toHaveBeenCalledWith("l1", { locked: true });
  });

  it("a locked layer shows the Unlock control and its Transform nudges no-op", () => {
    const onUpdate = vi.fn();
    renderPanel({
      localLayers: [{ ...LAYER, origin: "edit", locked: true }],
      onUpdate,
    });

    expect(screen.getByRole("button", { name: "Unlock layer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nudge layer right (±100)" }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("unlocking a locked layer sets locked=false", () => {
    const onUpdate = vi.fn();
    renderPanel({
      localLayers: [{ ...LAYER, origin: "edit", locked: true }],
      onUpdate,
    });

    fireEvent.click(screen.getByRole("button", { name: "Unlock layer" }));

    expect(onUpdate).toHaveBeenCalledWith("l1", { locked: false });
  });
});
