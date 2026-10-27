/**
 * eval-19: the "Target publish path" field in MapLayerPanel never stores ""
 * and says when a typed path will be replaced by the default under maps/.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapLayerPanel } from "@/atlas/MapLayerPanel";
import type { LocalLayer } from "@/atlas/useMapLayers";
import type { MapDocument } from "@/atlas/content/schema";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const UPLOAD: LocalLayer = {
  id: "u1",
  src: "blob:local",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  opacity: 1,
  zIndex: 10,
  origin: "upload",
  filename: "Sea Chart.png",
  targetPath: "public/atlas/assets/maps/sea-chart.png",
};

const MAP = {
  id: "m1",
  worldId: "w1",
  name: "Map",
  width: 1000,
  height: 800,
  layers: [],
} as MapDocument;

function panel(layer: LocalLayer, onUpdate: (id: string, patch: Partial<LocalLayer>) => void) {
  return (
    <MapLayerPanel
      map={MAP}
      mergedLayers={[layer]}
      localLayers={[layer]}
      selectedId={layer.id}
      setSelectedId={vi.fn()}
      onAddFiles={vi.fn()}
      onAddUrl={vi.fn()}
      onEditBuiltin={vi.fn()}
      onUpdate={onUpdate}
      onDuplicate={vi.fn()}
      onRemove={vi.fn()}
      onClearAll={vi.fn()}
    />
  );
}

/** Render with the layer held in state, the way the editor feeds the panel. */
function renderPanel(initial: LocalLayer) {
  let layer = initial;
  const onUpdate = vi.fn((_id: string, patch: Partial<LocalLayer>) => {
    layer = { ...layer, ...patch };
    view.rerender(panel(layer, onUpdate));
  });
  const view = render(panel(layer, onUpdate));
  return { onUpdate, current: () => layer };
}

describe("MapLayerPanel target publish path", () => {
  it("clearing the field stores no path", () => {
    const { current } = renderPanel(UPLOAD);

    fireEvent.change(screen.getByDisplayValue(UPLOAD.targetPath!), { target: { value: "  " } });

    expect(current().targetPath).toBeUndefined();
  });

  it("typing a path outside maps/ shows a hint naming the path Save will use", () => {
    renderPanel(UPLOAD);
    expect(screen.queryByText(/Save will use/)).toBeNull();

    fireEvent.change(screen.getByDisplayValue(UPLOAD.targetPath!), {
      target: { value: "public/atlas/assets/images/sea.png" },
    });

    expect(screen.getByText(/Save will use/)).toBeInTheDocument();
    expect(screen.getByText("public/atlas/assets/maps/sea-chart.png")).toBeInTheDocument();
  });
});
