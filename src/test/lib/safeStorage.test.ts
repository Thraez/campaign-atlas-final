import { describe, it, expect, vi, afterEach } from "vitest";
import { getStorage } from "@/lib/safeStorage";

afterEach(() => vi.restoreAllMocks());

describe("getStorage", () => {
  it("returns window.localStorage when it's writable", () => {
    expect(getStorage()).toBe(window.localStorage);
  });

  it("returns null when the probe write throws (e.g. private browsing)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(getStorage()).toBeNull();
  });

  it("cleans up its probe key on success", () => {
    getStorage();
    expect(window.localStorage.getItem("__atlas_probe__")).toBeNull();
  });
});
