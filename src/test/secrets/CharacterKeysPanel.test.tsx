import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterKeysPanel } from "@/atlas/secrets/CharacterKeysPanel";

vi.mock("@/atlas/save/localFsSave", () => ({
  saveAtlasPatchToLocalFs: vi.fn().mockResolvedValue({ saved: 1, paths: [] }),
  hashContent: vi.fn().mockResolvedValue("sha256:abc123"),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { saveAtlasPatchToLocalFs, hashContent } from "@/atlas/save/localFsSave";

const mockSave = vi.mocked(saveAtlasPatchToLocalFs);
const mockHash = vi.mocked(hashContent);

function stubFetchOk(jsonBody: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => jsonBody }),
  );
}

function stubFetch404() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
}

function stubFetchHang() {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
}

describe("CharacterKeysPanel — load/add/remove/persist contract (N36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue("sha256:abc123");
    mockSave.mockResolvedValue({ saved: 1, paths: ["/world/_dm/character-keys.yaml"] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading indicator while fetch is pending", () => {
    stubFetchHang();
    render(<CharacterKeysPanel worldDir="/world" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows empty state when no characters exist (404)", async () => {
    stubFetch404();
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() =>
      expect(screen.getByText(/No characters yet/i)).toBeInTheDocument(),
    );
  });

  it("populates rows from saved YAML on mount", async () => {
    stubFetchOk({ contents: "Aria: key123\n" });
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Aria")).toBeInTheDocument();
      expect(screen.getByText("key123")).toBeInTheDocument();
    });
  });

  it("Add character button adds a new empty-name row", async () => {
    stubFetch404();
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByText(/No characters yet/i));
    fireEvent.click(screen.getByRole("button", { name: /Add character/i }));
    expect(screen.getAllByLabelText("Character name")).toHaveLength(1);
  });

  it("Remove character removes the row from the list", async () => {
    stubFetchOk({ contents: "Aria: key123\n" });
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByDisplayValue("Aria"));
    fireEvent.click(screen.getByRole("button", { name: /Remove character/i }));
    expect(screen.queryByDisplayValue("Aria")).toBeNull();
  });

  it("Save button calls saveAtlasPatchToLocalFs with correct path and kind", async () => {
    stubFetchOk({ contents: "Aria: key123\n" });
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByDisplayValue("Aria"));
    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/world/_dm/character-keys.yaml",
            kind: "world-yaml",
          }),
        ]),
      ),
    );
  });

  it("Save button is disabled while save is in flight", async () => {
    stubFetchOk({ contents: "Aria: key123\n" });
    mockSave.mockReturnValue(new Promise(() => {}));
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByDisplayValue("Aria"));
    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled(),
    );
  });

  it("blank-name rows are excluded from the saved YAML", async () => {
    stubFetch404();
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByText(/No characters yet/i));
    fireEvent.click(screen.getByRole("button", { name: /Add character/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const patches = mockSave.mock.calls[0][0];
    // js-yaml dumps an empty object as "{}\n" — no name: key entries
    expect(patches[0].content).not.toMatch(/\w+:\s+\S/);
  });
});
