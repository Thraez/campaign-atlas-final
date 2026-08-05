import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { useMdImportFlow } from "@/atlas/import/useMdImportFlow";
import type { ImportFolderConfig } from "@/atlas/content/schema";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

vi.mock("@/atlas/import/buildImportChanges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/import/buildImportChanges")>();
  return {
    ...actual,
    buildImportChanges: vi.fn(() =>
      Promise.resolve([
        {
          path: "content/w/notes/corven.md",
          content: "final content",
          kind: "entity-md",
          baseHash: null,
        },
      ]),
    ),
  };
});

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

const importConfig: ImportFolderConfig = {
  folders: {},
  defaultFolder: "notes",
};

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

describe("useMdImportFlow commit — rewrites vault image embeds (V12/C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies an in-scope embed into a plain image link, drops a refused one with no broken link, and reports the skip", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/__atlas/vault-scan")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            files: {
              "03_Entities/corven.md": "![[portrait.png]]\n\n![[cabal-lair.png]]\n",
            },
          }),
        };
      }
      if (url === "/__atlas/vault-image-copy") {
        const body = JSON.parse(String(init?.body)) as { rawSrc: string };
        if (body.rawSrc === "portrait.png") {
          return {
            ok: true,
            json: async () => ({ ok: true, target: "/atlas/assets/images/corven-1.png" }),
          };
        }
        return { ok: true, json: async () => ({ ok: false, reason: "outside-candidates" }) };
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = setup();
    await act(async () => {
      await result.current.openWithVaultScan("/vault", [], ["03_Entities"]);
    });

    const { buildImportChanges } = await import("@/atlas/import/buildImportChanges");

    await act(async () => {
      await result.current.commit();
    });

    const passedRows = vi.mocked(buildImportChanges).mock.calls[0][0];
    const row = passedRows.find((r) => r.vaultRelPath === "03_Entities/corven.md");
    expect(row?.rawContent).toBe("![](/atlas/assets/images/corven-1.png)\n\n\n");
    expect(toast.warning).toHaveBeenCalledWith("1 image skipped — not in the folders you picked.");
  });
});
