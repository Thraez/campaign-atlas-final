import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PinLegend } from "@/atlas/pins/PinLegend";
import type { MapPlacement, Entity } from "@/atlas/content/schema";

function makePlacement(id: string, entityId: string, opts?: Partial<MapPlacement>): MapPlacement {
  return { id, entityId, mapId: "map1", x: 0, y: 0, visibility: "player", ...opts };
}

function makeEntity(id: string, type: string): Entity {
  return {
    id,
    type,
    title: id,
    visibility: "player",
    body: "",
    bodyHtml: "",
    links: [],
    backlinks: [],
    tags: [],
    aliases: [],
    images: [],
    relationships: [],
    placements: [],
  } as unknown as Entity;
}

describe("PinLegend", () => {
  it("renders nothing when there are no placements", () => {
    const { container } = render(
      <PinLegend placements={[]} entityById={new Map()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a collapsed toggle button when placements exist", () => {
    const placements = [makePlacement("p1", "e1")];
    const entityById = new Map([["e1", makeEntity("e1", "settlement")]]);
    render(<PinLegend placements={placements} entityById={entityById} />);
    const btn = screen.getByRole("button", { name: /expand pin legend/i });
    expect(btn).toBeInTheDocument();
    expect(screen.queryByText("Settlement")).toBeNull();
  });

  it("expands to show preset labels when toggle is clicked", () => {
    const placements = [makePlacement("p1", "e1")];
    const entityById = new Map([["e1", makeEntity("e1", "settlement")]]);
    render(<PinLegend placements={placements} entityById={entityById} />);
    fireEvent.click(screen.getByRole("button", { name: /expand pin legend/i }));
    expect(screen.getByText("Settlement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse pin legend/i })).toBeInTheDocument();
  });

  it("collapses again on second toggle click", () => {
    const placements = [makePlacement("p1", "e1")];
    const entityById = new Map([["e1", makeEntity("e1", "dungeon")]]);
    render(<PinLegend placements={placements} entityById={entityById} />);
    const btn = screen.getByRole("button", { name: /expand pin legend/i });
    fireEvent.click(btn);
    expect(screen.getByText("Dungeon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /collapse pin legend/i }));
    expect(screen.queryByText("Dungeon")).toBeNull();
  });

  it("deduplicates presets: two placements of the same type appear only once", () => {
    const placements = [makePlacement("p1", "e1"), makePlacement("p2", "e2")];
    const entityById = new Map([
      ["e1", makeEntity("e1", "settlement")],
      ["e2", makeEntity("e2", "settlement")],
    ]);
    render(<PinLegend placements={placements} entityById={entityById} />);
    fireEvent.click(screen.getByRole("button", { name: /expand pin legend/i }));
    const rows = screen.getAllByText("Settlement");
    expect(rows).toHaveLength(1);
  });

  it("shows multiple distinct presets when different types are present", () => {
    const placements = [
      makePlacement("p1", "e1"),
      makePlacement("p2", "e2"),
      makePlacement("p3", "e3"),
    ];
    const entityById = new Map([
      ["e1", makeEntity("e1", "settlement")],
      ["e2", makeEntity("e2", "dungeon")],
      ["e3", makeEntity("e3", "region")],
    ]);
    render(<PinLegend placements={placements} entityById={entityById} />);
    fireEvent.click(screen.getByRole("button", { name: /expand pin legend/i }));
    expect(screen.getByText("Settlement")).toBeInTheDocument();
    expect(screen.getByText("Dungeon")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
  });

  it("handles placements with an unknown entityId gracefully (falls back to custom preset)", () => {
    const placements = [makePlacement("p1", "missing")];
    const entityById = new Map<string, Entity>();
    render(<PinLegend placements={placements} entityById={entityById} />);
    // Should render without crashing — the custom preset fallback applies
    const btn = screen.getByRole("button", { name: /expand pin legend/i });
    expect(btn).toBeInTheDocument();
  });
});
