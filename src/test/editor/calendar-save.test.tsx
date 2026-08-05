// Render-level integration test for the calendar save seam.
//
// Naming the months used to be unreachable from the UI — `calendar:` in
// world.yaml was a hand-edit, which is why the Timeline rendered raw "612-6-3"
// dates. This proves the new Calendar panel marks the session dirty (so the one
// Save control actually appears) and that the months reach the world.yaml write.

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
import { clearEditorSession } from "../helpers/clearEditorSession";

beforeEach(async () => {
  localStorage.clear();
  await clearEditorSession();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
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

async function openCalendarPanel() {
  render(
    <MemoryRouter>
      <AtlasPlacementEditor />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByText("Name the months"));
  return await screen.findByLabelText("What you count years from");
}

describe("calendar save path (Calendar panel → world.yaml)", () => {
  it("naming a month marks the session unsaved so Save becomes available", async () => {
    await openCalendarPanel();
    // Clean session offers no Save button — that is the point of one control.
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /add a month/i }));
    fireEvent.change(screen.getByLabelText("Name of month 1"), {
      target: { value: "Longnight" },
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument());
  });

  it("writes the named months into the world.yaml save batch", async () => {
    await openCalendarPanel();
    fireEvent.change(screen.getByLabelText("What you count years from"), {
      target: { value: "AS" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add a month/i }));
    fireEvent.change(screen.getByLabelText("Name of month 1"), {
      target: { value: "Longnight" },
    });
    fireEvent.change(screen.getByLabelText("Days in month 1"), { target: { value: "40" } });

    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/_atlas\/world\.yaml/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /show diff/i }));
    await waitFor(() =>
      expect(
        screen.getByText(
          (_content, el) => el?.tagName === "PRE" && (el.textContent ?? "").includes("Longnight"),
        ),
      ).toBeInTheDocument(),
    );
  });

  it("reports the year length from the months entered", async () => {
    await openCalendarPanel();
    fireEvent.click(screen.getByRole("button", { name: /add a month/i }));
    fireEvent.change(screen.getByLabelText("Days in month 1"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /add a month/i }));
    fireEvent.change(screen.getByLabelText("Days in month 2"), { target: { value: "35" } });

    await waitFor(() => expect(screen.getByText(/2 months · 75-day year/)).toBeInTheDocument());
  });

  it("warns about months left unnamed, since those render as a number", async () => {
    await openCalendarPanel();
    fireEvent.click(screen.getByRole("button", { name: /add a month/i }));
    await waitFor(() => expect(screen.getByText(/One month has no name yet/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Name of month 1"), { target: { value: "Thaw" } });
    await waitFor(() => expect(screen.queryByText(/no name yet/i)).toBeNull());
  });
});
