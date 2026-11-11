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
  [...document.querySelectorAll('[data-leaflet="Polygon"]')].map((p) => p.textContent);

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

  it("sandbox: no frame or crumb for tallowford, brindlecross or skerrow-isles", async () => {
    await open("sandbox", "/?map=quessaly-world");
    expect(crumbs()).toEqual(["Ocean", "Quessaly"]);
    const all = document.body.innerHTML;
    for (const id of ["tallowford", "brindlecross", "skerrow-isles", "Skerrow"]) {
      expect(all).not.toContain(id);
    }
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
});
