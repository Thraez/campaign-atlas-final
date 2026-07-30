import { describe, it, expect, afterEach } from "vitest";
import { isWebAudioAvailable } from "@/atlas/sound/probeWebAudio";

describe("isWebAudioAvailable", () => {
  afterEach(() => {
    // Restore any properties defined during tests
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: (window as any)._originalAudioContext,
    });
    delete (window as any).webkitAudioContext;
  });

  it("returns true when window.AudioContext is present", () => {
    (window as any)._originalAudioContext = (window as any).AudioContext;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: function AudioContext() {},
    });
    expect(isWebAudioAvailable()).toBe(true);
  });

  it("returns true when only webkitAudioContext is present", () => {
    (window as any)._originalAudioContext = (window as any).AudioContext;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      value: function webkitAudioContext() {},
    });
    expect(isWebAudioAvailable()).toBe(true);
  });

  it("returns false when neither AudioContext nor webkitAudioContext exists", () => {
    (window as any)._originalAudioContext = (window as any).AudioContext;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });
    expect(isWebAudioAvailable()).toBe(false);
  });
});
