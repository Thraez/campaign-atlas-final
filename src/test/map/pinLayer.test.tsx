/**
 * Ticket 11 — the pin layer doesn't rebuild on unrelated viewer changes.
 *
 * Renders the real AtlasViewer page. The Marker mock applies react-leaflet's
 * own update rule (`updateMarker`: `setIcon` whenever the `icon` prop is a
 * different object than last render) and records which pin it hit. A search
 * keystroke or a hover peek must leave every pin's icon alone; opening a pin
 * may only touch that pin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect, useRef } from "react";

const setIcon = vi.fn<(title: string) => void>();

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  const base = makeReactLeafletModule();
  function MarkerMock({
    children,
    icon,
    title,
    eventHandlers,
  }: {
    children?: React.ReactNode;
    icon?: unknown;
    title?: string;
    eventHandlers?: Record<string, (e: unknown) => void>;
  }) {
    const prev = useRef(icon);
    useEffect(() => {
      if (icon != null && icon !== prev.current) setIcon(title ?? "");
      prev.current = icon;
    });
    return (
      <div
        data-leaflet="Marker"
        data-title={title}
        onMouseOver={(e) => eventHandlers?.mouseover?.({ originalEvent: e.nativeEvent })}
        onClick={() => eventHandlers?.click?.({})}
      >
        {children}
      </div>
    );
  }
  return { ...base, Marker: MarkerMock };
});

import { render, waitFor, cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AtlasViewer from "@/pages/AtlasViewer";
import { makeProject, makeEntity, makePlacement, makeSearchIndex } from "../helpers/makeProject";

const project = makeProject({
  entities: [
    makeEntity(),
    makeEntity({ id: "salt-cave", title: "Salt Cave", type: "cave" }),
    makeEntity({ id: "old-shrine", title: "Old Shrine", type: "temple" }),
  ],
  placements: [
    makePlacement(),
    makePlacement({ id: "salt-cave@overview", entityId: "salt-cave", x: 100, y: 120 }),
    makePlacement({ id: "old-shrine@overview", entityId: "old-shrine", x: 800, y: 700 }),
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
  // A mouse pointer, so hovering a pin opens the peek card.
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
  setIcon.mockClear();
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
  await waitFor(() => expect(document.querySelectorAll('[data-leaflet="Marker"]').length).toBe(3));
  setIcon.mockClear();
}

const marker = (title: string) =>
  document.querySelector<HTMLElement>(`[data-leaflet="Marker"][data-title^="${title}"]`)!;

describe("pin layer re-renders (ticket 11)", () => {
  it("a search keystroke doesn't call setIcon on any pin", async () => {
    await renderViewer();
    fireEvent.click(document.querySelector('[aria-label="Search atlas (Ctrl+K)"]')!);
    const input = await waitFor(() => screen.getByPlaceholderText(/Search titles, lore body/));
    fireEvent.change(input, { target: { value: "s" } });
    fireEvent.change(input, { target: { value: "sa" } });
    await waitFor(() => expect(input).toHaveValue("sa"));
    expect(setIcon).not.toHaveBeenCalled();
  });

  it("a hover peek doesn't call setIcon on any pin", async () => {
    await renderViewer();
    fireEvent.mouseOver(marker("Salt Cave"));
    await screen.findByRole("dialog", { name: "Salt Cave preview" });
    fireEvent.mouseOver(marker("Old Shrine"));
    await screen.findByRole("dialog", { name: "Old Shrine preview" });
    expect(setIcon).not.toHaveBeenCalled();
  });

  it("opening a pin only re-icons that pin", async () => {
    await renderViewer();
    fireEvent.click(marker("Salt Cave"));
    await waitFor(() => expect(setIcon).toHaveBeenCalled());
    expect(new Set(setIcon.mock.calls.map(([t]) => t))).toEqual(new Set(["Salt Cave, Cave"]));
  });
});
