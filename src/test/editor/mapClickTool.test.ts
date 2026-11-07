import { describe, it, expect } from "vitest";
import { resolveMapClickTool, type MapClickState } from "@/atlas/editor/mapClickTool";

const idle: MapClickState = {
  placingPin: false,
  drawingRegion: false,
  drawingRoute: false,
  drawingFog: false,
  drawingSoundscape: false,
  rulerOn: false,
};

describe("resolveMapClickTool: one tool owns a map click", () => {
  it("returns null when nothing is active", () => {
    expect(resolveMapClickTool(idle)).toBeNull();
  });

  it("gives the click to the ruler when only the ruler is on", () => {
    expect(resolveMapClickTool({ ...idle, rulerOn: true })).toBe("ruler");
  });

  it.each(["drawingRegion", "drawingRoute", "drawingFog", "drawingSoundscape"] as const)(
    "pauses the ruler while %s",
    (key) => {
      expect(resolveMapClickTool({ ...idle, rulerOn: true, [key]: true })).toBe("draw");
    },
  );

  it("pauses the ruler while a pin is being placed", () => {
    expect(resolveMapClickTool({ ...idle, rulerOn: true, placingPin: true })).toBe("place-pin");
  });
});
