import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { resolveAssetCredits, projectAssetCredits } from "../../../scripts/atlas/loadWorldConfig";
import { buildFullWorldYaml } from "@/atlas/yaml/buildFullWorldYaml";

describe("resolveAssetCredits (parse)", () => {
  it("parses entries, defaulting enabled to false unless explicitly true", () => {
    const reg = resolveAssetCredits({
      "a.png": { credit: "Art by A", enabled: true },
      "b.png": { credit: "Art by B" }, // enabled missing -> false (conservative)
      "c.png": { credit: 123 }, // bad credit -> ""
    });
    expect(reg).toEqual({
      "a.png": { credit: "Art by A", enabled: true },
      "b.png": { credit: "Art by B", enabled: false },
      "c.png": { credit: "", enabled: false },
    });
  });

  it("returns undefined for non-object / empty input", () => {
    expect(resolveAssetCredits(undefined)).toBeUndefined();
    expect(resolveAssetCredits(null)).toBeUndefined();
    expect(resolveAssetCredits([])).toBeUndefined();
    expect(resolveAssetCredits({})).toBeUndefined();
  });
});

describe("projectAssetCredits (build projection)", () => {
  const reg = {
    "on.png": { credit: "Shown", enabled: true },
    "off.png": { credit: "Hidden but kept on disk", enabled: false },
    "empty.png": { credit: "   ", enabled: true },
  };

  it("DM build keeps everything", () => {
    expect(projectAssetCredits(reg, false)).toEqual(reg);
  });

  it("player build keeps only enabled, non-empty entries", () => {
    expect(projectAssetCredits(reg, true)).toEqual({
      "on.png": { credit: "Shown", enabled: true },
    });
  });

  it("returns undefined when nothing survives the player projection", () => {
    expect(projectAssetCredits({ "x.png": { credit: "", enabled: false } }, true)).toBeUndefined();
    expect(projectAssetCredits(undefined, true)).toBeUndefined();
  });
});

describe("assetCredits round-trip through world.yaml", () => {
  it("serialize -> parse -> resolve is identity", () => {
    const input = {
      "assets/pics/a.png": { credit: "Art by A", enabled: true },
      "assets/maps/o.png": { credit: "Map by M", enabled: false },
    };
    const yamlText = buildFullWorldYaml({ maps: [], existing: null, assetCredits: input });
    const parsed = yaml.load(yamlText) as { assetCredits?: unknown };
    expect(resolveAssetCredits(parsed.assetCredits)).toEqual(input);
  });
});
