/**
 * P-07: frames and pictures that respond. Through a react-leaflet mock that
 * stands in for the Leaflet elements the classes land on: an outline's path
 * and its label, a picture's `<img>` (map view) or `<image>` (ocean), and the
 * drawn chart paper.
 */
import fs from "node:fs";
import path from "node:path";
import React, { useEffect, useRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapTreeNode } from "@/atlas/ocean/mapTree";

type Handlers = Record<string, (e: unknown) => void>;

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  const json = (v: unknown) => JSON.stringify(v ?? null);
  return {
    ...base,
    Tooltip: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div data-leaflet="Tooltip" className={className}>
        {children}
      </div>
    ),
    // An outline: its path, its label, and the Leaflet layer the `add` event hands over.
    Polygon: ({
      children,
      pathOptions,
      className,
      eventHandlers,
    }: {
      children?: React.ReactNode;
      pathOptions?: unknown;
      className?: string;
      eventHandlers?: Handlers;
    }) => {
      const box = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const root = box.current!;
        const tip = {
          getElement: () => root.querySelector('[data-leaflet="Tooltip"]'),
          update() {},
        };
        eventHandlers?.add?.({
          target: { getElement: () => root.querySelector("path"), getTooltip: () => tip },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div data-leaflet="Polygon" data-path={json(pathOptions)} data-class={className} ref={box}>
          <svg>
            <path
              onClick={() => eventHandlers?.click?.({})}
              onMouseOver={() => eventHandlers?.mouseover?.({})}
              onMouseOut={() => eventHandlers?.mouseout?.({})}
            />
          </svg>
          {children}
        </div>
      );
    },
    SVGOverlay: ({
      children,
      eventHandlers,
    }: {
      children?: React.ReactNode;
      eventHandlers?: Handlers;
    }) => {
      useEffect(() => {
        eventHandlers?.add?.({ target: { bringToBack() {} } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div data-leaflet="SVGOverlay">
          <svg>{children}</svg>
        </div>
      );
    },
    // An image overlay's <img>: its load reaches the `load` handler as Leaflet's would.
    ImageOverlay: ({
      url,
      className,
      eventHandlers,
    }: {
      url: string;
      className?: string;
      eventHandlers?: Handlers;
    }) => (
      <img
        data-leaflet="ImageOverlay"
        alt=""
        src={url}
        className={className}
        onLoad={(e) => eventHandlers?.load?.({ target: { getElement: () => e.currentTarget } })}
        onError={(e) => eventHandlers?.error?.({ target: { getElement: () => e.currentTarget } })}
      />
    ),
  };
});

let reduceMotion = false;
vi.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => reduceMotion }));

const { ChildFrames, MapPictures, OceanMaps, LABEL_CLASS } =
  await import("@/atlas/canvas/CanvasLayers");
const { PICTURE_FADE_MS } = await import("@/atlas/canvas/pictureReveal");
const { makeMap, makeLayer } = await import("../helpers/makeProject");
const { stableMap } = await import("../helpers/reactLeafletMock");

const child: MapTreeNode = {
  map: makeMap({
    id: "oskmark",
    name: "Oskmark",
    width: 600,
    height: 400,
    parent: "quessaly",
    frame: { x: 300, y: 80, width: 180, height: 120, rotation: 0 },
  }),
  parentId: "quessaly",
  placement: null,
  children: [],
};
const parent: MapTreeNode = {
  map: makeMap({
    id: "quessaly",
    name: "Quessaly",
    width: 600,
    height: 400,
    layers: [makeLayer({ id: "base", src: "atlas/assets/maps/q.png", width: 600, height: 400 })],
  }),
  parentId: null,
  placement: { map: "quessaly", x: 200, y: 300, scale: 2, rotation: 0 },
  children: [child],
};

