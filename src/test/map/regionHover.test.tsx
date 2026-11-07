/**
 * Q-04: hovering a region in the player viewer opens the entity's peek card.
 * A region with no entity in the atlas keeps the name-only tooltip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  function PolygonMock({
    children,
    eventHandlers,
  }: {
    children?: React.ReactNode;
    eventHandlers?: Record<string, (e: unknown) => void>;
  }) {
    return (
      <div
        data-leaflet="Polygon"
        onMouseOver={(e) => eventHandlers?.mouseover?.({ originalEvent: e.nativeEvent })}
        onMouseOut={() => eventHandlers?.mouseout?.({})}
      >
        {children}
      </div>
    );
  }
  return { ...base, Polygon: PolygonMock };
});

import { render, waitFor, cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AtlasViewer from "@/pages/AtlasViewer";
import {
  makeProject,
  makeEntity,
  makeMap,
  makePlacement,
  makeSearchIndex,
} from "../helpers/makeProject";

const square: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 100],
];
const project = makeProject({
  entities: [makeEntity(), makeEntity({ id: "salt-cave", title: "Salt Cave", type: "cave" })],
  placements: [makePlacement()],
  maps: [
    makeMap({
      regions: [
        {
          id: "r-linked",
          mapId: "overview",
          visibility: "player",
          name: "Cave Lands",
          entityId: "salt-cave",
          points: square,
        },
        {
          id: "r-plain",
          mapId: "overview",
          visibility: "player",
          name: "Open Plain",
          points: square,
        },
        {
          id: "r-missing",
          mapId: "overview",
          visibility: "player",
          name: "Ghost Hills",
          entityId: "not-in-atlas",
          points: square,
        },
      ],
    }),
  ],
});

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(String(url).includes("search-index") ? makeSearchIndex() : project),
      } as unknown as Response),
    ),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("pointer: fine"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

async function renderViewer() {
  render(
    <MemoryRouter>
      <AtlasViewer />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelectorAll('[data-leaflet="Polygon"]').length).toBe(3));
}

const polygons = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-leaflet="Polygon"]'));
const byName = (name: string) => polygons().find((p) => p.textContent?.includes(name))!;
const tooltipOf = (el: HTMLElement) => el.querySelector('[data-leaflet="Tooltip"]');

describe("region hover card (Q-04)", () => {
  it("opens the linked entity's peek card on mouseover and closes on mouseout", async () => {
    await renderViewer();
    const region = byName("Cave Lands");
    expect(tooltipOf(region)).toBeNull();
    fireEvent.mouseOver(region);
    await screen.findByRole("dialog", { name: "Salt Cave preview" });
    fireEvent.mouseOut(region);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Salt Cave preview" })).toBeNull(),
    );
  });

  it("keeps the name tooltip and opens no card without an entity in the atlas", async () => {
    await renderViewer();
    for (const name of ["Open Plain", "Ghost Hills"]) {
      const region = byName(name);
      expect(tooltipOf(region)).not.toBeNull();
      fireEvent.mouseOver(region);
    }
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
