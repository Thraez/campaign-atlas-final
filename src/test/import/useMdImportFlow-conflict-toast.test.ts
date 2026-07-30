import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { useMdImportFlow } from "@/atlas/import/useMdImportFlow";
import { ConflictError } from "@/atlas/save/localFsSave";
import type { ImportFolderConfig } from "@/atlas/content/schema";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

vi.mock("@/atlas/import/buildImportChanges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/import/buildImportChanges")>();
  return { ...actual, buildImportChanges: vi.fn(() => Promise.resolve([])) };
});

vi.mock("@/atlas/save/localFsSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/save/localFsSave")>();
  return { ...actual, saveAtlasPatchToLocalFs: vi.fn() };
});

const importConfig: ImportFolderConfig = {
  folders: { npc: "content/w/npcs", location: "content/w/locations" },
  defaultFolder: "content/w/notes",
};

function setup() {
  return renderHook(() =>
    useMdImportFlow({
      worldId: "w",
      importConfig,
      existingById: new Map([["existing-npc", "content/w/npcs/existing-npc.md"]]),
      onImported: vi.fn(),
    }),
  );
}

describe("useMdImportFlow commit — conflict-toast guidance (N126)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("on an already-exists 409, points the DM at rebuild+reload before the overwrite checkbox, not at it alone", async () => {
    const { saveAtlasPatchToLocalFs } = await import("@/atlas/save/localFsSave");
    vi.mocked(saveAtlasPatchToLocalFs).mockRejectedValue(
      new ConflictError("already-exists", "content/w/npcs/new-guy.md"),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.commit();
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Import conflict: content/w/npcs/new-guy.md",
      expect.objectContaining({
        description: expect.stringContaining("npm run atlas:build"),
      }),
    );
    // The old guidance sent the DM straight to "Select all overwrites" with no
    // mention that the row won't even show up as a conflict until the atlas is
    // rebuilt and canon is reloaded — that's the part this fix corrects.
    const description = vi.mocked(toast.error).mock.calls[0][1]?.description as string;
    expect(description.indexOf("atlas:build")).toBeLessThan(description.indexOf("Select all overwrites"));
  });

  it("still tells the DM to reload canon for a stale-base conflict (unchanged branch)", async () => {
    const { saveAtlasPatchToLocalFs } = await import("@/atlas/save/localFsSave");
    vi.mocked(saveAtlasPatchToLocalFs).mockRejectedValue(
      new ConflictError("stale-base", "content/w/npcs/existing-npc.md"),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.commit();
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Import conflict: content/w/npcs/existing-npc.md",
      expect.objectContaining({
        description: "File changed outside the editor between staging and commit. Reload canon and retry.",
      }),
    );
  });
});
