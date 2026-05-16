import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorRail } from "@/atlas/shell/EditorRail";
import { buildRailItems } from "@/atlas/shell/railRegistry";

const items = buildRailItems({ panels: {}, counts: { pins: 2 } });

describe("EditorRail", () => {
  it("renders a caption label and a tooltip-title with shortcut for each item", () => {
    render(<EditorRail items={items} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Characters")).toBeInTheDocument();
    const pins = screen.getByRole("button", { name: /Pins/ });
    expect(pins).toHaveAttribute("title", expect.stringContaining("P"));
  });

  it("renders a divider between content and map groups", () => {
    render(<EditorRail items={items} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId("rail-divider-map")).toBeInTheDocument();
  });

  it("shows a badge when count > 0", () => {
    render(<EditorRail items={items} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("calls onSelect with the item id on click", () => {
    const onSelect = vi.fn();
    render(<EditorRail items={items} activeId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Locations/ }));
    expect(onSelect).toHaveBeenCalledWith("locations");
  });
});
