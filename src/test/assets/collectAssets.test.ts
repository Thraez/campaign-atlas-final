import { describe, it, expect } from "vitest";
import { collectAssets } from "@/atlas/assets/collectAssets";
import { makeProject, makeEntity, makeMap, makeLayer } from "../helpers/makeProject";

describe("collectAssets", () => {
  it("collects entity images and map layer srcs, deduped, with usedBy", () => {
    const project = makeProject({
      entities: [
        makeEntity({ id: "a", images: ["assets/pics/a.png", "assets/pics/shared.png"] }),
        makeEntity({ id: "b", images: ["assets/pics/shared.png"] }),
      ],
      maps: [makeMap({ layers: [makeLayer({ id: "L1", src: "assets/maps/overview.png" })] })],
    });

    const assets = collectAssets(project);
    const bySrc = Object.fromEntries(assets.map((a) => [a.src, a.usedBy]));

    expect(assets.map((a) => a.src).sort()).toEqual([
      "assets/maps/overview.png",
      "assets/pics/a.png",
      "assets/pics/shared.png",
    ]);
    // A shared image records every use, in first-seen order.
    expect(bySrc["assets/pics/shared.png"]).toEqual([
      { kind: "entity", id: "a" },
      { kind: "entity", id: "b" },
    ]);
    expect(bySrc["assets/maps/overview.png"]).toEqual([{ kind: "layer", id: "L1" }]);
  });

  it("returns an empty list for a project with no images", () => {
    const project = makeProject({
      entities: [makeEntity({ images: [] })],
      maps: [makeMap({ layers: [] })],
    });
    expect(collectAssets(project)).toEqual([]);
  });
});
