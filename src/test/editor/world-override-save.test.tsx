// Render-level integration test for the world-level save path (Phase 0 of the
// asset-manager-credits plan). Proves the editor now has a world-settings save
// seam: a world credits change (patchWorld, driven here via the World details
// panel) marks world.yaml dirty and flows through buildWorldYamlContent into the
// Save batch. Before this, credits were silently dropped and the L1 Increment-2
// credits toggle had nowhere to write.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted above the page import so react-leaflet resolves to the mock.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";
import { makeProject, makeSearchIndex } from "../helpers/makeProject";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
      // The world.yaml baseline read: 404 => fresh world (create-only), a valid
      // non-error baseline so onSaveClick proceeds to write world.yaml.
      if (u.includes("/__atlas/read")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        } as unknown as Response);
      }
      const body = u.includes("search-index") ? makeSearchIndex() : makeProject();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as unknown as Response);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("world-level save path (patchWorld → world.yaml credits)", () => {
  it("toggling credit badges off writes credits.badges:false into the world.yaml Save batch", async () => {
    render(
      <MemoryRouter>
        <AtlasPlacementEditor />
      </MemoryRouter>,
    );
    // Editor mounted once canon loaded.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /save/i }).length).toBeGreaterThan(0),
    );

    // Open the ☰ menu → Edit world details.
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByText("Edit world details"));

    // Turn the site-wide credit badges off (default is on).
    const badges = await screen.findByLabelText("Show credit badges");
    expect(badges).toBeChecked();
    fireEvent.click(badges);
    await waitFor(() => expect(screen.getByLabelText("Show credit badges")).not.toBeChecked());

    // Save via the rail Save (always fires onSaveClick regardless of the
    // toolbar's enabled gate).
    fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));

    // The diff modal opens and lists the world.yaml write.
    await waitFor(() => expect(screen.getByText(/_atlas\/world\.yaml/)).toBeInTheDocument());

    // Expand the diff and confirm the disabled badge switch is serialized.
    fireEvent.click(screen.getByRole("button", { name: /show diff/i }));
    await waitFor(() =>
      expect(
        screen.getByText(
          (_content, el) =>
            el?.tagName === "PRE" && (el.textContent ?? "").includes("badges: false"),
        ),
      ).toBeInTheDocument(),
    );
  });
});
