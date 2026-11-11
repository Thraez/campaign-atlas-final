// R-33: the viewer on the shared canvas, on the built test world (both campaigns).
// v1 cases live in AtlasViewer.smoke.test.tsx and AtlasViewer.deepLinks.test.tsx, unchanged.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasProject } from "@/atlas/content/schema";

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  const json = (v: unknown) => JSON.stringify(v ?? null);
  return {
    ...base,
    // The canvas's frame and map names are Tooltips with this class; regions' are not.
    Tooltip: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <span data-leaflet="Tooltip" className={className}>
        {children}
      </span>
    ),
    Polygon: ({
      children,
      positions,
      eventHandlers,
    }: {
      children?: React.ReactNode;
      positions: unknown;
      eventHandlers?: { click?: () => void };
    }) => (
      <div
        data-leaflet="Polygon"
        data-positions={json(positions)}
        onClick={() => eventHandlers?.click?.()}
      >
        {children}
      </div>
    ),
  };
});

// Keep the canvas's latest props, so a test can fire its handoff and camera callbacks.
let canvasProps: import("@/atlas/canvas/AtlasCanvas").AtlasCanvasProps;
vi.mock("@/atlas/canvas/AtlasCanvas", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/atlas/canvas/AtlasCanvas")>();
  return {
    ...orig,
    AtlasCanvas: (props: import("@/atlas/canvas/AtlasCanvas").AtlasCanvasProps) => {
      canvasProps = props;
      return orig.AtlasCanvas(props);
    },
  };
});

const { runBuild } = await import("../../../scripts/build-atlas");
const { parseAtlasProject } = await import("@/atlas/content/atlasGuard");
const { default: AtlasViewer } = await import("@/pages/AtlasViewer");
const { makeSearchIndex } = await import("../helpers/makeProject");

const ROOT = path.resolve(__dirname, "../../..");
let root: string;
const projects = {} as Record<"main" | "sandbox", AtlasProject>;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r33-"));
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => window.history.replaceState(null, "", "/"));

async function open(campaign: "main" | "sandbox", url = "/") {
  const project = projects[campaign];
  vi.stubGlobal(
    "fetch",
    vi.fn((u: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(String(u).includes("search-index") ? makeSearchIndex() : project),
      } as unknown as Response),
    ),
  );
  window.history.replaceState(null, "", url);
  render(
    <MemoryRouter>
      <AtlasViewer />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
}

const crumbs = () =>
  [...document.querySelectorAll("nav[aria-label='Breadcrumb'] li")].map((li) =>
    li.textContent!.replace(/^>/, "").trim(),
  );
const canvasView = () =>
  document.querySelector("[data-canvas-view]")?.getAttribute("data-canvas-view");
const frameLabels = () =>
  [...document.querySelectorAll(".atlas-canvas-label")].map((t) => t.textContent);

