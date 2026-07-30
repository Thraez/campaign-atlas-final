import { describe, it, expect, afterEach } from "vitest";
import { isSecureCryptoAvailable } from "@/atlas/secrets/isSecureCryptoAvailable";

describe("isSecureCryptoAvailable", () => {
  afterEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  it("is true in a secure context with crypto.subtle present (the test default)", () => {
    expect(isSecureCryptoAvailable()).toBe(true);
  });

  it("is false when isSecureContext is false", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    expect(isSecureCryptoAvailable()).toBe(false);
  });

  it("is false when crypto.subtle is missing", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: { ...originalCrypto, subtle: undefined },
      configurable: true,
    });
    try {
      expect(isSecureCryptoAvailable()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
    }
  });
});
