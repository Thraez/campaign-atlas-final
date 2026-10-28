import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { whenMapHasSize } from "@/atlas/map/whenMapHasSize";

// Captures the ResizeObserver whenMapHasSize creates, so the test can drive
// the real route: container resize -> invalidateSize -> Leaflet `resize`.
let observers: CapturedObserver[] = [];
class CapturedObserver {
  callback: () => void;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: () => void) {
    this.callback = callback;
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

function fakeMap(initial: { x: number; y: number }) {
  let size = initial;
  const handlers = new Set<() => void>();
  const container = document.createElement("div");
  const map = {
    getSize: () => size,
    getContainer: () => container,
    on: vi.fn((event: string, h: () => void) => {
      if (event === "resize") handlers.add(h);
    }),
    off: vi.fn((event: string, h: () => void) => {
      if (event === "resize") handlers.delete(h);
    }),
    // Like Leaflet: fires `resize` only when the size changed.
    invalidateSize: vi.fn(() => {
      handlers.forEach((h) => h());
    }),
  };
  return {
    map,
    container,
    handlers,
    setSize: (s: { x: number; y: number }) => {
      size = s;
    },
  };
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("ResizeObserver", CapturedObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("whenMapHasSize", () => {
  it("runs at once on a sized map and subscribes to nothing", () => {
    const { map } = fakeMap({ x: 800, y: 600 });
    const fn = vi.fn();
    whenMapHasSize(map as never, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(map.on).not.toHaveBeenCalled();
    expect(observers).toHaveLength(0);
  });

  it("waits on a zero-size map, then runs once via ResizeObserver -> invalidateSize -> resize", () => {
    const { map, container, handlers, setSize } = fakeMap({ x: 0, y: 0 });
    const fn = vi.fn();
    whenMapHasSize(map as never, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([container]);

    // A resize that still leaves no size changes nothing.
    observers[0].callback();
    expect(fn).not.toHaveBeenCalled();

    setSize({ x: 800, y: 600 });
    observers[0].callback();
    expect(map.invalidateSize).toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(handlers.size).toBe(0);
    expect(observers[0].disconnected).toBe(true);

    observers[0].callback();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cleanup cancels a pending run", () => {
    const { map, handlers, setSize } = fakeMap({ x: 0, y: 0 });
    const fn = vi.fn();
    const cleanup = whenMapHasSize(map as never, fn);
    cleanup();
    expect(map.off).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(handlers.size).toBe(0);
    expect(observers[0].disconnected).toBe(true);
    setSize({ x: 800, y: 600 });
    map.invalidateSize();
    expect(fn).not.toHaveBeenCalled();
  });
});
