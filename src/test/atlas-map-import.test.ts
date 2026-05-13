import { describe, it, expect } from "vitest";
import {
  buildImportPlan,
  buildPatchFile,
  buildPlanYaml,
  defaultAssignment,
  idFromFilename,
  resolveSize,
  safeFilename,
  validateImportPlan,
  type ImportImage,
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
