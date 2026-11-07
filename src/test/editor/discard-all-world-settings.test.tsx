// eval-47: "Discard all" used to reset only the drafts registered with the
// session, leaving an edited world name or calendar dirty: the chip still read
// "unsaved" right after the DM discarded everything. Both are session holders
// now, so a reload restores them and Discard all clears them.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";
import { makeMap, makeProject, makeSearchIndex, makeWorld } from "../helpers/makeProject";
import { clearEditorSession } from "../helpers/clearEditorSession";
import { idbGet, idbSet } from "@/atlas/session/idbStore";
import { SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { serializeSession } from "@/atlas/session/sessionSnapshot";

beforeEach(async () => {
  localStorage.clear();
  await clearEditorSession();
  // The DM's unsaved drafts: a world rename and a new calendar, nothing else.
  await idbSet(
    SESSION_IDB_KEY,
    serializeSession({
      overrides: {},
      mapOverrideByMap: {},
      regionByMap: {},
      routeByMap: {},
      fogByMap: {},
      layerByMap: {},
      worldOverride: { "astrath-deeprealm": { name: "Astrath Reborn" } },
      calendar: { value: { months: [{ name: "Frost", days: 30 }] } },
      entityEdit: null,
      savedAt: Date.now(),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const json = (status: number, body: unknown) =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        }) as unknown as Response;
      if (u.includes("/__atlas/")) return json(404, {});
      if (u.includes("search-index")) return json(200, makeSearchIndex());
      return json(200, makeProject({ worlds: [makeWorld()], maps: [makeMap()] }));
    }),
  );
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clearEditorSession();
});

describe("Discard all", () => {
  it("clears the world settings and calendar drafts", async () => {
    render(
      <MemoryRouter>
        <AtlasPlacementEditor />
      </MemoryRouter>,
    );
    // Restored from the session: one change each.
    expect(await screen.findByText("2 unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard unsaved changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));

    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await waitFor(async () => expect(await idbGet(SESSION_IDB_KEY)).toBeNull());
  });
});
