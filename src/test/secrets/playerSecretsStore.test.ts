import { describe, it, expect, beforeEach } from "vitest";
import {
  setCharacterKey,
  getCharacterKey,
  markUnlocked,
  isUnlocked,
  forgetAll,
  _resetForTests,
} from "@/atlas/secrets/playerSecretsStore";

beforeEach(() => _resetForTests());

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
