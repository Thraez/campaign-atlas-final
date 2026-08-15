import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { activeMapCredits, MapCreditOverlay } from "@/atlas/map/MapCreditOverlay";
import type { AssetCredit } from "@/atlas/content/schema";
import { makeMap, makeLayer } from "../helpers/makeProject";

describe("activeMapCredits (pure)", () => {
  it("returns [] when the map is absent", () => {
    expect(
      activeMapCredits(undefined, { "a.png": { credit: "X", enabled: true } }, undefined),
    ).toEqual([]);
  });

  it("returns [] when assetCredits is absent", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    expect(activeMapCredits(map, undefined, undefined)).toEqual([]);
  });

  it("returns [] when the world master switch (credits.badges) is false", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
    };
    expect(activeMapCredits(map, registry, { badges: false })).toEqual([]);
  });

  it("includes an enabled, non-empty layer credit", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
    };
    expect(activeMapCredits(map, registry, undefined)).toEqual(["Art by A"]);
  });

  it("excludes a disabled layer credit", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: false },
    };
    expect(activeMapCredits(map, registry, undefined)).toEqual([]);
  });

  it("excludes an enabled entry with empty credit text", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = { "a.png": { credit: "", enabled: true } };
    expect(activeMapCredits(map, registry, undefined)).toEqual([]);
  });

  it("excludes a layer with no registry entry", () => {
    const map = makeMap({ layers: [makeLayer({ src: "untracked.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
    };
    expect(activeMapCredits(map, registry, undefined)).toEqual([]);
  });

  it("combines multiple layers' credits, deduped, first-seen order", () => {
    const map = makeMap({
      layers: [
        makeLayer({ id: "l1", src: "a.png", zIndex: 1 }),
        makeLayer({ id: "l2", src: "b.png", zIndex: 2 }),
        makeLayer({ id: "l3", src: "c.png", zIndex: 3 }),
      ],
    });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
      "b.png": { credit: "Art by A", enabled: true }, // same text as a.png — deduped
      "c.png": { credit: "Art by C", enabled: true },
    };
    expect(activeMapCredits(map, registry, undefined)).toEqual(["Art by A", "Art by C"]);
  });
});

describe("MapCreditOverlay (component)", () => {
  it("renders nothing when there are no active credits", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const { container } = render(<MapCreditOverlay map={map} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a badge for each active credit", () => {
    const map = makeMap({
      layers: [makeLayer({ id: "l1", src: "a.png" }), makeLayer({ id: "l2", src: "b.png" })],
    });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
      "b.png": { credit: "Art by B", enabled: true },
    };
    render(<MapCreditOverlay map={map} assetCredits={registry} />);
    expect(screen.getByRole("note", { name: /Image credit: Art by A/i })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: /Image credit: Art by B/i })).toBeInTheDocument();
  });

  it("renders nothing when credits.badges is false", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
    };
    const { container } = render(
      <MapCreditOverlay map={map} assetCredits={registry} credits={{ badges: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("defaults to the standard bottom-right resting spot with no clearance passed", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
    };
    const { container } = render(<MapCreditOverlay map={map} assetCredits={registry} />);
    expect((container.firstChild as HTMLElement).style.bottom).toBe("0.5rem");
  });

  it("lifts clear of an overlapping corner overlay (e.g. the minimap) when clearanceBottomPx is given", () => {
    const map = makeMap({ layers: [makeLayer({ src: "a.png" })] });
    const registry: Record<string, AssetCredit> = {
      "a.png": { credit: "Art by A", enabled: true },
    };
    const { container } = render(
      <MapCreditOverlay map={map} assetCredits={registry} clearanceBottomPx={110} />,
    );
    expect((container.firstChild as HTMLElement).style.bottom).toBe("110px");
  });
});
