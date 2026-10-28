import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import yaml from "js-yaml";
import { CharacterKeysPanel } from "@/atlas/secrets/CharacterKeysPanel";

vi.mock("@/atlas/save/localFsSave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/atlas/save/localFsSave")>()),
  saveAtlasPatchToLocalFs: vi.fn().mockResolvedValue({ saved: 1, paths: [] }),
  hashContent: vi.fn().mockResolvedValue("sha256:abc123"),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { saveAtlasPatchToLocalFs, hashContent, ConflictError } from "@/atlas/save/localFsSave";
import { toast } from "sonner";

const mockSave = vi.mocked(saveAtlasPatchToLocalFs);
const mockHash = vi.mocked(hashContent);
const mockToastError = vi.mocked(toast.error);

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

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
    await waitFor(() => expect(screen.getByText(/No characters yet/i)).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled());
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

  it("shows an error toast when copying a key fails (N135)", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    stubFetchOk({ contents: "Aria: key123\n" });
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByText("key123"));
    fireEvent.click(screen.getByRole("button", { name: /Copy key/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not copy key"));
    expect(
      screen.queryByRole("button", { name: /Copy key/i })?.querySelector(".text-green-400"),
    ).toBeFalsy();
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });
});

describe("CharacterKeysPanel — a failed load never offers an empty list to save (eval-2026-10/36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue("sha256:abc123");
    mockSave.mockResolvedValue({ saved: 1, paths: ["/world/_dm/character-keys.yaml"] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a server error says the keys couldn't load and keeps Save off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load the character keys/i),
    );
    expect(screen.queryByText(/No characters yet/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Save keys/i })).toBeDisabled();
  });

  it("a network error says so too, and Retry loads the file", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ contents: "Aria: k1\n" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load the character keys/i),
    );
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => expect(screen.getByDisplayValue("Aria")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Save keys/i })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CharacterKeysPanel — every key survives a load and a save (eval-2026-10/36)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue("sha256:abc123");
    mockSave.mockResolvedValue({ saved: 1, paths: ["/world/_dm/character-keys.yaml"] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a hand-edited numeric key loads as its text and is saved as a string", async () => {
    stubFetchOk({ contents: "Aria: k1\nBob: 12345\nCara: 0123\n" });
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => expect(screen.getByDisplayValue("Bob")).toBeInTheDocument());
    expect(screen.getByText("12345")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    // Read back the way the build does (default schema, strings only).
    expect(yaml.load(mockSave.mock.calls[0][0][0].content)).toEqual({
      Aria: "k1",
      Bob: "12345",
      Cara: "0123",
    });
  });

  it("an entry that isn't a name and a key blocks saving and is named", async () => {
    stubFetchOk({ contents: "Aria: k1\nBob:\n  nested: x\nCara: [a, b]\n" });
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => expect(screen.getByDisplayValue("Aria")).toBeInTheDocument());
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Bob/);
    expect(alert).toHaveTextContent(/Cara/);
    expect(screen.getByRole("button", { name: /Save keys/i })).toBeDisabled();
  });
});

describe("CharacterKeysPanel — a save conflict re-reads the file and keeps the DM's rows (eval-2026-10/36)", () => {
  const fileResponse = (contents: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ contents }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockImplementation(async (c: string) => `h:${c}`);
    mockSave.mockResolvedValue({ saved: 1, paths: ["/world/_dm/character-keys.yaml"] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges the file's new state, says what changed outside, and the next save uses the new baseHash", async () => {
    const before = "Aria: k1\nBob: k2\nEve: k5\n";
    const after = "Aria: k1-new\nBob: k2-outside\nDag: k4\n";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(fileResponse(before)).mockResolvedValue(fileResponse(after)),
    );
    mockSave.mockRejectedValueOnce(
      new ConflictError("stale-base", "/world/_dm/character-keys.yaml", "h:other"),
    );
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByDisplayValue("Bob"));

    // The DM regenerates Bob's key and adds Cara, unsaved.
    fireEvent.click(screen.getAllByRole("button", { name: /Regenerate key/i })[1]);
    fireEvent.click(screen.getByRole("button", { name: /Add character/i }));
    const names = screen.getAllByLabelText("Character name");
    fireEvent.change(names[names.length - 1], { target: { value: "Cara" } });

    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/changed on disk/i);
    expect(alert).toHaveTextContent(/Added outside the editor: Dag/);
    expect(alert).toHaveTextContent(/Removed outside the editor: Eve/);
    expect(alert).toHaveTextContent(/Changed outside the editor: Aria, Bob/);
    expect(alert).toHaveTextContent(/Saving again overwrites.*Bob/);

    // Drafts survive; untouched rows follow the file.
    expect(screen.getByDisplayValue("Cara")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dag")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Eve")).toBeNull();
    expect(screen.getByText("k1-new")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    const second = mockSave.mock.calls[1][0][0];
    expect(second.baseHash).toBe(`h:${after}`);
    const saved = yaml.load(second.content) as Record<string, string>;
    expect(Object.keys(saved).sort()).toEqual(["Aria", "Bob", "Cara", "Dag"]);
    expect(saved.Aria).toBe("k1-new");
    expect(saved.Dag).toBe("k4");
    expect(saved.Bob).not.toBe("k2");
    expect(saved.Bob).not.toBe("k2-outside");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("a file created after an absent load is merged in, not refused forever", async () => {
    const created = "Aria: k1\n";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValue(fileResponse(created)),
    );
    mockSave.mockRejectedValueOnce(
      new ConflictError("already-exists", "/world/_dm/character-keys.yaml"),
    );
    render(<CharacterKeysPanel worldDir="/world" />);
    await waitFor(() => screen.getByText(/No characters yet/i));
    fireEvent.click(screen.getByRole("button", { name: /Add character/i }));
    fireEvent.change(screen.getByLabelText("Character name"), { target: { value: "Cara" } });
    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Added outside the editor: Aria/);
    expect(screen.getByDisplayValue("Cara")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save keys/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    const second = mockSave.mock.calls[1][0][0];
    expect(second.baseHash).toBe(`h:${created}`);
    expect(Object.keys(yaml.load(second.content) as object).sort()).toEqual(["Aria", "Cara"]);
  });
});
