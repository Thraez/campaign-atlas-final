import { describe, it, expect } from "vitest";
import { overlayInteractive } from "@/atlas/MapLayerEditableOverlay";

describe("MapLayerEditableOverlay interactivity", () => {
  it("base image is NON-interactive when not in edit-geometry mode (clicks pass through to place pins)", () => {
    expect(overlayInteractive(false)).toBe(false);
  });
  it("base image IS interactive in edit-geometry mode (so it can be selected/resized)", () => {
    expect(overlayInteractive(true)).toBe(true);
  });
});
