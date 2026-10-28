// eval-31: the Save chip counts an unsaved entity edit, but the page's Save
// never wrote it (only the entity panel does), so Save answered "No changes to
// save". The entity panel keeps owning that save; the chip and Save point to it.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

const toastMock = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  });
  return fn;
});
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";
import { makeEntity, makeProject, makeSearchIndex } from "../helpers/makeProject";
import { clearEditorSession } from "../helpers/clearEditorSession";
import { idbSet } from "@/atlas/session/idbStore";
import { SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { serializeSession, type SessionState } from "@/atlas/session/sessionSnapshot";
import type { EntityEditDraft } from "@/atlas/categories/useEntityEditDraft";

// The entity file must sit under content/<world>/ for the save allowlist.
const ENTITY_PATH = "content/astrath-deeprealm/iron-tower.md";
const ENTITY_FILE =
  "---\natlas:\n  id: iron-tower\n  type: settlement\n  visibility: player\n---\nA tower of black iron.\n";

/** A parked entity edit for iron-tower: summary typed, not saved. */
function dirtyEntityDraft(): EntityEditDraft {
  const fields = {
    id: "iron-tower",
    type: "settlement",
    visibility: "player" as const,
    summary: "",
  };
  const body = "A tower of black iron.\n";
  return {
    sourcePath: ENTITY_PATH,
    baseHash: "sha256:abc",
    fields: { ...fields, summary: "Edited summary" },
    body,
    secrets: [],
    pristine: JSON.stringify({ fields, body, secrets: [] }),
  };
}

async function seedSession(over: Partial<SessionState>) {
  const state: SessionState = {
    overrides: {},
    mapOverrideByMap: {},
    regionByMap: {},
    routeByMap: {},
    fogByMap: {},
    layerByMap: {},
    entityEdit: null,
    savedAt: Date.now(),
    ...over,
  };
  await idbSet(SESSION_IDB_KEY, serializeSession(state));
}

const saveBodies: unknown[] = [];
/** Reads of the entity file: each EntityEditPanel mount reads it once. */
let entityReads = 0;

beforeEach(async () => {
  localStorage.clear();
  await clearEditorSession();
  saveBodies.length = 0;
  entityReads = 0;
  toastMock.info.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      const json = (status: number, body: unknown) =>
        Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        } as unknown as Response);
      if (u.includes("/__atlas/read")) {
        if (u.includes(encodeURIComponent(ENTITY_PATH))) {
          entityReads++;
          return json(200, { contents: ENTITY_FILE });
        }
        return json(404, {});
      }
      if (u.includes("/__atlas/save")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { files: { path: string }[] };
        saveBodies.push(body);
        return json(200, {
          saved: body.files.length,
          paths: body.files.map((f) => f.path),
          build: { ok: true, durationMs: 1 },
        });
      }
      if (u.includes("/__atlas/assets/images")) return json(200, { images: [] });
      return json(
        200,
        u.includes("search-index")
          ? makeSearchIndex()
          : makeProject({ entities: [makeEntity({ sourcePath: ENTITY_PATH })] }),
      );
    }),
  );
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clearEditorSession();
});

function renderEditor() {
  render(
    <MemoryRouter>
      <AtlasPlacementEditor />
    </MemoryRouter>,
  );
}

describe("Save with an unsaved entity edit", () => {
  it("with only an entity edit pending, the chip names it and Save opens the entity panel", async () => {
    await seedSession({ entityEdit: dirtyEntityDraft() });
    renderEditor();

    await waitFor(() =>
      expect(screen.getByText("1 entity edit – open it to save")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The entity panel opens on the parked draft, in Edit, with the typed summary.
    await waitFor(() => expect(screen.getByDisplayValue("Edited summary")).toBeInTheDocument());
    expect(toastMock.info).not.toHaveBeenCalledWith("No changes to save");
    expect(saveBodies).toHaveLength(0);
  });

  it("Cmd+S with only an entity edit pending also opens the entity panel", async () => {
    await seedSession({ entityEdit: dirtyEntityDraft() });
    renderEditor();
    await screen.findByText("1 entity edit – open it to save");

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() => expect(screen.getByDisplayValue("Edited summary")).toBeInTheDocument());
    expect(toastMock.info).not.toHaveBeenCalledWith("No changes to save");
  });

  it("with map drafts and an entity edit, Save saves the map drafts and says the entity edit is still open", async () => {
    await seedSession({
      entityEdit: dirtyEntityDraft(),
      mapOverrideByMap: { overview: { name: "Renamed Overview" } },
    });
    renderEditor();

    await waitFor(() => expect(screen.getByText(/1 entity edit open/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/_atlas\/world\.yaml/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));

    await waitFor(() => expect(saveBodies).toHaveLength(1));
    const written = (saveBodies[0] as { files: { path: string }[] }).files.map((f) => f.path);
    expect(written).toEqual(["content/astrath-deeprealm/_atlas/world.yaml"]);
    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(
        expect.stringMatching(/entity edit.*still open/i),
        expect.anything(),
      ),
    );
  });

  it("Save while the entity is already open in Edit keeps the panel mounted", async () => {
    await seedSession({ entityEdit: dirtyEntityDraft() });
    renderEditor();
    await screen.findByText("1 entity edit – open it to save");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByDisplayValue("Edited summary");
    await waitFor(() => expect(entityReads).toBe(1));

    // A remount would re-run the panel's load (and drop its conflict banners).
    // Cmd+S: the open panel has its own Save button, so the toolbar's is ambiguous.
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(toastMock.info).toHaveBeenCalledTimes(2));
    expect(screen.getByDisplayValue("Edited summary")).toBeInTheDocument();
    expect(entityReads).toBe(1);
  });
});
