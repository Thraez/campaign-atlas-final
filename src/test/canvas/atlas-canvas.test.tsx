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
const { boxBounds, oceanFitBox, toLatLng } = await import("@/atlas/canvas/canvasGeometry");
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
