// Ticket 38: a URL lands the same way on first load and on Back/Forward.
// Drives the real viewer through both paths and compares what it shows.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { act, cleanup, fireEvent, render, waitFor, screen } from "@testing-library/react";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router";
import AtlasViewer from "@/pages/AtlasViewer";
import { makeEntity, makeMap, makePlacement, makeProject, makeWorld } from "../helpers/makeProject";
import { stableMap } from "../helpers/reactLeafletMock";

const project = makeProject({
  worlds: [makeWorld({ defaultMapId: "world" })],
  maps: [
    makeMap({ id: "world", name: "World", height: 1000 }),
    makeMap({ id: "city", name: "City", height: 500 }),
    makeMap({ id: "dungeon", name: "Dungeon", height: 800 }),
  ],
  entities: [
    makeEntity({ id: "tower", title: "Tower" }),
    makeEntity({ id: "cave", title: "Cave" }),
  ],
  placements: [
    makePlacement({ id: "tower@city", entityId: "tower", mapId: "city", x: 50, y: 60 }),
    makePlacement({ id: "tower@world", entityId: "tower", mapId: "world", x: 100, y: 200 }),
    makePlacement({ id: "cave@city", entityId: "cave", mapId: "city", x: 30, y: 40 }),
  ],
});

const originalWidth = window.innerWidth;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(project) } as Response)),
  );
  vi.mocked(stableMap.flyTo).mockClear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
});

const mapName = () =>
  /Interactive map: (\w+)\./.exec(
    document.querySelector("main#atlas-main")?.getAttribute("aria-label") ?? "",
  )?.[1];
const panelTitle = () =>
  Array.from(document.querySelectorAll("h2"))
    .map((h) => h.textContent)
    .find((t) => t === "Tower" || t === "Cave") ?? null;
const lastFly = () => vi.mocked(stableMap.flyTo).mock.calls.at(-1)?.slice(0, 1) ?? null;

async function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  render(
    <MemoryRouter>
      <AtlasViewer />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
}

function popTo(url: string) {
  window.history.pushState({}, "", url);
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));
}

async function snapshot() {
  // Let the fly effect run after the map switch.
  await act(async () => {});
  return { map: mapName(), open: panelTitle(), fly: lastFly() };
}

const urls: Array<[string, string]> = [
  ["/?map=city&entity=tower", "City"],
  ["/?entity=tower", "World"],
  ["/?entity=cave", "City"],
  ["/?map=bogus&entity=tower", "World"],
  ["/?map=bogus&cx=10&cy=20&cz=2", "World"],
  ["/?cx=10&cy=20", "World"],
  ["/?map=removed&entity=cave&cx=1&cy=2", "City"],
];

describe("deep links: load and Back agree", () => {
  it.each(urls)("%s", async (url, expectedMap) => {
    await renderAt(url);
    const onLoad = await snapshot();
    cleanup();

    vi.mocked(stableMap.flyTo).mockClear();
    await renderAt("/?map=dungeon");
    vi.mocked(stableMap.flyTo).mockClear();
    popTo(url);
    const onBack = await snapshot();

    expect(onLoad.map).toBe(expectedMap);
    expect(onLoad.fly).not.toBeNull();
    expect(onBack).toEqual(onLoad);
  });
});

describe("phones: Back and Forward open the sheet", () => {
  it("opens the sheet on an entity entry and closes it on a plain one", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    await renderAt("/?map=world");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    popTo("/?map=world&entity=tower&cx=100&cy=200");
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Tower"));

    popTo("/?map=world");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    popTo("/?map=world&entity=tower");
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Tower"));
  });
});

describe("popstate the viewer should ignore", () => {
  it("an in-page # link keeps a closed sheet closed", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    await renderAt("/?map=world&entity=tower");
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Tower"));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Back over a `#` link: the entry changes, the query string doesn't.
    popTo(window.location.search + "#credits");
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Back from the viewer to another page leaves that page's URL alone", async () => {
    window.history.replaceState(null, "", "/");
    window.history.pushState(null, "", "/atlas?map=city");
    render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<p>Landing page</p>} />
          <Route path="/atlas" element={<AtlasViewer />} />
        </Routes>
      </BrowserRouter>,
    );
    await waitFor(() => expect(mapName()).toBe("City"));

    act(() => window.history.back());
    await screen.findByText("Landing page");
    await act(async () => {});

    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });
});
