// First page-level smoke test for AtlasViewer.
//
// Renders the REAL page component against a fixture atlas and asserts it mounts
// and surfaces known content — black-box, resilient to Leaflet internals.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted above the page import by vitest so react-leaflet resolves to the mock.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { render, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasViewer from "@/pages/AtlasViewer";
import { makeProject, makeSearchIndex } from "../helpers/makeProject";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = String(url).includes("search-index") ? makeSearchIndex() : makeProject();
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      } as unknown as Response);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AtlasViewer smoke", () => {
  it("mounts, loads the atlas, and surfaces the active map name", async () => {
    render(
      <MemoryRouter>
        <AtlasViewer />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("main#atlas-main")).toBeInTheDocument());
    expect(document.querySelector("main#atlas-main")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Overview"),
    );
  });
});
