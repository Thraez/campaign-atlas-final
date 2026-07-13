// src/test/settings/WorldDetailsPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldDetailsPanel } from "@/atlas/settings/WorldDetailsPanel";

describe("WorldDetailsPanel", () => {
  it("edits the world name with a plain label and emits a patch", () => {
    const onPatch = vi.fn();
    render(<WorldDetailsPanel world={{ name: "Astrath" }} onPatch={onPatch} />);
    expect(screen.getByText("World name")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("World name"), {
      target: { value: "Astrath Deeprealm" },
    });
    expect(onPatch).toHaveBeenCalledWith({ name: "Astrath Deeprealm" });
  });

  it("defaults both credit switches to on when credits is unset", () => {
    render(<WorldDetailsPanel world={{ name: "Astrath" }} onPatch={vi.fn()} />);
    expect(screen.getByLabelText("Show credit badges")).toBeChecked();
    expect(screen.getByLabelText("Publish credits page")).toBeChecked();
  });

  it("toggling credit badges off emits a credits patch (preserving page)", () => {
    const onPatch = vi.fn();
    render(
      <WorldDetailsPanel
        world={{ name: "Astrath", credits: { badges: true, page: true } }}
        onPatch={onPatch}
      />,
    );
    fireEvent.click(screen.getByLabelText("Show credit badges"));
    expect(onPatch).toHaveBeenCalledWith({ credits: { badges: false, page: true } });
  });
});
