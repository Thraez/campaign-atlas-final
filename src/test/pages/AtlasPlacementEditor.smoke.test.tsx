// First page-level smoke test for AtlasPlacementEditor.
//
// This is the regression net required before the editor monolith teardown
// (docs/superpowers/plans/2026-07-13-editor-monolith-teardown.md): it proves
// the real editor page still mounts and shows its chrome after each extraction.
// Keep assertions shallow — save-flow correctness is covered by
// placement-save-integration.test.tsx.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted above the page import by vitest so react-leaflet resolves to the mock.
vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";
import { makeProject } from "../helpers/makeProject";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeProject()),
      } as unknown as Response),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AtlasPlacementEditor smoke", () => {
  it("mounts the real editor page with a fixture atlas", async () => {
    render(
      <MemoryRouter>
        <AtlasPlacementEditor />
      </MemoryRouter>,
    );
    // Editor chrome renders once canon loads: at least one Save control exists.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /save/i }).length).toBeGreaterThan(0),
    );
    // Prove the fixture canon actually flowed through: open the Locations rail
    // section and find the placed fixture entity (type "location").
    fireEvent.click(screen.getByRole("button", { name: "Locations" }));
    await waitFor(() => expect(screen.getByText("Iron Tower")).toBeInTheDocument());
  });
});
