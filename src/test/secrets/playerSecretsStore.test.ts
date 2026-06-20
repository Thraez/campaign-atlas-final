import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setCharacterKey,
  getCharacterKey,
  markUnlocked,
  isUnlocked,
  forgetAll,
  _resetForTests,
} from "@/atlas/secrets/playerSecretsStore";

const STORAGE_KEY = "atlas-unlocked-secrets-v1";

beforeEach(() => _resetForTests());
afterEach(() => vi.restoreAllMocks());

it("persists the character key and unlocked ids", () => {
  expect(getCharacterKey()).toBeNull();
  setCharacterKey("vesper-key");
  expect(getCharacterKey()).toBe("vesper-key");
  expect(isUnlocked("ward")).toBe(false);
  markUnlocked("ward");
  expect(isUnlocked("ward")).toBe(true);
});

it("forgetAll clears everything", () => {
  setCharacterKey("k");
  markUnlocked("a");
  forgetAll();
  expect(getCharacterKey()).toBeNull();
  expect(isUnlocked("a")).toBe(false);
});

describe("playerSecretsStore edge cases", () => {
  it("setCharacterKey(null) clears the key", () => {
    setCharacterKey("some-key");
    setCharacterKey(null);
    expect(getCharacterKey()).toBeNull();
  });

  it("markUnlocked does not duplicate ids", () => {
    markUnlocked("s1");
    markUnlocked("s1");
    markUnlocked("s2");
    expect(isUnlocked("s1")).toBe(true);
    expect(isUnlocked("s2")).toBe(true);
  });
});

describe("playerSecretsStore — corrupt or partial localStorage data", () => {
  it("returns defaults when stored JSON is corrupt", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json}");
    expect(getCharacterKey()).toBeNull();
    expect(isUnlocked("x")).toBe(false);
  });

  it("defaults characterKey to null when stored value is not a string", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ characterKey: 99, unlocked: [] }));
    expect(getCharacterKey()).toBeNull();
  });

  it("defaults unlocked to [] when stored value is not an array", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ characterKey: null, unlocked: "oops" }));
    expect(isUnlocked("oops")).toBe(false);
  });

  it("filters non-string items out of the unlocked array", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ characterKey: null, unlocked: ["valid", 42, null, "also-valid"] }),
    );
    expect(isUnlocked("valid")).toBe(true);
    expect(isUnlocked("also-valid")).toBe(true);
    expect(isUnlocked("42")).toBe(false);
  });
});

describe("playerSecretsStore — localStorage unavailable", () => {
  it("returns defaults gracefully when storage probe throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(getCharacterKey()).toBeNull();
    expect(isUnlocked("x")).toBe(false);
  });
});
