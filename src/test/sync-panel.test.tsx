import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { SyncPanel, VaultSyncSummary, VaultFolderPicker } from "@/atlas/sync/SyncPanel";
import { loadSettings, saveSettings } from "@/atlas/sync/useSyncSettings";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

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

  it("shows an error toast when saveSettings rejects (write failure)", async () => {
    mockSave.mockRejectedValue(new Error("POST /__atlas/local-write failed (500): disk full"));
    mockLoad.mockResolvedValue({ vaultPath: "/My Vault" });
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("/My Vault")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't save sync settings"),
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
    await waitFor(() => expect(onSync).toHaveBeenCalledWith("/MyVault", ["_hidden/**"], []));
  });

  it("shows last-sync timestamp when lastSyncAt is set", async () => {
    mockLoad.mockResolvedValue({
      vaultPath: "/Vault",
      lastSyncAt: "2026-06-21T10:00:00.000Z",
    });
    render(<SyncPanel onSync={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Last synced:/i)).toBeTruthy());
  });

  it("shows a DM-build-required note and disables Sync when hasDmBuild is false", async () => {
    mockLoad.mockResolvedValue({ vaultPath: "/Vault" });
    render(<SyncPanel onSync={vi.fn()} hasDmBuild={false} />);
    await waitFor(() => expect(screen.getByText(/Rebuild in DM mode first/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /sync now/i })).toBeDisabled();
  });

  it("does not show the DM-build-required note when hasDmBuild is true", async () => {
    mockLoad.mockResolvedValue({ vaultPath: "/Vault" });
    render(<SyncPanel onSync={vi.fn()} hasDmBuild={true} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sync now/i })).not.toBeDisabled(),
    );
    expect(screen.queryByText(/Rebuild in DM mode first/i)).toBeNull();
  });
});

describe("VaultFolderPicker", () => {
  const folders = [
    { name: "03_Entities", noteCount: 55 },
    { name: "10_DmNotesAndSecrets", noteCount: 49 },
  ];

  it("shows each folder with how many notes it holds", () => {
    render(<VaultFolderPicker folders={folders} selected={[]} onChange={() => {}} />);
    expect(screen.getByText("03_Entities")).toBeInTheDocument();
    expect(screen.getByText(/55 notes/i)).toBeInTheDocument();
  });

  it("reports the folder name when ticked, so callers build the pattern", () => {
    const onChange = vi.fn();
    render(<VaultFolderPicker folders={folders} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /03_Entities/i }));
    expect(onChange).toHaveBeenCalledWith(["03_Entities"]);
  });

  it("unticks a selected folder", () => {
    const onChange = vi.fn();
    render(<VaultFolderPicker folders={folders} selected={["03_Entities"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /03_Entities/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("VaultSyncSummary", () => {
  it("leads with what changed", () => {
    render(<VaultSyncSummary changed={3} added={1} unchanged={45} />);
    expect(screen.getByText(/3 notes changed since you published them/i)).toBeInTheDocument();
    expect(screen.getByText(/1 new note/i)).toBeInTheDocument();
  });

  it("keeps unchanged notes quiet but visible as a count", () => {
    render(<VaultSyncSummary changed={0} added={0} unchanged={45} />);
    expect(screen.getByText(/45 unchanged/i)).toBeInTheDocument();
  });

  it("says nothing changed when nothing changed", () => {
    render(<VaultSyncSummary changed={0} added={0} unchanged={0} />);
    expect(screen.getByText(/nothing to bring over/i)).toBeInTheDocument();
  });
});
