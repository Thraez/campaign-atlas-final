import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AssetManagerPanel } from "@/atlas/assets/AssetManagerPanel";
import { makeProject, makeEntity, makeMap, makeLayer } from "../helpers/makeProject";

function fixture() {
  return makeProject({
    entities: [makeEntity({ id: "a", images: ["assets/pics/a.png"] })],
    maps: [makeMap({ layers: [makeLayer({ id: "L1", src: "assets/maps/o.png" })] })],
  });
}

// Default: a fetch that never resolves, so tests unrelated to asset-size
// fetching see no stray state update. Tests exercising the size feature
// override this with their own mock.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("shows the fetched size and an optimize hint for an oversize asset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([new Uint8Array(5 * 1024 * 1024)]),
      })),
    );
    render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/5\.00 MB/)).toHaveLength(2));
    expect(screen.getAllByText(/optimize this image/i)).toHaveLength(2);
    expect(screen.getAllByText(/over the 4 MB limit/i)).toHaveLength(2);
  });

  it("does not show a size or crash when the asset fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    expect(screen.queryByText(/MB|KB/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toBeInTheDocument();
  });
});
