import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CharacterSecretsPage from "@/atlas/secrets/CharacterSecretsPage";
import { loadAtlasContent } from "@/atlas/content/loader";
import * as playerSecretsStore from "@/atlas/secrets/playerSecretsStore";
import * as collectModule from "@/atlas/secrets/collectCharacterSecrets";
import type { AtlasProject } from "@/atlas/content/schema";

vi.mock("@/atlas/content/loader", () => ({ loadAtlasContent: vi.fn() }));
vi.mock("@/atlas/secrets/playerSecretsStore", () => ({
  getCharacterKey: vi.fn(() => null),
  setCharacterKey: vi.fn(),
  forgetAll: vi.fn(),
}));
vi.mock("@/atlas/secrets/collectCharacterSecrets", () => ({
  collectCharacterSecrets: vi.fn(() => Promise.resolve([])),
}));

const mockLoad = vi.mocked(loadAtlasContent);
const mockGetKey = vi.mocked(playerSecretsStore.getCharacterKey);
const mockSetKey = vi.mocked(playerSecretsStore.setCharacterKey);
const mockForgetAll = vi.mocked(playerSecretsStore.forgetAll);
const mockCollect = vi.mocked(collectModule.collectCharacterSecrets);

function makeProject(): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [],
    maps: [],
    entities: [],
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

function renderPage() {
  mockLoad.mockResolvedValue(makeProject());
  return render(
    <MemoryRouter initialEntries={["/atlas/secrets"]}>
      <CharacterSecretsPage />
    </MemoryRouter>,
  );
}

describe("CharacterSecretsPage — SecretsBody state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetKey.mockReturnValue(null);
    mockCollect.mockResolvedValue([]);
  });

  it("no key: shows key input and Sign in button", async () => {
    renderPage();
    await screen.findByText("Your character's secrets");
    expect(screen.getByLabelText("Your character key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("no key: submit with a value calls setCharacterKey", async () => {
    renderPage();
    await screen.findByText("Your character's secrets");
    const input = screen.getByLabelText("Your character key") as HTMLInputElement;
    input.value = "vesper-key";
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(mockSetKey).toHaveBeenCalledWith("vesper-key");
  });

  it("key present + collectCharacterSecrets pending: shows Searching…", async () => {
    mockGetKey.mockReturnValue("some-key");
    mockCollect.mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByText("Your character's secrets");
    expect(screen.getByText("Searching…")).toBeInTheDocument();
  });

  it("key present + no secrets: shows 'No secrets found' message", async () => {
    mockGetKey.mockReturnValue("some-key");
    mockCollect.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/No secrets found for that key/i);
  });

  it("key present + secrets: shows entity link for each found secret", async () => {
    mockGetKey.mockReturnValue("vesper-key");
    mockCollect.mockResolvedValue([
      { entityId: "keep", entityTitle: "The Keep", secretId: "s1", html: "<p>Treasure here</p>" },
    ]);
    renderPage();
    await screen.findByText(/On: The Keep/i);
  });

  it("Forget button calls forgetAll", async () => {
    mockGetKey.mockReturnValue("some-key");
    mockCollect.mockResolvedValue([]);
    renderPage();
    await screen.findByText(/No secrets found/i);
    fireEvent.click(screen.getByRole("button", { name: /forget on this device/i }));
    expect(mockForgetAll).toHaveBeenCalledOnce();
  });
});
