import { it, expect, vi, beforeEach } from "vitest";
import { revealToHtml } from "@/atlas/secrets/revealSecret";
import { getCharacterKey, markUnlocked } from "@/atlas/secrets/playerSecretsStore";
import { mountSecretBlock } from "@/atlas/secrets/secretBlockView";
import type { PlayerSecret } from "@/atlas/content/schema";

vi.mock("@/atlas/secrets/revealSecret", () => ({ revealToHtml: vi.fn() }));
vi.mock("@/atlas/secrets/playerSecretsStore", () => ({
  getCharacterKey: vi.fn(),
  markUnlocked: vi.fn(),
}));

const mockReveal = vi.mocked(revealToHtml);
const mockGetKey = vi.mocked(getCharacterKey);
const mockMarkUnlocked = vi.mocked(markUnlocked);

function makeHost(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function makeSecret(overrides: Partial<PlayerSecret> = {}): PlayerSecret {
  return { id: "s1", lockType: "password", salt: "Q", iv: "Q", ciphertext: "Q", ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  document.body.innerHTML = "";
});

// --- character lock ---

it("character lock — no key: host is empty (invisible)", () => {
  mockGetKey.mockReturnValue(null);
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "character" }));
  expect(h.classList.contains("atlas-secret")).toBe(true);
  expect(h.childNodes.length).toBe(0);
});

it("character lock — key present: reveals content in atlas-secret-open div", async () => {
  mockGetKey.mockReturnValue("player-key");
  mockReveal.mockResolvedValue("<p>hidden lore</p>");
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "character" }));
  await vi.waitFor(() => h.querySelector(".atlas-secret-open") !== null);
  expect(h.querySelector(".atlas-secret-open")!.textContent).toContain("hidden lore");
  expect(mockReveal).toHaveBeenCalledWith(
    expect.objectContaining({ lockType: "character" }),
    "player-key",
  );
});

it("character lock — key present but decrypt fails: host stays cleared", async () => {
  mockGetKey.mockReturnValue("wrong-key");
  mockReveal.mockResolvedValue(null);
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "character" }));
  await vi.waitFor(() => mockReveal.mock.calls.length > 0);
  await new Promise((r) => setTimeout(r, 0)); // let the .then() callback drain
  expect(h.childNodes.length).toBe(0);
});

// --- password lock ---

it("password lock — renders sealed box with passphrase input and submit button", () => {
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "password" }));
  expect(h.querySelector(".atlas-secret-sealed")).not.toBeNull();
  expect(h.querySelector('input[aria-label="Secret passphrase"]')).not.toBeNull();
  expect(h.querySelector('button[type="submit"]')).not.toBeNull();
});

it("password lock — teaser rendered as text when present", () => {
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "password", teaser: "A riddle in shadow" }));
  const t = h.querySelector(".atlas-secret-teaser");
  expect(t).not.toBeNull();
  expect(t!.textContent).toBe("A riddle in shadow");
});

it("password lock — no teaser element when teaser is absent", () => {
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "password" }));
  expect(h.querySelector(".atlas-secret-teaser")).toBeNull();
});

it("password form submit — correct passphrase reveals content and calls markUnlocked", async () => {
  mockReveal.mockResolvedValue("<p>the secret</p>");
  const h = makeHost();
  const s = makeSecret({ id: "treas", lockType: "password" });
  mountSecretBlock(h, s);
  const input = h.querySelector<HTMLInputElement>(".atlas-secret-input")!;
  const form = h.querySelector<HTMLFormElement>(".atlas-secret-form")!;
  input.value = "open sesame";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => h.querySelector(".atlas-secret-open") !== null);
  expect(mockReveal).toHaveBeenCalledWith(s, "open sesame");
  expect(mockMarkUnlocked).toHaveBeenCalledWith("treas");
});

it("password form submit — wrong passphrase shows 'The seal holds firm.'", async () => {
  mockReveal.mockResolvedValue(null);
  const h = makeHost();
  mountSecretBlock(h, makeSecret({ lockType: "password" }));
  const input = h.querySelector<HTMLInputElement>(".atlas-secret-input")!;
  const form = h.querySelector<HTMLFormElement>(".atlas-secret-form")!;
  input.value = "bad guess";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(
    () => (h.querySelector<HTMLElement>(".atlas-secret-msg")!.textContent ?? "") !== "",
  );
  expect(h.querySelector<HTMLElement>(".atlas-secret-msg")!.textContent).toBe(
    "The seal holds firm.",
  );
  expect(mockMarkUnlocked).not.toHaveBeenCalled();
});
