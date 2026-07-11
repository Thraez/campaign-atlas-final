import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncPanel } from "@/atlas/sync/SyncPanel";
import { loadSettings, saveSettings } from "@/atlas/sync/useSyncSettings";

vi.mock("@/atlas/sync/useSyncSettings", () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

const mockLoad = loadSettings as unknown as ReturnType<typeof vi.fn>;
const mockSave = saveSettings as unknown as ReturnType<typeof vi.fn>;

describe("SyncPanel — render/interaction contract (N35)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLoad.mockResolvedValue({});
    mockSave.mockResolvedValue(undefined);
  });

  it("Sync button is disabled when no vault path is saved", async () => {
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() => expect(loadSettings).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /sync now/i })).toBeDisabled();
  });

  it("populates vault path input from saved settings", async () => {
    mockLoad.mockResolvedValue({ vaultPath: "/Users/dm/My Vault" });
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("/Users/dm/My Vault")).toBeTruthy());
  });

  it("populates globs textarea from saved settings", async () => {
    mockLoad.mockResolvedValue({ ignoreGlobs: ["Templates/**", "_assets/**"] });
    render(<SyncPanel onSync={vi.fn()} />);
    // getByDisplayValue struggles with multiline; query the textarea directly
    await waitFor(() => {
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      expect(ta?.value).toContain("Templates/**");
      expect(ta?.value).toContain("_assets/**");
    });
  });

  it("Sync button becomes enabled when vault path is loaded", async () => {
    mockLoad.mockResolvedValue({ vaultPath: "/Vault" });
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sync now/i })).not.toBeDisabled(),
    );
  });

  it("Save button calls saveSettings with vault path and parsed globs", async () => {
    mockLoad.mockResolvedValue({ vaultPath: "/My Vault", ignoreGlobs: ["Templates/**"] });
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("/My Vault")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ vaultPath: "/My Vault", ignoreGlobs: ["Templates/**"] }),
      ),
    );
  });

  it("Sync now button calls onSync with vault root and parsed globs", async () => {
    const onSync = vi.fn().mockResolvedValue(undefined);
    mockLoad.mockResolvedValue({ vaultPath: "/MyVault", ignoreGlobs: ["_hidden/**"] });
    render(<SyncPanel onSync={onSync} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sync now/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /sync now/i }));
    await waitFor(() => expect(onSync).toHaveBeenCalledWith("/MyVault", ["_hidden/**"]));
  });

  it("shows last-sync timestamp when lastSyncAt is set", async () => {
    mockLoad.mockResolvedValue({
      vaultPath: "/Vault",
      lastSyncAt: "2026-06-21T10:00:00.000Z",
    });
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Last synced:/i)).toBeTruthy());
  });
});
