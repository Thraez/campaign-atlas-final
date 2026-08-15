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
    await waitFor(() =>
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/MB|KB/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toBeInTheDocument();
  });

  it("reflects an external assetCredits update in the controlled credit input", () => {
    const { rerender } = render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{ "assets/pics/a.png": { credit: "", enabled: false } }}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toHaveValue("");
    rerender(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{ "assets/pics/a.png": { credit: "Applied by bulk action", enabled: false } }}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toHaveValue(
      "Applied by bulk action",
    );
  });

  it("'apply to all' copies one row's credit onto every asset, preserving each enabled state", () => {
    const onPatch = vi.fn();
    render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{
          "assets/pics/a.png": { credit: "Art by A", enabled: true },
          "assets/maps/o.png": { credit: "", enabled: false },
        }}
        onPatch={onPatch}
      />,
    );
    // Row order follows collectAssets: entity images first, so index 0 is "assets/pics/a.png".
    fireEvent.click(screen.getAllByRole("button", { name: "Apply to all" })[0]);
    expect(onPatch).toHaveBeenCalledWith({
      "assets/pics/a.png": { credit: "Art by A", enabled: true },
      "assets/maps/o.png": { credit: "Art by A", enabled: false },
    });
  });

  it("'enable all badges' flips every asset's enabled flag on, preserving credit text", () => {
    const onPatch = vi.fn();
    render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{
          "assets/pics/a.png": { credit: "Art by A", enabled: false },
          "assets/maps/o.png": { credit: "", enabled: false },
        }}
        onPatch={onPatch}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enable all badges" }));
    expect(onPatch).toHaveBeenCalledWith({
      "assets/pics/a.png": { credit: "Art by A", enabled: true },
      "assets/maps/o.png": { credit: "", enabled: true },
    });
  });

  it("shows the shared 'Image missing' fallback when an asset preview 404s (Q93)", () => {
    const { container } = render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    const preview = container.querySelector("img");
    expect(preview).not.toBeNull();
    fireEvent.error(preview!);
    expect(screen.getByText("Image missing")).toBeInTheDocument();
  });

  it("typing in the filter narrows rows to assets whose src matches", () => {
    render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filter assets"), { target: { value: "pics" } });
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toBeInTheDocument();
    expect(screen.queryByLabelText("Credit for assets/maps/o.png")).not.toBeInTheDocument();
  });

  it("the filter also matches an asset's used-by id", () => {
    render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filter assets"), { target: { value: "L1" } });
    expect(screen.getByLabelText("Credit for assets/maps/o.png")).toBeInTheDocument();
    expect(screen.queryByLabelText("Credit for assets/pics/a.png")).not.toBeInTheDocument();
  });

  it("shows a no-match message when the filter excludes every asset", () => {
    render(<AssetManagerPanel project={fixture()} onPatch={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filter assets"), { target: { value: "nonexistent" } });
    expect(screen.getByText(/no assets match/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Credit for assets/pics/a.png")).not.toBeInTheDocument();
  });

  it("'uncredited only' hides assets that already have an enabled credit", () => {
    render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{
          "assets/pics/a.png": { credit: "Art by A", enabled: true },
          "assets/maps/o.png": { credit: "", enabled: false },
        }}
        onPatch={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Uncredited only"));
    expect(screen.queryByLabelText("Credit for assets/pics/a.png")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Credit for assets/maps/o.png")).toBeInTheDocument();
  });

  it("'uncredited only' still shows an asset with credit text that is disabled", () => {
    render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{
          "assets/pics/a.png": { credit: "Art by A", enabled: false },
          "assets/maps/o.png": { credit: "", enabled: false },
        }}
        onPatch={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Uncredited only"));
    expect(screen.getByLabelText("Credit for assets/pics/a.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Credit for assets/maps/o.png")).toBeInTheDocument();
  });

  it("'disable all badges' flips every asset's enabled flag off, preserving credit text", () => {
    const onPatch = vi.fn();
    render(
      <AssetManagerPanel
        project={fixture()}
        assetCredits={{
          "assets/pics/a.png": { credit: "Art by A", enabled: true },
          "assets/maps/o.png": { credit: "Art by O", enabled: true },
        }}
        onPatch={onPatch}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disable all badges" }));
    expect(onPatch).toHaveBeenCalledWith({
      "assets/pics/a.png": { credit: "Art by A", enabled: false },
      "assets/maps/o.png": { credit: "Art by O", enabled: false },
    });
  });
});
