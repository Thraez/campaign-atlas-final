/**
 * R-31: the shared canvas over the real test world, per campaign, through the
 * react-leaflet mock. Builds `content-next/` once (as R-30's mapTree-build test
 * does) and renders both views on each campaign's tree, plus the rotated
 * fixture (ocean placement 15°, frame 30°).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

// Mocks that expose what the canvas hands Leaflet: overlay attributes, bounds,
// panes, path positions and options, and the path's click / hover handlers.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  type Handlers = Partial<Record<"click" | "mouseover" | "mouseout", () => void>>;
  const json = (v: unknown) => JSON.stringify(v ?? null);
  return {
    ...base,
    SVGOverlay: ({
      children,
      bounds,
      attributes,
      pane,
    }: {
      children?: React.ReactNode;
      bounds: unknown;
      attributes?: Record<string, string>;
      pane?: string;
    }) => (
      <div
        data-leaflet="SVGOverlay"
        data-bounds={json(bounds)}
        data-attributes={json(attributes)}
        data-pane={pane}
      >
        <svg>{children}</svg>
      </div>
    ),
    ImageOverlay: ({ url, bounds, pane }: { url: string; bounds: unknown; pane?: string }) => (
      <div data-leaflet="ImageOverlay" data-url={url} data-bounds={json(bounds)} data-pane={pane} />
    ),
    Polygon: ({
      children,
      positions,
      pathOptions,
      eventHandlers,
    }: {
      children?: React.ReactNode;
      positions: unknown;
      pathOptions?: unknown;
      eventHandlers?: Handlers;
    }) => (
      <div
        data-leaflet="Polygon"
        data-positions={json(positions)}
        data-path={json(pathOptions)}
        onClick={() => eventHandlers?.click?.()}
        onMouseOver={() => eventHandlers?.mouseover?.()}
        onMouseOut={() => eventHandlers?.mouseout?.()}
      >
        {children}
      </div>
    ),
  };
});

let reduceMotion = false;
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => reduceMotion }));

const { runBuild } = await import("../../../scripts/build-atlas");
const { parseAtlasProject } = await import("@/atlas/content/atlasGuard");
const { buildMapTree } = await import("@/atlas/ocean/mapTree");
const { frameOutline } = await import("@/atlas/ocean/mapTree");
const { AtlasCanvas } = await import("@/atlas/canvas/AtlasCanvas");
const { OCEAN_FIT_MARGIN, boxBounds, oceanFitBox, oceanPlacedBox, placementCorners, toLatLng } =
  await import("@/atlas/canvas/canvasGeometry");
const { oceanMinZoom } = await import("@/atlas/canvas/OceanZoomLimit");
const { nextView } = await import("@/atlas/ocean/zoomHandoff");
const { rotatedFixture, OCEAN_TURN, FRAME_TURN } =
  await import("@/atlas/canvas-harness/rotatedFixture");
const { stableMap } = await import("../helpers/reactLeafletMock");

const ROOT = path.resolve(__dirname, "../../..");
let root: string;
const projects = {} as Record<"main" | "sandbox", AtlasProject>;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r31-"));
  fs.cpSync(path.join(ROOT, "content-next"), path.join(root, "content-next"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "atlas.next.config.json"), path.join(root, "atlas.config.json"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const r = await runBuild({ player: true, strict: true }, root);
  vi.restoreAllMocks();
  expect(r, r.error).toMatchObject({ ok: true });
  for (const c of ["main", "sandbox"] as const) {
    const file = path.join(root, ".atlas-campaigns", c, "atlas", "atlas.json");
    projects[c] = parseAtlasProject(JSON.parse(fs.readFileSync(file, "utf8")), file);
  }
}, 120_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  reduceMotion = false;
  vi.mocked(stableMap.fitBounds).mockClear();
});
afterEach(cleanup);

type View = { kind: "ocean" } | { kind: "map"; mapId: string };

function draw(project: AtlasProject, view: View, extra: Record<string, unknown> = {}) {
  const tree = buildMapTree(project);
  const onEnterMap = vi.fn();
  const onFrameHover = vi.fn();
  const r = render(
    <AtlasCanvas
      tree={tree}
      view={view}
      camera="fit"
      onEnterMap={onEnterMap}
      onFrameHover={onFrameHover}
      {...extra}
    >
      <div data-testid="caller-layer" />
    </AtlasCanvas>,
  );
  const q = (sel: string) => [...r.container.querySelectorAll<HTMLElement>(sel)];
  const polygons = q('[data-leaflet="Polygon"]');
  return {
    tree,
    r,
    onEnterMap,
    onFrameHover,
    svgs: q('[data-leaflet="SVGOverlay"]'),
    images: q('[data-leaflet="ImageOverlay"]'),
    polygons,
    labels: polygons.map((p) => p.textContent),
    hasChildren: q('[data-testid="caller-layer"]').length > 0,
  };
}

const parse = <T,>(el: HTMLElement, attr: string) => JSON.parse(el.getAttribute(attr)!) as T;
const close = (a: number[][], b: number[][]) =>
  a.length === b.length && a.every((p, i) => p.every((v, j) => Math.abs(v - b[i][j]) < 1e-6));

describe("AtlasCanvas, ocean view", () => {
  it("main: both top-level maps with names, no pins/regions/routes, fitted to them", () => {
    const d = draw(projects.main, { kind: "ocean" });
    expect(
      d.svgs.map((s) => parse<Record<string, string>>(s, "data-attributes")["data-canvas-map"]),
    ).toEqual(["quessaly-world", "skerrow-isles"]);
    expect(d.labels).toEqual(["Quessaly", "Skerrow Isles"]);
    expect(d.images).toHaveLength(0); // no map-view layers on the ocean
    expect(
      d.r.container.querySelectorAll('[data-leaflet="Marker"], [data-leaflet="Polyline"]'),
    ).toHaveLength(0);
    // Every image of a top-level map, in the tile pane, unrotated here.
    for (const s of d.svgs) {
      expect(s.getAttribute("data-pane")).toBe("tilePane");
      expect(s.querySelector("g")!.getAttribute("transform")).toBeNull();
      expect(s.querySelectorAll("image").length).toBeGreaterThan(0);
    }
    // Quessaly sits at (200,300) scaled 2: its svg covers 1200x800 ocean px.
    const q = d.svgs[0];
    expect(parse<Record<string, string>>(q, "data-attributes").viewBox).toBe("200 300 1200 800");
    expect(q.querySelector("image")!.getAttribute("width")).toBe("1200");
    // Opens fitted to the placed maps, not the whole ocean.
    const fit = boxBounds(2000, oceanFitBox(d.tree)!);
    expect(stableMap.fitBounds).toHaveBeenCalledWith(fit, { animate: false });
    expect(
      d.r.container.querySelector("[data-canvas-view]")!.getAttribute("data-canvas-view"),
    ).toBe("ocean");
    expect(d.hasChildren).toBe(true);
  });

  it("sandbox: only its one top-level map", () => {
    const d = draw(projects.sandbox, { kind: "ocean" });
    expect(d.labels).toEqual(["Quessaly"]);
    expect(d.svgs).toHaveLength(1);
  });

  it("a click enters the map; hover reports it and clears on leave", () => {
    const d = draw(projects.main, { kind: "ocean" });
    fireEvent.mouseOver(d.polygons[1]);
    expect(d.onFrameHover).toHaveBeenLastCalledWith("skerrow-isles");
    fireEvent.mouseOut(d.polygons[1]);
    expect(d.onFrameHover).toHaveBeenLastCalledWith(null);
    fireEvent.click(d.polygons[0]);
    expect(d.onEnterMap).toHaveBeenCalledWith("quessaly-world");
  });

  it("rotated fixture: the placement turns 15° about its centre, image and outline alike", () => {
    const d = draw(rotatedFixture(projects.main), { kind: "ocean" });
    const g = d.svgs[0].querySelector("g")!;
    // centre of a 600x400 map at (200,300) scaled 2 → (800, 700)
    expect(g.getAttribute("transform")).toBe(`rotate(${OCEAN_TURN} 800 700)`);
    // viewBox grows to the rotated box
    const vb = parse<Record<string, string>>(d.svgs[0], "data-attributes")
      .viewBox.split(" ")
      .map(Number);
    const rad = (OCEAN_TURN * Math.PI) / 180;
    const w = 1200 * Math.cos(rad) + 800 * Math.sin(rad);
    expect(vb[2]).toBeCloseTo(w, 6);
    // the click outline is the rotated rectangle: its top-left corner turned 15° about the centre
    const pos = parse<number[][]>(d.polygons[0], "data-positions");
    const [dx, dy] = [-600, -400];
    const tl: [number, number] = [
      800 + dx * Math.cos(rad) - dy * Math.sin(rad),
      700 + dx * Math.sin(rad) + dy * Math.cos(rad),
    ];
    expect(close([pos[0]], [toLatLng(2000, tl)])).toBe(true);
    // the other map is untouched
    expect(d.svgs[1].querySelector("g")!.getAttribute("transform")).toBeNull();
  });

  it("an unknown sea style falls back to the default water; nothing of it reaches the DOM", () => {
    const p = structuredClone(projects.main);
    p.ocean!.sea = 'evil" onload="x';
    const d = draw(p, { kind: "ocean" });
    expect(d.r.container.innerHTML).not.toContain("evil");
    expect(d.r.container.querySelector(".ocean-wave-1")).not.toBeNull();
  });

  it("reduced motion stills the waves", () => {
    const moving = draw(projects.main, { kind: "ocean" });
    expect(
      moving.r.container.querySelector<HTMLElement>(".ocean-wave-1")!.style.animation,
    ).not.toBe("none");
    cleanup();
    reduceMotion = true;
    const still = draw(projects.main, { kind: "ocean" });
    for (const n of [1, 2, 3]) {
      expect(
        still.r.container.querySelector<HTMLElement>(`.ocean-wave-${n}`)!.style.animation,
      ).toBe("none");
    }
  });
});

describe("AtlasCanvas, map view", () => {
  it("main quessaly-world: its layers plus the Oskmark frame", () => {
    const d = draw(projects.main, { kind: "map", mapId: "quessaly-world" });
    expect(d.images.length).toBeGreaterThan(0);
    for (const i of d.images) expect(i.getAttribute("data-pane")).toBe("tilePane");
    expect(d.svgs).toHaveLength(0);
    expect(d.labels).toEqual(["Oskmark"]);
    const node = d.tree.byId.get("oskmark")!;
    expect(parse<number[][]>(d.polygons[0], "data-positions")).toEqual(
      frameOutline(node.map.frame!)!.map((p) => toLatLng(400, p)),
    );
    expect(stableMap.fitBounds).toHaveBeenCalledWith(
      [
        [0, 0],
        [400, 600],
      ],
      { animate: false },
    );
  });

  it("main oskmark: Brindlecross and Tallowford; click and hover", () => {
    const d = draw(projects.main, { kind: "map", mapId: "oskmark" });
    expect(d.labels).toEqual(["Brindlecross", "Tallowford"]);
    fireEvent.mouseOver(d.polygons[1]);
    expect(d.onFrameHover).toHaveBeenLastCalledWith("tallowford");
    const idle = parse<{ opacity: number }>(d.polygons[0], "data-path");
    const lit = parse<{ opacity: number }>(d.polygons[1], "data-path");
    expect(lit.opacity).toBeGreaterThan(idle.opacity); // the hovered frame is highlighted
    fireEvent.click(d.polygons[0]);
    expect(d.onEnterMap).toHaveBeenCalledWith("brindlecross");
  });

  it("main skerrow-isles: Hookhaven", () => {
    expect(draw(projects.main, { kind: "map", mapId: "skerrow-isles" }).labels).toEqual([
      "Hookhaven",
    ]);
  });

  it("sandbox: quessaly-world frames only Oskmark, and oskmark frames nothing", () => {
    expect(draw(projects.sandbox, { kind: "map", mapId: "quessaly-world" }).labels).toEqual([
      "Oskmark",
    ]);
    cleanup();
    const d = draw(projects.sandbox, { kind: "map", mapId: "oskmark" });
    expect(d.images.length).toBeGreaterThan(0);
    expect(d.polygons).toHaveLength(0);
  });

  it("an id that isn't a tree node draws nothing, and no children", () => {
    // brindlecross is a map in main but not in sandbox's tree
    for (const id of ["brindlecross", "no-such-map"]) {
      const d = draw(projects.sandbox, { kind: "map", mapId: id });
      expect(d.images, id).toHaveLength(0);
      expect(d.svgs, id).toHaveLength(0);
      expect(d.polygons, id).toHaveLength(0);
      expect(d.hasChildren, id).toBe(false);
      expect(stableMap.fitBounds).not.toHaveBeenCalled();
      expect(
        d.r.container.querySelector("[data-canvas-view]")!.getAttribute("data-canvas-view"),
      ).toBe("none");
      cleanup();
    }
  });

  it("only tree children are framed, whatever else names the map as parent", () => {
    const tree = buildMapTree(projects.main);
    const node = tree.byId.get("quessaly-world")!;
    const framed = draw(projects.main, { kind: "map", mapId: "quessaly-world" }).labels;
    expect(framed).toEqual(node.children.filter((c) => c.map.frame).map((c) => c.map.name));
  });

  it("rotated fixture: the Oskmark frame is the 30° outline", () => {
    const p = rotatedFixture(projects.main);
    const d = draw(p, { kind: "map", mapId: "quessaly-world" });
    const node = d.tree.byId.get("oskmark")!;
    expect(node.map.frame!.rotation).toBe(FRAME_TURN);
    const pos = parse<number[][]>(d.polygons[0], "data-positions");
    expect(
      close(
        pos,
        frameOutline(node.map.frame!)!.map((q) => toLatLng(400, q)),
      ),
    ).toBe(true);
    // not the axis-aligned rectangle
    const { x, y } = node.map.frame!;
    expect(close([pos[0]], [toLatLng(400, [x, y])])).toBe(false);
  });

  it("re-renders on a new view without leaking the old hover", () => {
    const tree = buildMapTree(projects.main);
    const onFrameHover = vi.fn();
    const r = render(
      <AtlasCanvas tree={tree} view={{ kind: "ocean" }} camera="fit" onFrameHover={onFrameHover} />,
    );
    fireEvent.mouseOver(r.container.querySelector('[data-leaflet="Polygon"]')!);
    expect(onFrameHover).toHaveBeenLastCalledWith("quessaly-world");
    act(() => {
      r.rerender(
        <AtlasCanvas
          tree={tree}
          view={{ kind: "map", mapId: "quessaly-world" }}
          camera="fit"
          onFrameHover={onFrameHover}
        />,
      );
    });
    expect(onFrameHover).toHaveBeenLastCalledWith(null);
  });
});

// R-37: the ocean's fit leaves sea around the placed maps.
describe("AtlasCanvas, ocean fit margin (R-37)", () => {
  // The canvas at 1280x800 with the 400px open aside beside it (the aside is a
  // flex sibling of the canvas, so its width is simply not the canvas's).
  const VIEWPORT = { x: 1280 - 400, y: 800 - 61 };
  const fitZoom = (w: number, h: number, size: { x: number; y: number }) =>
    Math.log2(Math.min(size.x / w, size.y / h));

  it.each(["main", "sandbox"] as const)(
    "%s: the fit box holds every placement with the margin",
    (c) => {
      const tree = buildMapTree(projects[c]);
      const fit = oceanFitBox(tree)!;
      const placed = oceanPlacedBox(tree)!;
      const w = placed.maxX - placed.minX;
      const h = placed.maxY - placed.minY;
      const corners = tree.roots.flatMap((n) =>
        n.placement ? placementCorners(n.placement, n.map) : [],
      );
      expect(corners.length).toBeGreaterThan(0);
      for (const [x, y] of corners) {
        expect(x - fit.minX).toBeGreaterThanOrEqual(w * OCEAN_FIT_MARGIN - 1e-6);
        expect(fit.maxX - x).toBeGreaterThanOrEqual(w * OCEAN_FIT_MARGIN - 1e-6);
        expect(y - fit.minY).toBeGreaterThanOrEqual(h * OCEAN_FIT_MARGIN - 1e-6);
        expect(fit.maxY - y).toBeGreaterThanOrEqual(h * OCEAN_FIT_MARGIN - 1e-6);
      }
    },
  );

  it("main at 1280x800: what the canvas fits shows every frame whole, with sea beside it", () => {
    const d = draw(projects.main, { kind: "ocean" });
    const [[south, west], [north, east]] = vi.mocked(stableMap.fitBounds).mock.calls[0][0] as [
      [number, number],
      [number, number],
    ];
    const zoom = fitZoom(east - west, north - south, VIEWPORT);
    const k = 2 ** zoom;
    const cx = (west + east) / 2;
    const cy = (north + south) / 2; // lat; ocean y is 2000 - lat
    const placed = oceanPlacedBox(d.tree)!;
    for (const [x, y] of d.tree.roots.flatMap((n) =>
      n.placement ? placementCorners(n.placement, n.map) : [],
    )) {
      const sx = VIEWPORT.x / 2 + (x - cx) * k;
      const sy = VIEWPORT.y / 2 + (2000 - y - cy) * -k;
      expect(sx).toBeGreaterThanOrEqual(24); // clear of the left edge (and the zoom control)
      expect(sx).toBeLessThanOrEqual(VIEWPORT.x - 24); // clear of the aside's edge
      expect(sy).toBeGreaterThanOrEqual(24);
      expect(sy).toBeLessThanOrEqual(VIEWPORT.y - 24);
    }
    expect(placed.maxX).toBeLessThan(east); // the same margin the box carries
  });

  it("the zoom floor stays one level below the padded fit, and a map view fits edge to edge", () => {
    const tree = buildMapTree(projects.main);
    const fit = oceanFitBox(tree)!;
    const w = fit.maxX - fit.minX;
    const h = fit.maxY - fit.minY;
    expect(oceanMinZoom(VIEWPORT, w, h)).toBeCloseTo(fitZoom(w, h, VIEWPORT) - 1, 9);
    draw(projects.main, { kind: "map", mapId: "quessaly-world" });
    expect(stableMap.fitBounds).toHaveBeenCalledWith(
      boxBounds(400, { minX: 0, minY: 0, maxX: 600, maxY: 400 }),
      { animate: false },
    );
  });

  it.each(["main", "sandbox"] as const)("%s: a fit never hands off", (c) => {
    const tree = buildMapTree(projects[c]);
    const fit = oceanFitBox(tree)!;
    for (const size of [VIEWPORT, { x: 375, y: 600 }, { x: 1920, y: 1080 }]) {
      const zoom = fitZoom(fit.maxX - fit.minX, fit.maxY - fit.minY, size);
      const camera = {
        center: [(fit.minX + fit.maxX) / 2, (fit.minY + fit.maxY) / 2] as [number, number],
        zoom,
      };
      expect(
        nextView(tree, { kind: "ocean" }, camera, { width: size.x, height: size.y }).kind,
      ).toBe("stay");
    }
  });
});
