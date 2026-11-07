/**
 * eval-19: the one naming rule for map layer files under
 * public/atlas/assets/maps/, shared by editor uploads and the Map Import Wizard.
 */
import { describe, it, expect } from "vitest";
import {
  defaultTargetPath,
  mapLayerTargetPath,
  mapTargetFitsSource,
  safeFilename,
} from "@/atlas/assets/mapLayerTarget";

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

// eval-2026-10/29: a map is saved under its real format's extension, so the
// save endpoint never has to re-encode it (a JPG map stays a JPG).
describe("mapLayerTargetPath keeps the source's real extension", () => {
  const jpg = "data:image/jpeg;base64,AAAA";

  it("renames a JPG sent to a typed .webp target to .jpg", () => {
    expect(
      mapLayerTargetPath({
        id: "l1",
        filename: "Tidemarrow.jpg",
        targetPath: "public/atlas/assets/maps/tidemarrow.webp",
        dataUrl: jpg,
      }),
    ).toBe("public/atlas/assets/maps/tidemarrow.jpg");
  });

  it("renames a JPG sent to a typed .png target, keeping a .jpeg spelling", () => {
    expect(
      mapLayerTargetPath({
        id: "l1",
        filename: "Sea.jpeg",
        targetPath: "public/atlas/assets/maps/sea.png",
        dataUrl: jpg,
      }),
    ).toBe("public/atlas/assets/maps/sea.jpeg");
  });

  it("trusts the bytes' MIME type over a misleading file name", () => {
    expect(mapLayerTargetPath({ id: "l1", filename: "Renamed.png", dataUrl: jpg })).toBe(
      "public/atlas/assets/maps/renamed.jpg",
    );
  });

  it("keeps a PNG under a typed .webp target (the endpoint encodes it lossless)", () => {
    expect(
      mapLayerTargetPath({
        id: "l1",
        filename: "Region.png",
        targetPath: "public/atlas/assets/maps/region.webp",
        dataUrl: "data:image/png;base64,AAAA",
      }),
    ).toBe("public/atlas/assets/maps/region.webp");
  });

  it("keeps a typed path when the source format is unknown", () => {
    expect(mapLayerTargetPath({ id: "l1", targetPath: "public/atlas/assets/maps/keep.webp" })).toBe(
      "public/atlas/assets/maps/keep.webp",
    );
  });
});

describe("mapTargetFitsSource", () => {
  it("accepts the same format, jpg and jpeg alike, and PNG under .webp", () => {
    expect(mapTargetFitsSource("public/atlas/assets/maps/a.jpeg", "image/jpeg")).toBe(true);
    expect(mapTargetFitsSource("public/atlas/assets/maps/a.JPG", "jpeg")).toBe(true);
    expect(mapTargetFitsSource("public/atlas/assets/maps/a.webp", "image/png")).toBe(true);
  });

  it("rejects a JPG under .webp or .png", () => {
    expect(mapTargetFitsSource("public/atlas/assets/maps/a.webp", "image/jpeg")).toBe(false);
    expect(mapTargetFitsSource("public/atlas/assets/maps/a.png", "jpg")).toBe(false);
  });
});