describe("AtlasViewer, v2 output", () => {
  it.each(["main", "sandbox"] as const)(
    "%s: opens on the ocean with an Ocean crumb and no Select",
    async (c) => {
      await open(c);
      expect(canvasView()).toBe("ocean");
      expect(crumbs()).toEqual(["Ocean"]);
      expect(screen.queryByRole("combobox", { name: /choose map/i })).not.toBeInTheDocument();
      expect(screen.getByText(/map: zoom in or click/)).toBeInTheDocument();
      expect(document.querySelector("header")!.textContent).toContain(projects[c].campaign!.name);
    },
  );

  it("main: the ocean frames Quessaly and Skerrow Isles, never a sandbox name", async () => {
    await open("main");
    expect(frameLabels()).toEqual(["Quessaly", "Skerrow Isles"]);
  });

  it("sandbox: the ocean frames only Quessaly", async () => {
    await open("sandbox");
    expect(frameLabels()).toEqual(["Quessaly"]);
  });

  it("sandbox: Oskmark shows no frame or crumb for Brindlecross, Tallowford or Skerrow Isles", async () => {
    await open("sandbox", "/?map=oskmark");
    expect(crumbs()).toEqual(["Ocean", "Quessaly", "Oskmark"]);
    expect(frameLabels()).toEqual([]);
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const name of ["brindlecross", "tallowford", "skerrow"]) expect(text).not.toContain(name);
  });

  it("sandbox: a map only main has (?map=tallowford) opens the ocean", async () => {
    await open("sandbox", "/?map=tallowford");
    expect(canvasView()).toBe("ocean");
    expect(crumbs()).toEqual(["Ocean"]);
    expect(new URLSearchParams(window.location.search).has("map")).toBe(false);
  });

  it("main: Oskmark does frame Brindlecross and Tallowford (so the sandbox checks can fail)", async () => {
    await open("main", "/?map=oskmark");
    expect(frameLabels().sort()).toEqual(["Brindlecross", "Tallowford"]);
  });

  it("main: a click on a map enters it (a Back entry), and Back returns to the ocean", async () => {
    await open("main");
    const len = window.history.length;
    fireEvent.click(document.querySelectorAll('[data-leaflet="Polygon"]')[0]);
    await waitFor(() => expect(canvasView()).toBe("map:quessaly-world"));
    expect(crumbs()).toEqual(["Ocean", "Quessaly"]);
    expect(window.history.length).toBe(len + 1);
    expect(new URLSearchParams(window.location.search).get("map")).toBe("quessaly-world");
    act(() => window.history.back());
    await waitFor(() => expect(canvasView()).toBe("ocean"));
  });

  it("a map in the URL opens it with its crumbs, and the Ocean crumb goes back, pushing history", async () => {
    await open("main", "/?map=oskmark");
    expect(canvasView()).toBe("map:oskmark");
    expect(crumbs()).toEqual(["Ocean", "Quessaly", "Oskmark"]);
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
    await waitFor(() => expect(canvasView()).toBe("ocean"));
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
    expect(new URLSearchParams(window.location.search).has("map")).toBe(false);
  });

  it("an unknown map opens the ocean and ignores cx/cy/cz", async () => {
    await open("sandbox", "/?map=brindlecross&cx=10&cy=20&cz=3");
    expect(canvasView()).toBe("ocean");
    expect(crumbs()).toEqual(["Ocean"]);
    expect(new URLSearchParams(window.location.search).get("cz")).not.toBe("3");
  });

  it("an ocean URL with no map keeps its camera", async () => {
    await open("main", "/?cx=900&cy=800&cz=-2");
    expect(canvasView()).toBe("ocean");
    expect(new URLSearchParams(window.location.search).get("cx")).toBe("900");
  });

  it("Back and Forward re-apply the map in the URL", async () => {
    await open("main", "/?map=oskmark");
    window.history.pushState({}, "", "/");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await waitFor(() => expect(canvasView()).toBe("ocean"));
    window.history.pushState({}, "", "/?map=quessaly-world");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await waitFor(() => expect(canvasView()).toBe("map:quessaly-world"));
  });

  it("the ruler puts the crosshair class on the canvas", async () => {
    await open("main", "/?map=oskmark");
    expect(document.querySelector(".atlas-ruler")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /distance ruler/i }));
    expect(document.querySelector(".atlas-canvas.atlas-ruler")).not.toBeNull();
  });

  describe("history and camera memory", () => {
    const search = () => new URLSearchParams(window.location.search);
    const spies = () => ({
      push: vi.spyOn(window.history, "pushState"),
      replace: vi.spyOn(window.history, "replaceState"),
    });

    it("a handoff pushes, a pan or zoom replaces, a crumb returns to the remembered camera", async () => {
      await open("main");
      const { push, replace } = spies();
      const ocean = { center: [1000, 700] as [number, number], zoom: -1.5 };
      act(() => canvasProps.onCameraChange!(ocean));
      expect(push).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalled();
      expect(search().get("cx")).toBe("1000");

      // Zooming in past Quessaly's threshold: the canvas hands the view over.
      act(() =>
        canvasProps.onViewChange!(
          { kind: "map", mapId: "quessaly-world" },
          { center: [300, 200], zoom: 0.5 },
        ),
      );
      expect(push).toHaveBeenCalledTimes(1);
      expect(search().get("map")).toBe("quessaly-world");
      expect(search().get("cx")).toBe("300");
      expect(crumbs()).toEqual(["Ocean", "Quessaly"]);

      // Panning and zooming inside it only replace.
      push.mockClear();
      act(() => canvasProps.onCameraChange!({ center: [310, 210], zoom: 1 }));
      act(() => canvasProps.onCameraChange!({ center: [320, 220], zoom: 1.25 }));
      expect(push).not.toHaveBeenCalled();
      expect(search().get("cx")).toBe("320");

      // The Ocean crumb goes back where the user left the ocean, not fitted.
      fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
      expect(push).toHaveBeenCalledTimes(1);
      expect(canvasProps.view).toEqual({ kind: "ocean" });
      expect(canvasProps.camera).toEqual(ocean);
      expect(search().has("map")).toBe(false);
      expect(search().get("cx")).toBe("1000");

      // And Quessaly's crumb-less return (handoff back in) is remembered too.
      act(() =>
        canvasProps.onViewChange!(
          { kind: "map", mapId: "quessaly-world" },
          { center: [330, 230], zoom: 0.5 },
        ),
      );
      act(() => canvasProps.onCameraChange!({ center: [340, 240], zoom: 0.75 }));
      act(() =>
        canvasProps.onViewChange!(
          { kind: "map", mapId: "oskmark" },
          { center: [50, 60], zoom: 0.25 },
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: "Quessaly" }));
      expect(canvasProps.view).toEqual({ kind: "map", mapId: "quessaly-world" });
      expect(canvasProps.camera).toEqual({ center: [340, 240], zoom: 0.75 });
      push.mockRestore();
      replace.mockRestore();
    });

    it("a crumb to a view not visited yet lands fitted", async () => {
      await open("main", "/?map=oskmark");
      fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
      expect(canvasProps.camera).toBe("fit");
      expect(search().get("cx")).toBeNull();
    });
  });
});
