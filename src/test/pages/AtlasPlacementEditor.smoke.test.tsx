// Page-level tests for AtlasPlacementEditor.
//
// This is the regression net required before the editor monolith teardown
// (docs/superpowers/plans/2026-07-13-editor-monolith-teardown.md): it proves
// the real editor page still mounts and behaves after each extraction.
//
// Scope: chrome that is always present, and the page-level wiring that has no
// other owner — the player-lens filter, the toolbar toggles, and the
// unplaced-entity affordance. Save-flow correctness stays in
// placement-save-integration.test.tsx; per-hook behaviour stays in the unit
// tests under src/test/editor/. Keep assertions black-box so Leaflet internals
// and class-name churn can't break them.

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
import type { AtlasProject } from "@/atlas/content/schema";
import { makeProject, makeEntity, makePlacement } from "../helpers/makeProject";
import { clearEditorSession } from "../helpers/clearEditorSession";

function stubFetch(project: AtlasProject) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(project),
      } as unknown as Response),
    ),
  );
}

/** Mount the page and wait for canon to finish loading. */
async function mountEditor(project: AtlasProject = makeProject()) {
  stubFetch(project);
  render(
    <MemoryRouter>
      <AtlasPlacementEditor />
    </MemoryRouter>,
  );
  // The save-status surface is always present once canon loads. The Save
  // *button* only appears when there is something to write, so a clean fixture
  // legitimately has none — don't wait on that.
  await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
}

/** Expand a rail category so its entities render. */
function openRailSection(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(async () => {
  localStorage.clear();
  await clearEditorSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AtlasPlacementEditor smoke", () => {
  it("mounts the real editor page with a fixture atlas", async () => {
    await mountEditor();
    // Prove the fixture canon actually flowed through: open the Locations rail
    // section and find the placed fixture entity (type "settlement").
    openRailSection("Locations");
    await waitFor(() => expect(screen.getByText("Iron Tower")).toBeInTheDocument());
  });
});

describe("AtlasPlacementEditor player lens", () => {
  // A DM-only entity alongside the player-visible fixture one. Both land in the
  // Locations category, so the rail section is identical in both modes and the
  // only difference under test is the lens.
  const withSecret = () =>
    makeProject({
      entities: [
        makeEntity(),
        makeEntity({
          id: "black-ledger",
          title: "Black Ledger",
          type: "settlement",
          visibility: "dm",
        }),
      ],
      placements: [
        makePlacement(),
        makePlacement({ id: "black-ledger@overview", entityId: "black-ledger", visibility: "dm" }),
      ],
    });

  it("lists DM-only entities in DM view", async () => {
    await mountEditor(withSecret());
    openRailSection("Locations");
    await waitFor(() => expect(screen.getByText("Iron Tower")).toBeInTheDocument());
    expect(screen.getByText("Black Ledger")).toBeInTheDocument();
  });

  it("hides DM-only entities from the rail when previewing as a player", async () => {
    await mountEditor(withSecret());
    openRailSection("Locations");
    await waitFor(() => expect(screen.getByText("Black Ledger")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Player view" }));

    // The whole point of the preview: what the DM sees here is what players get.
    await waitFor(() => expect(screen.queryByText("Black Ledger")).not.toBeInTheDocument());
    expect(screen.getByText("Iron Tower")).toBeInTheDocument();
  });

  it("shows a standing reminder while the player lens is on, and drops it on the way back", async () => {
    await mountEditor();
    expect(screen.queryByTestId("player-mode-indicator")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Player view" }));
    await waitFor(() => expect(screen.getByTestId("player-mode-indicator")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "DM view" }));
    await waitFor(() =>
      expect(screen.queryByTestId("player-mode-indicator")).not.toBeInTheDocument(),
    );
  });

  it("marks the active view mode as pressed for assistive tech", async () => {
    await mountEditor();
    expect(screen.getByRole("button", { name: "DM view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Player view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("AtlasPlacementEditor toolbar", () => {
  it("starts with nothing to undo or redo", async () => {
    await mountEditor();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("toggles the distance ruler and reports its state", async () => {
    await mountEditor();
    const ruler = screen.getByRole("button", { name: "Toggle distance ruler" });
    expect(ruler).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(ruler);
    await waitFor(() => expect(ruler).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(ruler);
    await waitFor(() => expect(ruler).toHaveAttribute("aria-pressed", "false"));
  });
});

describe("AtlasPlacementEditor unplaced entities", () => {
  it("disables 'Place a pin' when every entity is already on the map", async () => {
    await mountEditor();
    expect(screen.getByRole("button", { name: "Place a pin" })).toBeDisabled();
  });

  it("offers the entities that have no placement yet", async () => {
    await mountEditor(
      makeProject({
        entities: [
          makeEntity(),
          makeEntity({ id: "salt-road", title: "Salt Road", type: "settlement" }),
        ],
        // Only the fixture entity is placed, so "Salt Road" is the unplaced one.
        placements: [makePlacement()],
      }),
    );

    const placePin = screen.getByRole("button", { name: "Place a pin" });
    expect(placePin).toBeEnabled();

    fireEvent.click(placePin);
    await waitFor(() => expect(screen.getByText("Salt Road")).toBeInTheDocument());
  });
});
