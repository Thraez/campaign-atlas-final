/**
 * eval-19: the one naming rule for map layer files under
 * public/atlas/assets/maps/, shared by editor uploads and the Map Import Wizard.
 */
import { describe, it, expect } from "vitest";
import { defaultTargetPath, mapLayerTargetPath, safeFilename } from "@/atlas/assets/mapLayerTarget";

describe("mapLayerTargetPath", () => {
  it("keeps a typed path under the maps folder", () => {
    expect(
      mapLayerTargetPath({
        id: "l1",
        filename: "a.png",
        targetPath: "public/atlas/assets/maps/keep.png",
      }),
    ).toBe("public/atlas/assets/maps/keep.png");
  });

  it("falls back to the default for a typed path outside the maps folder", () => {
    expect(
      mapLayerTargetPath({
        id: "l1",
        filename: "Sea Chart.png",
        targetPath: "public/atlas/assets/images/sea.png",
      }),
    ).toBe("public/atlas/assets/maps/sea-chart.png");
  });

  it("falls back to the default for a bare file name", () => {
    expect(mapLayerTargetPath({ id: "l1", filename: "Sea Chart.png", targetPath: "sea.png" })).toBe(
      "public/atlas/assets/maps/sea-chart.png",
    );
  });

  it("with no filename, takes the extension from the dataUrl MIME type", () => {
    expect(
      mapLayerTargetPath({ id: "upload-1-0-ruins", dataUrl: "data:image/webp;base64,AAAA" }),
    ).toBe("public/atlas/assets/maps/upload-1-0-ruins.webp");
  });

  it("with no filename, does not stack a second extension on an id that has one", () => {
    expect(
      mapLayerTargetPath({
        id: "upload-1-0-old-map.webp",
        dataUrl: "data:image/webp;base64,AAAA",
      }),
    ).toBe("public/atlas/assets/maps/upload-1-0-old-map.webp");
    expect(mapLayerTargetPath({ id: "upload-1-0-old-map.jpg" })).toBe(
      "public/atlas/assets/maps/upload-1-0-old-map.jpg",
    );
    expect(mapLayerTargetPath({ id: "layer-9" })).toBe("public/atlas/assets/maps/layer-9.png");
  });

  it("names a file the same way the Map Import Wizard does", () => {
    for (const name of ["Fog Overlay (v2).PNG", "Sun Haven Map!.jpeg", "!!.webp"]) {
      expect(mapLayerTargetPath({ id: "x", filename: name })).toBe(
        defaultTargetPath(safeFilename(name)),
      );
    }
    expect(safeFilename("Fog Overlay (v2).PNG")).toBe("fog-overlay-v2.png");
  });
});