beforeEach(() => {
  reduceMotion = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const q = (root: ParentNode, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];

function frames() {
  const r = render(<ChildFrames node={parent} />);
  const path = r.container.querySelector("path")!;
  const label = r.container.querySelector<HTMLElement>('[data-leaflet="Tooltip"]')!;
  return { r, path, label };
}

describe("P-07 frames", () => {
  it("the label carries the label class, whose look is the display font", () => {
    const { label } = frames();
    expect(label.classList.contains(LABEL_CLASS)).toBe(true);
    expect(label.textContent).toBe("Oskmark");
    const css = fs.readFileSync(path.resolve(__dirname, "../../index.css"), "utf8");
    const rule = css.match(/\.atlas-canvas \.atlas-canvas-label \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/font-family:\s*var\(--font-display,\s*"Cinzel"/);
    expect(rule).toMatch(/letter-spacing/);
  });

  it("our transitions keep Leaflet's zoom transform while the map zooms (CSS)", () => {
    // jsdom can't run a zoom: check the stylesheet. Leaflet sets `transition:
    // transform` on .leaflet-zoom-animated under .leaflet-zoom-anim; a rule of
    // ours that sets `transition` on a tooltip or image must list it again there.
    const css = fs.readFileSync(path.resolve(__dirname, "../../index.css"), "utf8");
    for (const sel of [
      ".atlas-canvas-label.atlas-canvas-eased",
      ".atlas-canvas-picture.is-revealing",
    ]) {
      const esc = sel.replace(/[.-]/g, "\\$&");
      const twin = css.match(new RegExp(`\\.leaflet-zoom-anim ${esc} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(twin, sel).toMatch(/transition:\s*transform 0\.25s cubic-bezier\(0, 0, 0\.25, 1\),/);
    }
  });

  it("the outline is created with the frame classes the stylesheet keys on", () => {
    const { r } = frames();
    // A creation prop: Leaflet never applies a className passed through pathOptions.
    const poly = r.container.querySelector('[data-leaflet="Polygon"]')!;
    expect(poly.getAttribute("data-class")).toBe("atlas-canvas-frame atlas-canvas-frame--child");
  });

  it("hover eases in on the outline and its label, and leaves on mouseout", () => {
    const { path, label } = frames();
    for (const el of [path, label]) {
      expect(el.classList.contains("is-hover")).toBe(false);
      expect(el.classList.contains("atlas-canvas-eased")).toBe(true);
    }
    fireEvent.mouseOver(path);
    for (const el of [path, label]) expect(el.classList.contains("is-hover")).toBe(true);
    fireEvent.mouseOut(path);
    for (const el of [path, label]) expect(el.classList.contains("is-hover")).toBe(false);
  });

  it("pressed from pointer-down until release anywhere, or a map drag", () => {
    const { path, label } = frames();
    fireEvent.pointerDown(path);
    for (const el of [path, label]) expect(el.classList.contains("is-pressed")).toBe(true);
    fireEvent.pointerUp(window);
    for (const el of [path, label]) expect(el.classList.contains("is-pressed")).toBe(false);

    fireEvent.pointerDown(path);
    expect(path.classList.contains("is-pressed")).toBe(true);
    const drag = vi
      .mocked(stableMap.on)
      .mock.calls.filter(([name]) => name === "dragstart")
      .at(-1)![1] as () => void;
    act(() => drag());
    expect(path.classList.contains("is-pressed")).toBe(false);
  });

  it("a click still enters the map", () => {
    const onEnterMap = vi.fn();
    const r = render(<ChildFrames node={parent} onEnterMap={onEnterMap} />);
    fireEvent.click(r.container.querySelector("path")!);
    expect(onEnterMap).toHaveBeenCalledWith("oskmark");
  });

  it("reduced motion: the same states, no ease", () => {
    reduceMotion = true;
    const { path, label } = frames();
    fireEvent.mouseOver(path);
    fireEvent.pointerDown(path);
    for (const el of [path, label]) {
      expect(el.classList.contains("is-hover")).toBe(true);
      expect(el.classList.contains("is-pressed")).toBe(true);
      expect(el.classList.contains("atlas-canvas-eased")).toBe(false);
    }
    fireEvent.pointerUp(window);
  });
});

describe("P-07 map pictures", () => {
  function pictures(
    node: MapTreeNode = parent,
    wrap?: (el: React.ReactElement) => React.ReactElement,
  ) {
    const el = <MapPictures node={node} />;
    const r = render(wrap ? wrap(el) : el);
    return {
      r,
      imgs: q(r.container, "img"),
      papers: q(r.container, ".atlas-chart-paper"),
    };
  }

  it("starts in the placeholder state: picture hidden, chart paper drawn", () => {
    const { imgs, papers } = pictures();
    expect(imgs).toHaveLength(1);
    expect(imgs[0].className).toBe("atlas-canvas-picture is-pending");
    expect(papers).toHaveLength(1);
    expect(papers[0].classList.contains("is-done")).toBe(false);
    // Drawn, not a picture: a sheet, a grid and a neat line.
    expect(papers[0].querySelector("image, img")).toBeNull();
    expect(papers[0].querySelector(".atlas-chart-paper__sheet")).not.toBeNull();
    expect(papers[0].querySelector(".atlas-chart-paper__grid")!.getAttribute("d")).toMatch(/^M/);
  });

  it("on load the picture fades in, then the fade class goes; the paper is done", () => {
    vi.useFakeTimers();
    const { imgs, papers } = pictures();
    fireEvent.load(imgs[0]);
    expect(imgs[0].classList.contains("is-pending")).toBe(false);
    expect(imgs[0].classList.contains("is-revealing")).toBe(true);
    expect(papers[0].classList.contains("is-done")).toBe(true);
    expect(papers[0].classList.contains("atlas-canvas-eased")).toBe(true);
    act(() => vi.advanceTimersByTime(PICTURE_FADE_MS + 60));
    expect(imgs[0].className).toBe("atlas-canvas-picture");
  });

  it("calm mode: shown at once on load, no fade classes anywhere", () => {
    reduceMotion = true;
    const { r, imgs, papers } = pictures();
    expect(imgs[0].classList.contains("is-pending")).toBe(true);
    fireEvent.load(imgs[0]);
    expect(imgs[0].className).toBe("atlas-canvas-picture");
    expect(papers[0].classList.contains("is-done")).toBe(true);
    expect(r.container.querySelector(".is-revealing, .atlas-canvas-eased")).toBeNull();
  });

  it("under a handoff ghost (P-05) a picture shows at once: the ghost's fade is the only one", () => {
    const { imgs } = pictures(parent, (el) => (
      <div className="leaflet-container">
        <div data-handoff-ghost="" />
        {el}
      </div>
    ));
    fireEvent.load(imgs[0]);
    expect(imgs[0].className).toBe("atlas-canvas-picture");
  });

  it("a wrapped map keeps its paper until every copy has settled", () => {
    const wrapped: MapTreeNode = { ...parent, map: { ...parent.map, wrapX: true } };
    const { imgs, papers } = pictures(wrapped);
    expect(imgs).toHaveLength(3);
    expect(papers).toHaveLength(3);
    fireEvent.load(imgs[0]);
    fireEvent.error(imgs[2]);
    for (const p of papers) expect(p.classList.contains("is-done")).toBe(false);
    fireEvent.load(imgs[1]);
    // A failed layer among loaded ones lets the paper go: no tan box round transparent art.
    for (const p of papers) expect(p.classList.contains("is-done")).toBe(true);
    expect(imgs[2].classList.contains("is-pending")).toBe(true);
  });

  it("a map whose pictures all fail keeps its paper", () => {
    const wrapped: MapTreeNode = { ...parent, map: { ...parent.map, wrapX: true } };
    const { imgs, papers } = pictures(wrapped);
    for (const img of imgs) fireEvent.error(img);
    for (const p of papers) expect(p.classList.contains("is-done")).toBe(false);
  });
});

describe("P-07 ocean pictures", () => {
  it("each top-level map's <image> starts hidden over its paper and shows on load", () => {
    const r = render(<OceanMaps roots={[parent]} oceanHeight={2000} />);
    const image = r.container.querySelector("image")!;
    const paper = r.container.querySelector(".atlas-chart-paper")!;
    expect(image.getAttribute("class")).toBe("atlas-canvas-picture is-pending");
    // The paper sits under the pictures, on the map's placed rect.
    expect(paper.nextElementSibling).toBe(image);
    const sheet = paper.querySelector(".atlas-chart-paper__sheet")!;
    expect(["x", "y", "width", "height"].map((a) => Number(sheet.getAttribute(a)))).toEqual([
      200, 300, 1200, 800,
    ]);
    fireEvent.load(image);
    expect(image.getAttribute("class")).toBe("atlas-canvas-picture is-revealing");
    expect(paper.getAttribute("class")).toContain("is-done");
  });

  it("a new box remounts the pictures and the paper comes back until they load", () => {
    const r = render(<OceanMaps roots={[parent]} oceanHeight={2000} />);
    fireEvent.load(r.container.querySelector("image")!);
    expect(r.container.querySelector(".atlas-chart-paper")!.getAttribute("class")).toContain(
      "is-done",
    );
    const moved: MapTreeNode = { ...parent, placement: { ...parent.placement!, x: 260 } };
    r.rerender(<OceanMaps roots={[moved]} oceanHeight={2000} />);
    const image = r.container.querySelector("image")!;
    expect(image.getAttribute("class")).toBe("atlas-canvas-picture is-pending");
    expect(r.container.querySelector(".atlas-chart-paper")!.getAttribute("class")).not.toContain(
      "is-done",
    );
    fireEvent.load(image);
    expect(r.container.querySelector(".atlas-chart-paper")!.getAttribute("class")).toContain(
      "is-done",
    );
  });

  it("the ocean outline gets the same hover and press states", () => {
    const r = render(<OceanMaps roots={[parent]} oceanHeight={2000} />);
    const p = r.container.querySelector<SVGPathElement>('[data-leaflet="Polygon"] path')!;
    fireEvent.mouseOver(p);
    fireEvent.pointerDown(p);
    expect(p.classList.contains("is-hover")).toBe(true);
    expect(p.classList.contains("is-pressed")).toBe(true);
    fireEvent.pointerUp(window);
  });
});
