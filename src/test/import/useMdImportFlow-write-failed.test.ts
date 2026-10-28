/**
 * Ticket eval-2026-10/33: when the import's save is rolled back (207
 * WriteFailed), nothing was written, so the sync map must not record the
 * notes and lastSyncAt must not move. The DM is told which file failed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { useMdImportFlow } from "@/atlas/import/useMdImportFlow";
import { saveAtlasPatchToLocalFs, WriteFailedError } from "@/atlas/save/localFsSave";
import { saveSyncMap, saveSettings } from "@/atlas/sync/useSyncSettings";
import type { ImportFolderConfig } from "@/atlas/content/schema";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

vi.mock("@/atlas/save/localFsSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/save/localFsSave")>();
  return { ...actual, saveAtlasPatchToLocalFs: vi.fn() };
});

vi.mock("@/atlas/sync/useSyncSettings", () => ({
  loadSyncMap: vi.fn(() => Promise.resolve({})),
  saveSyncMap: vi.fn(() => Promise.resolve()),
  loadSettings: vi.fn(() => Promise.resolve({})),
  saveSettings: vi.fn(() => Promise.resolve()),
}));

const importConfig: ImportFolderConfig = { folders: {}, defaultFolder: "notes" };
const TARGET = "content/w/notes/corven.md";
const NOTE = "---\ntitle: Corven\n---\nA harbour fixer.\n";

function fakeVaultScan() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/__atlas/vault-scan")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: { "03_Entities/corven.md": NOTE } }),
      };
    }
    if (url.startsWith("/__atlas/read?path=")) return new Response("not found", { status: 404 });
    throw new Error(`unexpected fetch to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("Sync commit on a rolled-back write (eval-2026-10/33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records nothing in the sync map, leaves lastSyncAt, and names the failed file", async () => {
    fakeVaultScan();
    vi.mocked(saveAtlasPatchToLocalFs).mockRejectedValueOnce(
      new WriteFailedError(TARGET, 0, "EACCES: permission denied"),
    );
    const onImported = vi.fn();
    const { result } = renderHook(() =>
      useMdImportFlow({
        worldId: "w",
        importConfig,
        existingById: new Map([["placeholder", "content/w/notes/placeholder.md"]]),
        onImported,
      }),
    );
    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });
    expect(result.current.rows[0].targetPath).toBe(TARGET);

    await act(async () => {
      await result.current.commit();
    });

    expect(saveAtlasPatchToLocalFs).toHaveBeenCalledTimes(1);
    expect(saveSyncMap).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(TARGET));
    // The staged rows stay, so the DM can retry.
    expect(result.current.rows).toHaveLength(1);
  });
});
