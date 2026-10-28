// eval-32: a world.yaml 409 (stale-base) used to leave the editor's baseline
// stale, so "Try again" failed the same way until a page reload. Now the editor
// re-reads world.yaml and canon, rebuilds the batch on the fresh baseline, tells
// the DM, and keeps the drafts; Try again then succeeds.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("react-leaflet", async () => {
  const { makeReactLeafletModule } = await import("../helpers/reactLeafletMock");
  return makeReactLeafletModule();
});

import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";
import { makeProject, makeSearchIndex } from "../helpers/makeProject";
import { clearEditorSession } from "../helpers/clearEditorSession";
import { idbSet } from "@/atlas/session/idbStore";
import { SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { serializeSession } from "@/atlas/session/sessionSnapshot";
import { hashContent } from "@/atlas/save/localFsSave";

const YAML_PATH = "content/astrath-deeprealm/_atlas/world.yaml";

/** A fake disk behind /__atlas/read and /__atlas/save, with the endpoint's base-hash check. */
const disk = { worldYaml: "# Written by the editor\n" };
const saves: { status: number; files: { path: string; content: string }[] }[] = [];
let atlasJsonReads = 0;

beforeEach(async () => {
  localStorage.clear();
  await clearEditorSession();
  disk.worldYaml = "# Written by the editor\n";
  saves.length = 0;
  atlasJsonReads = 0;
  // The DM's unsaved draft: a map rename, which lands in world.yaml.
  await idbSet(
    SESSION_IDB_KEY,
    serializeSession({
      overrides: {},
      mapOverrideByMap: { overview: { name: "Renamed Overview" } },
      regionByMap: {},
      routeByMap: {},
      fogByMap: {},
      layerByMap: {},
      entityEdit: null,
      savedAt: Date.now(),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const json = (status: number, body: unknown) =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        }) as unknown as Response;
      if (u.includes("/__atlas/read")) {
        if (u.includes(encodeURIComponent(YAML_PATH)))
          return json(200, { contents: disk.worldYaml });
        return json(404, {});
      }
      if (u.includes("/__atlas/save")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          files: { path: string; content: string; baseHash: string | null }[];
        };
        const yaml = body.files.find((f) => f.path === YAML_PATH);
        if (yaml && yaml.baseHash !== (await hashContent(disk.worldYaml))) {
          saves.push({ status: 409, files: body.files });
          return json(409, {
            error: "Conflict",
            reason: "stale-base",
            failedPath: YAML_PATH,
            currentHash: await hashContent(disk.worldYaml),
          });
        }
        if (yaml) disk.worldYaml = yaml.content;
        saves.push({ status: 200, files: body.files });
        return json(200, {
          saved: body.files.length,
          paths: body.files.map((f) => f.path),
          build: { ok: true, durationMs: 1 },
        });
      }
      if (u.includes("search-index")) return json(200, makeSearchIndex());
      if (u.includes("atlas.json")) atlasJsonReads++;
      return json(200, makeProject());
    }),
  );
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clearEditorSession();
});

describe("world.yaml save conflict (eval-32)", () => {
  it("a 409 on world.yaml re-reads the file and canon, says so, keeps the drafts, and Try again succeeds", async () => {
    render(
      <MemoryRouter>
        <AtlasPlacementEditor />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await screen.findByText(/_atlas\/world\.yaml/);

    // Someone edits world.yaml outside the editor while the review is open.
    disk.worldYaml = "# Edited in Obsidian\n";
    const canonReadsBefore = atlasJsonReads;

    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));

    await waitFor(() => expect(saves.map((s) => s.status)).toEqual([409]));
    // The DM is told what happened underneath, and that the drafts are kept.
    expect(await screen.findByText(/changed on disk/i)).toBeInTheDocument();
    expect(screen.getByText(/your changes are kept/i)).toBeInTheDocument();
    await waitFor(() => expect(atlasJsonReads).toBeGreaterThan(canonReadsBefore));

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    await waitFor(() => expect(saves.map((s) => s.status)).toEqual([409, 200]));
    // Rebuilt on the fresh baseline: the outside edit survives and so does the draft.
    expect(disk.worldYaml).toContain("# Edited in Obsidian");
    expect(disk.worldYaml).toContain("Renamed Overview");
    expect(await screen.findByText(/Wrote 1 file/)).toBeInTheDocument();
  });
});
