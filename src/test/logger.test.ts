import { describe, it, expect, vi, afterEach } from "vitest";
import { shouldEmit, logger } from "@/lib/logger";

describe("shouldEmit — level gating", () => {
  it("always emits warn and error, in dev or prod", () => {
    expect(shouldEmit("warn", false)).toBe(true);
    expect(shouldEmit("error", false)).toBe(true);
    expect(shouldEmit("warn", true)).toBe(true);
    expect(shouldEmit("error", true)).toBe(true);
  });

  it("emits debug and info only in dev", () => {
    expect(shouldEmit("debug", true)).toBe(true);
    expect(shouldEmit("info", true)).toBe(true);
    expect(shouldEmit("debug", false)).toBe(false);
    expect(shouldEmit("info", false)).toBe(false);
  });
});

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("routes error() through console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("boom", { code: 1 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("error");
  });

  it("routes warn() through console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("careful");
    expect(spy).toHaveBeenCalledOnce();
  });
});
