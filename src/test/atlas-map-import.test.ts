import { describe, it, expect } from "vitest";
import {
  buildImportPlan,
  buildPatchFile,
  buildPlanYaml,
  defaultAssignment,
  idFromFilename,
  nameFromFilename,
  resolveSize,
  safeFilename,
  validateImportPlan,
  type ImportImage,
  type ImportPlan,
} from "@/atlas/import/mapImport";
import type { MapDocument } from "@/atlas/content/schema";

const fakeMap: MapDocument = {
  id: "world", worldId: "astrath", name: "World", width: 4000, height: 3000, layers: [],
};

const makeImage = (overrides: Partial<ImportImage> = {}): ImportImage => {
  const filename = overrides.originalFilename ?? "Sunhaven Town Map.png";
  return {
    id: overrides.id ?? "img-1",
    filename: safeFilename(filename),
    originalFilename: filename,
    mime: "image/png",
    bytes: 100_000,
    naturalWidth: 2048,
    naturalHeight: 1024,
    dataUrl: "data:image/png;base64,AAA=",
    assignment: defaultAssignment(filename, "per-image", fakeMap, "astrath"),
    ...overrides,
  };
};

describe("mapImport helpers", () => {
  it("safeFilename strips spaces and unsafe chars", () => {
    expect(safeFilename("Sun Haven Map!.PNG")).toBe("sun-haven-map.png");
    expect(safeFilename("../weird/path.svg")).toBe("weirdpath.svg");
  });

  it("idFromFilename produces kebab-case slug without extension", () => {
    expect(idFromFilename("Castle Black.webp")).toBe("castle-black");
    expect(idFromFilename("a__b__c.jpg")).toBe("a-b-c");
  });

  it("resolveSize natural mode uses image dimensions as map size", () => {
    const img = makeImage();
    img.assignment.sizing = "natural";
    const r = resolveSize(img, fakeMap);
    expect(r.mapWidth).toBe(2048);
    expect(r.layer.width).toBe(2048);
  });

  it("resolveSize fit-within-current preserves aspect", () => {
    const img = makeImage(); // 2048x1024 → fits inside 4000x3000
    img.assignment.sizing = "fit-within-current";
    const r = resolveSize(img, fakeMap);
    expect(r.layer.width).toBe(4000);
    expect(r.layer.height).toBe(2000);
  });

  it("buildImportPlan per-image creates one map per image", () => {
    const a = makeImage({ id: "a", originalFilename: "alpha.png" });
    const b = makeImage({ id: "b", originalFilename: "beta.png" });
    const plan = buildImportPlan({ images: [a, b], mode: "per-image", currentMap: fakeMap, defaultWorldId: "astrath" });
    expect(plan.maps).toHaveLength(2);
    expect(plan.maps.map((m) => m.id).sort()).toEqual(["alpha", "beta"]);
    expect(plan.assets).toHaveLength(2);
  });

  it("buildImportPlan layers mode reuses current map and brings existing layers", () => {
    const cm: MapDocument = { ...fakeMap, layers: [{ id: "base", src: "/x.webp", x: 0, y: 0, width: 10, height: 10, opacity: 1, zIndex: 0 }] };
    const img = makeImage();
    img.assignment = defaultAssignment("over.png", "layers", cm, "astrath");
    const plan = buildImportPlan({ images: [img], mode: "layers", currentMap: cm, defaultWorldId: "astrath" });
    expect(plan.maps).toHaveLength(1);
    expect(plan.maps[0].id).toBe("world");
    expect(plan.maps[0].layers.map((l) => l.id)).toEqual(["base", "over"]);
  });

  it("buildImportPlan dedupes maps with the same id and merges layers", () => {
    const a = makeImage({ id: "a", originalFilename: "same.png" });
    const b = makeImage({ id: "b", originalFilename: "same.png" });
    // Force distinct layer ids so the merge is visible (per-image otherwise collapses).
    b.assignment.layerId = "same-2";
    const plan = buildImportPlan({ images: [a, b], mode: "per-image", defaultWorldId: "astrath" });
    expect(plan.maps).toHaveLength(1);
    expect(plan.maps[0].layers.map((l) => l.id).sort()).toEqual(["same", "same-2"]);
  });

  it("validateImportPlan flags duplicate layer ids as blocking", () => {
    const a = makeImage({ id: "a", originalFilename: "alpha.png" });
    const b = makeImage({ id: "b", originalFilename: "beta.png" });
    // Force same layer id on the same target map.
    b.assignment.mapId = a.assignment.mapId;
    b.assignment.layerId = a.assignment.layerId;
    const plan = buildImportPlan({ images: [a, b], mode: "per-image", defaultWorldId: "astrath" });
    const issues = validateImportPlan(plan, [a, b]);
    expect(issues.some((i) => i.severity === "blocking" && /Duplicate layer/.test(i.message))).toBe(true);
  });

  it("validateImportPlan rejects unsafe asset paths", () => {
    const img = makeImage();
    img.assignment.targetAssetPath = "public/atlas/assets/maps/bad path.png";
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    const issues = validateImportPlan(plan, [img]);
    expect(issues.some((i) => i.severity === "blocking" && /unsafe characters/.test(i.message))).toBe(true);
  });

  it("validateImportPlan rejects asset paths outside public/atlas/assets", () => {
    const img = makeImage();
    img.assignment.targetAssetPath = "src/random/file.png";
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    const issues = validateImportPlan(plan, [img]);
    expect(issues.some((i) => i.severity === "blocking" && /must live under public\/atlas\/assets/.test(i.message))).toBe(true);
  });

  it("validateImportPlan rejects opacity outside 0..1", () => {
    const img = makeImage();
    img.assignment.opacity = 1.5;
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    const issues = validateImportPlan(plan, [img]);
    expect(issues.some((i) => i.severity === "blocking" && /opacity/.test(i.message))).toBe(true);
  });

  it("buildPlanYaml emits valid maps[] block", () => {
    const img = makeImage();
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    const yaml = buildPlanYaml(plan);
    expect(yaml).toMatch(/^maps:/);
    expect(yaml).toContain("id: sunhaven-town-map");
    expect(yaml).toContain("layers:");
  });

  it("buildPatchFile starts with patch header and contains no actual fenced YAML block", () => {
    const img = makeImage();
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    const patch = buildPatchFile(plan);
    expect(patch).toMatch(/^# Map import patch/);
    // A real fence would start a line with ```; the header only mentions the
    // string inside a comment, never as a leading fence.
    expect(patch.split("\n").some((l) => /^\s*```/.test(l))).toBe(false);
  });
});

describe("nameFromFilename", () => {
  it("title-cases dash/underscore-separated stems", () => {
    expect(nameFromFilename("castle-black.jpg")).toBe("Castle Black");
    expect(nameFromFilename("great_hall.png")).toBe("Great Hall");
    expect(nameFromFilename("world-plus-regional.webp")).toBe("World Plus Regional");
  });

  it("works with no extension", () => {
    expect(nameFromFilename("world")).toBe("World");
  });

  it("falls back to 'Untitled' for empty input", () => {
    expect(nameFromFilename("")).toBe("Untitled");
  });
});

describe("safeFilename — edge cases", () => {
  it("falls back to 'image' stem when all chars are stripped", () => {
    expect(safeFilename("!!.png")).toBe("image.png");
    expect(safeFilename("!!")).toBe("image");
  });

  it("passes through a plain name with no extension", () => {
    expect(safeFilename("mapfile")).toBe("mapfile");
  });
});

describe("idFromFilename — edge cases", () => {
  it("falls back to 'image' when stem strips to empty", () => {
    expect(idFromFilename("!!.jpg")).toBe("image");
    expect(idFromFilename("!!!")).toBe("image");
  });

  it("returns the stem as-is when there is no extension", () => {
    expect(idFromFilename("worldmap")).toBe("worldmap");
  });
});

describe("resolveSize — uncovered sizing modes", () => {
  it("stretch-to-current fills the current map exactly", () => {
    const img = makeImage(); // 2048×1024
    img.assignment.sizing = "stretch-to-current";
    const r = resolveSize(img, fakeMap); // fakeMap 4000×3000
    expect(r.mapWidth).toBe(4000);
    expect(r.mapHeight).toBe(3000);
    expect(r.layer).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
  });

  it("stretch-to-current without currentMap falls back to natural size", () => {
    const img = makeImage(); // 2048×1024
    img.assignment.sizing = "stretch-to-current";
    const r = resolveSize(img); // no currentMap
    expect(r.mapWidth).toBe(2048);
    expect(r.layer.width).toBe(2048);
  });

  it("center-natural centers image at natural size on current map", () => {
    const img = makeImage(); // 2048×1024
    img.assignment.sizing = "center-natural";
    const r = resolveSize(img, fakeMap); // 4000×3000
    expect(r.mapWidth).toBe(4000);
    expect(r.layer.x).toBe(Math.round((4000 - 2048) / 2)); // 976
    expect(r.layer.y).toBe(Math.round((3000 - 1024) / 2)); // 988
    expect(r.layer.width).toBe(2048);
    expect(r.layer.height).toBe(1024);
  });

  it("center-natural without currentMap falls back to natural size", () => {
    const img = makeImage();
    img.assignment.sizing = "center-natural";
    const r = resolveSize(img);
    expect(r.mapWidth).toBe(2048);
  });

  it("custom with keepAspect and only customWidth derives height from aspect ratio", () => {
    const img = makeImage(); // 2048×1024 → aspect 2:1
    img.assignment.sizing = "custom";
    img.assignment.customWidth = 1000;
    img.assignment.customHeight = undefined;
    img.assignment.keepAspect = true;
    const r = resolveSize(img);
    expect(r.layer.width).toBe(1000);
    expect(r.layer.height).toBe(Math.round((1000 / 2048) * 1024)); // 500
  });

  it("custom with keepAspect and only customHeight derives width from aspect ratio", () => {
    const img = makeImage(); // 2048×1024 → aspect 2:1
    img.assignment.sizing = "custom";
    img.assignment.customWidth = undefined;
    img.assignment.customHeight = 400;
    img.assignment.keepAspect = true;
    const r = resolveSize(img);
    expect(r.layer.height).toBe(400);
    expect(r.layer.width).toBe(Math.round((400 / 1024) * 2048)); // 800
  });

  it("custom without keepAspect uses explicit width and height independently", () => {
    const img = makeImage();
    img.assignment.sizing = "custom";
    img.assignment.customWidth = 800;
    img.assignment.customHeight = 600;
    img.assignment.keepAspect = false;
    const r = resolveSize(img);
    expect(r.layer.width).toBe(800);
    expect(r.layer.height).toBe(600);
  });
});

describe("validateImportPlan — uncovered validation rules", () => {
  const makeMinimalPlan = (overrides: Partial<ImportPlan> = {}): ImportPlan => ({
    maps: [],
    assets: [],
    warnings: [],
    ...overrides,
  });

  it("flags duplicate map ids as blocking", () => {
    const plan = makeMinimalPlan({
      maps: [
        { id: "dupe", name: "A", worldId: "w", width: 100, height: 100, layers: [] },
        { id: "dupe", name: "B", worldId: "w", width: 100, height: 100, layers: [] },
      ],
    });
    const issues = validateImportPlan(plan, []);
    expect(issues.some((i) => i.severity === "blocking" && /Duplicate map id/.test(i.message))).toBe(true);
  });

  it("flags a map with zero width as blocking", () => {
    const plan = makeMinimalPlan({
      maps: [{ id: "m", name: "M", worldId: "w", width: 0, height: 100, layers: [] }],
    });
    expect(validateImportPlan(plan, []).some((i) => i.severity === "blocking" && /invalid size/.test(i.message))).toBe(true);
  });

  it("flags a layer with zero height as blocking", () => {
    const plan = makeMinimalPlan({
      maps: [{ id: "m", name: "M", worldId: "w", width: 100, height: 100, layers: [
        { id: "l", src: "/atlas/assets/x.jpg", x: 0, y: 0, width: 100, height: 0, opacity: 1, zIndex: 0 },
      ]}],
    });
    expect(validateImportPlan(plan, []).some((i) => i.severity === "blocking" && /invalid size/.test(i.message))).toBe(true);
  });

  it("flags an external URL layer src as a warning", () => {
    const plan = makeMinimalPlan({
      maps: [{ id: "m", name: "M", worldId: "w", width: 100, height: 100, layers: [
        { id: "l", src: "https://cdn.example.com/map.jpg", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 0 },
      ]}],
    });
    expect(validateImportPlan(plan, []).some((i) => i.severity === "warning" && /won't work offline/.test(i.message))).toBe(true);
  });

  it("flags a missing layer src as blocking", () => {
    const plan = makeMinimalPlan({
      maps: [{ id: "m", name: "M", worldId: "w", width: 100, height: 100, layers: [
        { id: "l", src: "", x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 0 },
      ]}],
    });
    expect(validateImportPlan(plan, []).some((i) => i.severity === "blocking" && /missing image source/.test(i.message))).toBe(true);
  });

  it("flags an unusual image extension as a warning", () => {
    const img = makeImage({ originalFilename: "photo.bmp" });
    img.filename = "photo.bmp";
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    expect(validateImportPlan(plan, [img]).some((i) => i.severity === "warning" && /unusual extension/.test(i.message))).toBe(true);
  });

  it("flags an oversize image as a warning", () => {
    const img = makeImage();
    img.bytes = 9 * 1024 * 1024; // 9 MB — over the 8 MB limit
    const plan = buildImportPlan({ images: [img], mode: "per-image", defaultWorldId: "astrath" });
    expect(validateImportPlan(plan, [img]).some((i) => i.severity === "warning" && /MB/.test(i.message) && /compress/.test(i.message))).toBe(true);
  });
});
