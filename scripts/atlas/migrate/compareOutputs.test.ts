// @vitest-environment node
/**
 * R-20: the --check comparison fails on anything but the declared
 * differences, so an empty diff means something.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAtlas, type BuildAtlasResult } from "../../build-atlas";
import { encryptSecret } from "../../../src/atlas/secrets/secretCrypto";
import {
  comparePlayerOutputs,
  compareSecrets,
  dmItems,
  v1Assets,
  type AssetResolver,
} from "./compareOutputs";

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
          p.ocean = {
            width: 1,
            height: 1,
            sea: "default",
            onOcean: [{ map: p.maps[0].id, x: 0, y: 0, scale: 1, rotation: 0 }],
          };
          p.campaign = { id: "main", name: "Main" };
          p.placements.reverse();
        }),
      ),
    ).toEqual([]);

    // The allowed keys only in their allowed form; v2 map nesting not at all.
    expect(same(tweak(a, (p) => (p.campaign = { id: "other", name: "Main" }))).join()).toMatch(
      /campaign/,
    );
    expect(
      same(
        tweak(a, (p) => {
          p.ocean = { width: 1, height: 1, sea: "default", onOcean: [{ map: "nowhere" }] };
        }),
      ).join(),
    ).toMatch(/"nowhere" is not a map it ships/);
    expect(same(tweak(a, (p) => (p.maps[1].parent = "vale"))).join()).toMatch(/parent/);
    expect(same(tweak(a, (p) => (p.maps[1].enterZoom = 1))).join()).toMatch(/enterZoom/);

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

  it("compares secrets by their plaintext: a wrong key or a same-length plaintext fails", async () => {
    const a = await buildAtlas(FIXTURE, { player: true, strict: true });
    const keyFor = (e: string, s: string) =>
      e === "vault-keeper" && s === "hidden-door" ? "low tide" : undefined;
    const reseal = async (plaintext: string, key: string) =>
      tweak(a, (p) => {
        const s = p.entities.find((e: { id: string }) => e.id === "vault-keeper").secrets[0];
        Object.assign(s, sealed.get(`${plaintext}|${key}`));
      });
    const sealed = new Map<string, unknown>();
    for (const [pt, key] of [
      ["the door opens at low tide", "low tide"],
      ["the door opens at low tide", "high tide"],
      ["the door opens at hi9h tide", "low tide"],
    ] as const) {
      sealed.set(`${pt}|${key}`, await encryptSecret(pt, key));
    }
    // Same plaintext, new salt and iv: equal.
    const same = await reseal("the door opens at low tide", "low tide");
    expect(comparePlayerOutputs(a, v1Assets(a), same, v1Assets(same)).differences).toEqual([]);
    expect(await compareSecrets(a, same, keyFor)).toEqual([]);
    // Sealed under another key: the JSON can't tell, the decryption does.
    const wrongKey = await reseal("the door opens at low tide", "high tide");
    expect(comparePlayerOutputs(a, v1Assets(a), wrongKey, v1Assets(wrongKey)).differences).toEqual(
      [],
    );
    expect(await compareSecrets(a, wrongKey, keyFor)).toEqual([
      "secret vault-keeper/hidden-door: the migrated doesn't decrypt with its key",
    ]);
    // Another plaintext of the same length: a mismatch, and nothing printed of it.
    const other = await reseal("the door opens at hi9h tide", "low tide");
    const r = await compareSecrets(a, other, keyFor);
    expect(r).toEqual(["secret vault-keeper/hidden-door: plaintext mismatch"]);
    expect(r.join()).not.toMatch(/door opens|low tide/);
    // No configured key: fails closed.
    expect(await compareSecrets(a, same, () => undefined)).toEqual([
      expect.stringMatching(/no configured key/),
    ]);
  }, 120_000);
});
