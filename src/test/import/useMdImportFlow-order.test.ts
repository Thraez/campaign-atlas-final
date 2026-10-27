/**
 * code-retro 03: Sync records what it wrote even when the rebuild fails,
 * checks for conflicts before copying any image, and follows a moved note.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { useMdImportFlow } from "@/atlas/import/useMdImportFlow";
import { hashContent, saveAtlasPatchToLocalFs } from "@/atlas/save/localFsSave";
import { loadSyncMap, saveSyncMap } from "@/atlas/sync/useSyncSettings";
import type { SyncMap } from "@/atlas/import/syncMap";
import type { ImportFolderConfig } from "@/atlas/content/schema";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

vi.mock("@/atlas/save/localFsSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/save/localFsSave")>();
  return {
    ...actual,
    saveAtlasPatchToLocalFs: vi.fn(() => Promise.resolve({ saved: 1, rebuilt: true })),
  };
});

vi.mock("@/atlas/sync/useSyncSettings", () => ({
  loadSyncMap: vi.fn(() => Promise.resolve({})),
  saveSyncMap: vi.fn(() => Promise.resolve()),
  loadSettings: vi.fn(() => Promise.resolve({})),
  saveSettings: vi.fn(() => Promise.resolve()),
}));

const importConfig: ImportFolderConfig = { folders: {}, defaultFolder: "notes" };
const TARGET = "content/w/notes/corven.md";
const NOTE = "---\ntitle: Corven\n---\n![[portrait.png]]\n";

function setup() {
  return renderHook(() =>
    useMdImportFlow({
      worldId: "w",
      importConfig,
      existingById: new Map([["placeholder", "content/w/notes/placeholder.md"]]),
      onImported: vi.fn(),
    }),
  );
}

/** A fake dev server: a vault scan, the read endpoint, and image copy. */
function fakeServer(opts: { files: Record<string, string>; onDisk?: Record<string, string> }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/__atlas/vault-scan")) {
      return { ok: true, json: async () => ({ ok: true, files: opts.files }) };
    }
    if (url.startsWith("/__atlas/read?path=")) {
      const path = decodeURIComponent(url.slice("/__atlas/read?path=".length));
      const contents = opts.onDisk?.[path];
      if (contents === undefined) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ path, contents }), { status: 200 });
    }
    if (url === "/__atlas/vault-image-copy") {
      return {
        ok: true,
        json: async () => ({ ok: true, target: "/atlas/assets/images/corven-1.png" }),
      };
    }
    throw new Error(`unexpected fetch to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const imageCopies = (fetchMock: ReturnType<typeof fakeServer>) =>
  fetchMock.mock.calls.filter(([url]) => url === "/__atlas/vault-image-copy");

describe("Sync commit order (code-retro 03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the sync map for written files when the rebuild fails", async () => {
    fakeServer({ files: { "03_Entities/corven.md": NOTE } });
    vi.mocked(saveAtlasPatchToLocalFs).mockResolvedValueOnce({
      saved: 1,
      paths: ["content/w/notes/corven.md"],
      rebuilt: false,
    });
    const { result } = setup();
    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    await act(async () => {
      await result.current.commit();
    });

    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringMatching(/rebuild failed/),
      expect.anything(),
    );
    const saved = vi.mocked(saveSyncMap).mock.calls.at(-1)?.[0] as SyncMap;
    expect(saved["03_Entities/corven.md"]).toMatchObject({ id: "corven" });
  });

  it("a conflict on a new file stops the commit before any image is copied", async () => {
    const fetchMock = fakeServer({
      files: { "03_Entities/corven.md": NOTE },
      onDisk: { [TARGET]: "someone else's note" },
    });
    const { result } = setup();
    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    expect(result.current.rows[0].targetPath).toBe(TARGET);
    await act(async () => {
      await result.current.commit();
    });

    expect(toast.error).toHaveBeenCalledWith(`Import conflict: ${TARGET}`, expect.anything());
    expect(imageCopies(fetchMock)).toHaveLength(0);
    expect(saveAtlasPatchToLocalFs).not.toHaveBeenCalled();
  });

  it("copies images once the targets are free", async () => {
    const fetchMock = fakeServer({ files: { "03_Entities/corven.md": NOTE } });
    const { result } = setup();
    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    await act(async () => {
      await result.current.commit();
    });

    expect(imageCopies(fetchMock)).toHaveLength(1);
    const [changes] = vi.mocked(saveAtlasPatchToLocalFs).mock.calls[0];
    expect(changes[0].content).toContain("/atlas/assets/images/corven-1.png");
  });

  it("a note moved in the vault is re-recorded at its new path, and the next sync changes nothing", async () => {
    const hash = await hashContent(NOTE);
    let stored: SyncMap = {
      "03_Entities/corven.md": { id: "corven", baseType: "npc", approvedHash: hash },
    };
    vi.mocked(loadSyncMap).mockImplementation(async () => stored);
    vi.mocked(saveSyncMap).mockImplementation(async (m: SyncMap) => {
      stored = m;
    });
    fakeServer({ files: { "03_Entities/People/corven.md": NOTE } });
    const { result } = setup();

    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    expect(Object.keys(stored)).toEqual(["03_Entities/People/corven.md"]);
    expect(stored["03_Entities/People/corven.md"]).toMatchObject({
      id: "corven",
      approvedHash: hash,
    });

    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    expect(result.current.rows.map((r) => [r.vaultState, r.included])).toEqual([
      ["unchanged", false],
    ]);
  });

  it("a copy of a note (the original still there) does not move its sync-map entry", async () => {
    const hash = await hashContent(NOTE);
    const stored: SyncMap = {
      "03_Entities/corven.md": { id: "corven", baseType: "npc", approvedHash: hash },
    };
    vi.mocked(loadSyncMap).mockImplementation(async () => stored);
    fakeServer({ files: { "03_Entities/corven.md": NOTE, "03_Entities/corven copy.md": NOTE } });
    const { result } = setup();
    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    expect(saveSyncMap).not.toHaveBeenCalled();
  });
});
