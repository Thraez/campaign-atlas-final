import { describe, it, expect, vi, afterEach } from "vitest";
import { copyToClipboard } from "@/lib/clipboard";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("copyToClipboard (N135)", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("resolves true and writes the given text on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("resolves false instead of throwing when the clipboard write rejects", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });

  it("resolves false instead of throwing when navigator.clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });
});
