import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepMapSized } from "@/atlas/map/keepMapSized";

type Callback = () => void;
let observers: { callback: Callback; observed: Element[]; disconnected: boolean }[] = [];
const RealResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  observers = [];
  globalThis.ResizeObserver = class {
    private entry: (typeof observers)[number];
    constructor(callback: Callback) {
      this.entry = { callback, observed: [], disconnected: false };
      observers.push(this.entry);
    }
    observe(el: Element) {
      this.entry.observed.push(el);
    }
    unobserve() {}
    disconnect() {
      this.entry.disconnected = true;
    }
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = RealResizeObserver;
});

describe("keepMapSized", () => {
  it("re-measures the map every time its container changes size, without panning", () => {
    const container = document.createElement("div");
    const invalidateSize = vi.fn();
    keepMapSized({ invalidateSize, getContainer: () => container });

    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([container]);
    expect(invalidateSize).not.toHaveBeenCalled();

    observers[0].callback();
    observers[0].callback();
    expect(invalidateSize).toHaveBeenCalledTimes(2);
    expect(invalidateSize).toHaveBeenLastCalledWith({ pan: false });
    expect(observers[0].disconnected).toBe(false);
  });

  it("stops watching on cleanup", () => {
    const container = document.createElement("div");
    const cleanup = keepMapSized({ invalidateSize: vi.fn(), getContainer: () => container });
    cleanup();
    expect(observers[0].disconnected).toBe(true);
  });

  it("does nothing where ResizeObserver is missing", () => {
    // @ts-expect-error simulate an old browser
    delete globalThis.ResizeObserver;
    const invalidateSize = vi.fn();
    const cleanup = keepMapSized({
      invalidateSize,
      getContainer: () => document.createElement("div"),
    });
    expect(() => cleanup()).not.toThrow();
    expect(invalidateSize).not.toHaveBeenCalled();
  });
});
