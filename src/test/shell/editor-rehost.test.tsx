// src/test/shell/editor-rehost.test.tsx
//
// Regression: verify the rail buttons exist and clicking one renders the panel.
// We test the shell wiring (EditorRail + EditorPanelHost) in isolation rather
// than mounting the full AtlasPlacementEditor (which requires Leaflet, providers,
// and a loaded atlas.json). This mirrors how EditorRail.test.tsx and
// EditorPanelHost.test.tsx are structured.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { EditorRail } from "@/atlas/shell/EditorRail";
import { EditorPanelHost } from "@/atlas/shell/EditorPanelHost";
import { buildRailItems } from "@/atlas/shell/railRegistry";

// Minimal harness that wires rail → panel host exactly as AtlasPlacementEditor
// will after the rehost: clicking a rail button sets activePanel; the host
// renders the corresponding content.
function ShellHarness() {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const selectPanel = (id: string) =>
    setActivePanel((cur) => (cur === id ? null : id));
  const dismissPanel = () => setActivePanel(null);

  const panels: Record<string, React.ReactNode> = {
    characters: <div>Characters panel</div>,
    locations: <div>Locations panel</div>,
    factions: <div>Factions panel</div>,
    events: <div>Events panel</div>,
    items: <div>Items panel</div>,
    lore: <div>Lore panel</div>,
    pins: <div>Pins panel</div>,
    regions: <div>Regions panel</div>,
    routes: <div>Routes panel</div>,
    fog: <div>Fog panel</div>,
    publish: <div>Publish panel</div>,
  };

  const railItems = buildRailItems({ panels, counts: { pins: 3 } });
  const active = railItems.find((i) => i.id === activePanel);

  return (
    <div style={{ display: "flex" }}>
      <EditorRail
        items={railItems}
        activeId={activePanel}
        onSelect={(id) => {
          if (id === "save") return; // save has no panel — handled by editor
          selectPanel(id);
        }}
      />
      <div style={{ position: "relative", flex: 1 }}>
        {/* map canvas placeholder */}
        <div data-testid="map-canvas">Map</div>
        <EditorPanelHost
          activeId={activePanel}
          title={active?.label ?? ""}
          onDismiss={dismissPanel}
        >
          {active?.panel}
        </EditorPanelHost>
      </div>
    </div>
  );
}

describe("editor shell rehost", () => {
  it("rail renders buttons for all content and map sections", () => {
    render(<ShellHarness />);
    for (const label of ["Characters", "Locations", "Factions", "Events", "Items", "Lore", "Pins", "Regions", "Routes", "Fog"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("no panel is open initially", () => {
    render(<ShellHarness />);
    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("clicking each former-tab button opens its panel", () => {
    render(<ShellHarness />);
    const cases: Array<[string, string]> = [
      ["Characters", "Characters panel"],
      ["Pins", "Pins panel"],
      ["Regions", "Regions panel"],
      ["Routes", "Routes panel"],
      ["Fog", "Fog panel"],
    ];
    for (const [btnLabel, panelText] of cases) {
      fireEvent.click(screen.getByRole("button", { name: btnLabel }));
      expect(screen.getByTestId("panel")).toBeInTheDocument();
      expect(screen.getByText(panelText)).toBeInTheDocument();
      // dismiss before next iteration
      fireEvent.click(screen.getByLabelText("Close panel"));
      expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
    }
  });

  it("clicking the active button again closes the panel (toggle)", () => {
    render(<ShellHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Pins" }));
    expect(screen.getByTestId("panel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pins" }));
    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });

  it("map canvas is always mounted regardless of panel state", () => {
    render(<ShellHarness />);
    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pins" }));
    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
  });

  it("pins badge count is visible", () => {
    render(<ShellHarness />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
