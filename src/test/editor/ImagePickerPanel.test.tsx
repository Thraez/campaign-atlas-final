import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImagePickerPanel } from "../../atlas/editor/ImagePickerPanel";

describe("ImagePickerPanel delete button keyboard reachability (N133)", () => {
  it("keeps the per-image delete button in the tab order (not display:none)", () => {
    render(
      <ImagePickerPanel
        images={["map-a.png"]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete map-a.png" });
    expect(deleteButton.className).not.toContain("hidden");

    deleteButton.focus();
    expect(deleteButton).toHaveFocus();
  });

  it("shows the delete button on group focus-within and on group hover, hidden otherwise via opacity", () => {
    render(
      <ImagePickerPanel
        images={["map-a.png"]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete map-a.png" });
    expect(deleteButton.className).toContain("opacity-0");
    expect(deleteButton.className).toContain("group-focus-within:opacity-100");
    expect(deleteButton.className).toContain("group-hover:opacity-100");
    expect(deleteButton.className).toContain("pointer-events-none");
    expect(deleteButton.className).toContain("group-focus-within:pointer-events-auto");
  });

  it("does not render a delete button when onDelete is not provided", () => {
    render(
      <ImagePickerPanel
        images={["map-a.png"]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Delete map-a.png" })).toBeNull();
  });
});
