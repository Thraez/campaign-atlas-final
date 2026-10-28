// A world.yaml save conflict (the file changed on disk after the editor read
// it) used to leave the baseline stale, so "Try again" failed the same way
// until a page reload. Now the editor re-reads world.yaml and canon, rebuilds
// the batch on top, names what changed outside (and any outside edit Try again
// would overwrite), keeps the drafts, and Try again succeeds.

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
import { idbSet } from "@/atlas/session/idbStore";
import { SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { serializeSession } from "@/atlas/session/sessionSnapshot";
import { hashContent } from "@/atlas/save/localFsSave";

const YAML_PATH = "content/astrath-deeprealm/_atlas/world.yaml";

function worldYaml({ name, mapName }: { name: string; mapName: string }): string {
  return `# Written by the editor\nname: ${name}\nmaps:\n  - id: overview\n    name: ${mapName}\n`;
}

/**
 * A fake disk behind /__atlas/read and /__atlas/save (with the endpoint's
 * base-hash check), and the canon atlas.json the editor loads. An outside edit
 * changes both, as a save from another tab plus its rebuild would.
 */
const disk: { worldYaml: string | null } = { worldYaml: null };
const canon = { worldName: "Astrath Deeprealm", mapName: "Overview" };
const saves: number[] = [];
let atlasJsonReads = 0;
/** When set, the next world.yaml read waits for it (to close the modal mid-recovery). */
let readGate: Promise<void> | null = null;
/** When true, world.yaml reads fail with a 500. */
let readFails = false;

function outsideEdit(next: { worldName?: string; mapName?: string }) {
  Object.assign(canon, next);
  disk.worldYaml = worldYaml({ name: canon.worldName, mapName: canon.mapName });
}

beforeEach(async () => {
  localStorage.clear();
  await clearEditorSession();
  canon.worldName = "Astrath Deeprealm";
  canon.mapName = "Overview";
  disk.worldYaml = worldYaml({ name: canon.worldName, mapName: canon.mapName });
  saves.length = 0;
  atlasJsonReads = 0;
  readGate = null;
  readFails = false;
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
        if (!u.includes(encodeURIComponent(YAML_PATH))) return json(404, {});
        if (readGate) {
          const gate = readGate;
          readGate = null;
          await gate;
        }
        if (readFails) return json(500, {});
        return disk.worldYaml === null ? json(404, {}) : json(200, { contents: disk.worldYaml });
      }
      if (u.includes("/__atlas/save")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          files: { path: string; content: string; baseHash: string | null }[];
        };
        const yaml = body.files.find((f) => f.path === YAML_PATH);
        if (yaml) {
          const current = disk.worldYaml === null ? null : await hashContent(disk.worldYaml);
          const reason =
            yaml.baseHash === null
              ? current === null
                ? null
                : "already-exists"
              : current === null
                ? "missing-base"
                : current !== yaml.baseHash
                  ? "stale-base"
                  : null;
          if (reason) {
            saves.push(409);
            return json(409, { error: "Conflict", reason, failedPath: YAML_PATH });
          }
          disk.worldYaml = yaml.content;
        }
        saves.push(200);
        return json(200, {
          saved: body.files.length,
          paths: body.files.map((f) => f.path),
          build: { ok: true, durationMs: 1 },
        });
      }
      if (u.includes("search-index")) return json(200, makeSearchIndex());
      if (u.includes("atlas.json")) atlasJsonReads++;
      return json(
        200,
        makeProject({
          worlds: [makeWorld({ name: canon.worldName })],
          maps: [makeMap({ name: canon.mapName })],
        }),
      );
    }),
  );
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clearEditorSession();
});

async function openReview() {
  render(
    <MemoryRouter>
      <AtlasPlacementEditor />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  await screen.findByText(/_atlas\/world\.yaml/);
}

describe("world.yaml save conflict", () => {
  it("disjoint outside edit: the notice names it, the chip isn't 'Save failed', and Try again keeps both", async () => {
    await openReview();
    outsideEdit({ worldName: "Astrath Reborn" });
    const canonReadsBefore = atlasJsonReads;

    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));

    const notice = await screen.findByRole("alert");
    expect(saves).toEqual([409]);
    expect(notice).toHaveTextContent(/changed on disk/i);
    expect(notice).toHaveTextContent(/changed there: name\b/);
    expect(notice).toHaveTextContent(/your changes are kept/i);
    expect(notice).not.toHaveTextContent(/overwrite/i);
    expect(atlasJsonReads).toBeGreaterThan(canonReadsBefore);
    // A recovered conflict is not a failed save.
    expect(screen.queryByText(/Save failed —/)).toBeNull();
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(saves).toEqual([409, 200]));
    expect(disk.worldYaml).toContain("name: Astrath Reborn");
    expect(disk.worldYaml).toContain("Renamed Overview");
    expect(await screen.findByText(/Wrote 1 file/)).toBeInTheDocument();
  });

  it("same key: the notice says plainly that Try again will overwrite the outside edit", async () => {
    await openReview();
    outsideEdit({ mapName: "Obsidian Name" });

    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      /Try again will overwrite these outside edits: maps\.overview\.name/,
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(saves).toEqual([409, 200]));
    expect(disk.worldYaml).toContain("Renamed Overview");
  });

  it("missing-base: a deleted world.yaml is recreated by Try again", async () => {
    await openReview();
    disk.worldYaml = null;

    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/the whole file was deleted/);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(saves).toEqual([409, 200]));
    expect(disk.worldYaml).toContain("Renamed Overview");
  });

  it("when recovery fails, the conflict error stays and the chip says Save failed", async () => {
    await openReview();
    outsideEdit({ worldName: "Astrath Reborn" });
    readFails = true;

    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));

    // The modal's conflict error, and the chip's failed status.
    expect(await screen.findByText(/the batch was rolled back/)).toBeInTheDocument();
    expect(screen.getByText(/Save failed — Conflict/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closing the dialog mid-recovery leaves the next Save an ordinary review", async () => {
    await openReview();
    outsideEdit({ worldName: "Astrath Reborn" });
    let release!: () => void;
    readGate = new Promise((r) => (release = r));

    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));
    await waitFor(() => expect(saves).toEqual([409]));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // (Save can't reopen before the re-read lands: it refuses while the
    // baseline is loading.) The late recovery result is dropped.
    release();
    await waitFor(() => expect(screen.queryByText(/_atlas\/world\.yaml/)).toBeNull());
    await new Promise((r) => setTimeout(r, 50));

    // The next Save is an ordinary review on the re-read file, and writes.
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await screen.findByText(/_atlas\/world\.yaml/);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }));
    await waitFor(() => expect(saves).toEqual([409, 200]));
  });
});
