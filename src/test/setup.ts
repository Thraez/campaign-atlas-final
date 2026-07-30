import "@testing-library/jest-dom";

// Radix UI Slider (and other components) use ResizeObserver — jsdom doesn't include it.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement scrollIntoView; components that keep an active list
// item in view (e.g. the search palette) call it in an effect.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom does not define isSecureContext at all; default it to true (matching a
// normal https/localhost deployment) so tests reflect real-world behavior.
// Tests that specifically exercise the insecure-context path override this locally.
Object.defineProperty(window, "isSecureContext", {
  writable: true,
  configurable: true,
  value: true,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
