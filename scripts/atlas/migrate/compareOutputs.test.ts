// @vitest-environment node
/**
 * R-20: the --check comparison fails on anything but the declared
 * differences, so an empty diff means something.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAtlas, type BuildAtlasResult } from "../../build-atlas";
import { comparePlayerOutputs, dmItems, v1Assets, type AssetResolver } from "./compareOutputs";

const FIXTURE = path.resolve(__dirname, "../../../src/test/fixtures/migrate-v2-site");

function tweak(b: BuildAtlasResult, edit: (p: Record<string, any>) => void): BuildAtlasResult {
  const project = structuredClone(b.project) as unknown as Record<string, any>;
  edit(project);
  return { ...b, project: project as BuildAtlasResult["project"] };
}

describe("comparePlayerOutputs", () => {
  it("is empty for a build against itself, ignoring the allowed differences, and catches everything else", async () => {
    const a = await buildAtlas(FIXTURE, { player: true, strict: true });
    const assets = v1Assets(a);
    const same = (b: BuildAtlasResult, res: AssetResolver = assets) =>
      comparePlayerOutputs(a, assets, b, res).differences;

    expect(same(a)).toEqual([]);
    expect(
      same(
        tweak(a, (p) => {
          p.version = "x";
          p.publishedAt = "y";
          p.schemaVersion = 2;
          p.ocean = { width: 1, height: 1 };
          p.campaign = { id: "main", name: "Main" };
          p.maps[1].parent = "vale";
          p.placements.reverse();
        }),
      ),
    ).toEqual([]);

    // A DM entity that leaks, a pin moved, a fog reveal grown: all differences.
    expect(same(tweak(a, (p) => p.entities.push({ id: "vampire-lord" })))).not.toEqual([]);
    expect(same(tweak(a, (p) => (p.placements[0].x += 1)))).not.toEqual([]);
    expect(same(tweak(a, (p) => (p.maps[0].campaigns = ["dm"])))).not.toEqual([]);
    // Same names, other bytes: an asset difference.
    const other: AssetResolver = (ref) => {
      const b = assets(ref);
      return b && ref.endsWith(".png") ? Buffer.concat([b, Buffer.from("x")]) : b;
    };
    expect(same(a, other).join("\n")).toMatch(/asset|asset:/);
  }, 120_000);

  it("dmItems lists entities, maps, regions, routes, sound areas and pins", async () => {
    const dm = await buildAtlas(FIXTURE, { player: false, strict: false });
    const items = dmItems(dm);
    for (const i of [
      "entity:vampire-lord",
      "map:depths",
      "region:vale/lair",
      "route:vale/smugglers-path",
      "sound:vale/dm-drums",
    ]) {
      expect(items.has(i)).toBe(true);
    }
    expect([...items].some((i) => i.startsWith("pin:vault-keeper@vale:120,400"))).toBe(true);
  }, 120_000);
});
