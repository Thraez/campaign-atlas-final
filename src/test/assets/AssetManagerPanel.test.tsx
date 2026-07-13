import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetManagerPanel } from "@/atlas/assets/AssetManagerPanel";
import { makeProject, makeEntity, makeMap, makeLayer } from "../helpers/makeProject";

function fixture() {
  return makeProject({
    entities: [makeEntity({ id: "a", images: ["assets/pics/a.png"] })],
    maps: [makeMap({ layers: [makeLayer({ id: "L1", src: "assets/maps/o.png" })] })],
  });
}

describe("AssetManagerPanel", () => {
  it("lists one row per asset with a credit input + toggle", () => {
    render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Show credit for assets/pics/a.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Credit for assets/maps/o.png")).toBeInTheDocument();
  });

  it("typing a credit calls onPatch with the updated registry entry", () => {
    const onPatch = vi.fn();
    render(<AssetManagerPanel project={fixture()} onPatch={onPatch} />);
    fireEvent.change(screen.getByLabelText("Credit for assets/pics/a.png"), {
      target: { value: "Art by A" },
    });
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ "assets/pics/a.png": { credit: "Art by A", enabled: false } }),
    );
  });

  it("toggling the switch on preserves the existing credit text", () => {
    const onPatch = vi.fn();
    render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{ "assets/pics/a.png": { credit: "Art by A", enabled: false } }}
        onPatch={onPatch}
      />,
    );
    const toggle = screen.getByLabelText("Show credit for assets/pics/a.png");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ "assets/pics/a.png": { credit: "Art by A", enabled: true } }),
    );
  });

  it("shows an empty state when there are no image assets", () => {
    const project = makeProject({
      entities: [makeEntity({ images: [] })],
      maps: [makeMap({ layers: [] })],
    });
    render(<AssetManagerPanel project={project} onPatch={vi.fn()} />);
    expect(screen.getByText(/no image assets/i)).toBeInTheDocument();
  });
});
