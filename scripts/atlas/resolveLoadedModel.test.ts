/**
 * R-11b, step 1: the resolver (R-11a) reads R-12's canonical model, so what
 * `loadAtlasModel` returns (v1 through the adapter, or v2) passes straight into
 * `resolveCampaign` with no glue. The type tests pin it; the runtime tests feed
 * loaded content in for campaign `main`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { loadAtlasModel } from "./loadAtlasModel";
import type {
  AtlasModel,
  LoadedAtlasContent,
  LoadedAtlasModel,
  MapModel,
  ModelNote,
  WorldModel,
} from "../../src/atlas/content/atlasModel";
import {
  resolveCampaign,
  type CampaignResolverModel,
  type WorldNote,
} from "../../src/atlas/content/resolveCampaign";
import type { MapScale } from "../../src/atlas/content/schema";
import type { WorldFileV2 } from "../../src/atlas/content/schemaV2";
import { v1Model } from "../../src/atlas/content/v1Model";
import { noteIsSecret } from "../../src/atlas/content/visibility";

const REPO = path.resolve(__dirname, "../..");
const FIX = path.join(REPO, "src/test/fixtures/atlas-model");
const REAL_CONFIG = JSON.parse(fs.readFileSync(path.join(REPO, "atlas.config.json"), "utf8")) as {
  defaultWorld: string;
  include: string[];
  exclude: string[];
};

describe("the resolver's input is the atlas model", () => {
  it("takes loadAtlasModel's model and notes as they are", () => {
    expectTypeOf<AtlasModel>().toMatchTypeOf<CampaignResolverModel>();
    expectTypeOf<LoadedAtlasContent["model"]>().toMatchTypeOf<CampaignResolverModel>();
    expectTypeOf<LoadedAtlasModel["model"]>().toMatchTypeOf<CampaignResolverModel>();
    expectTypeOf<ReturnType<typeof v1Model>["model"]>().toMatchTypeOf<CampaignResolverModel>();
    expectTypeOf<ModelNote>().toMatchTypeOf<WorldNote>();
    expectTypeOf<LoadedAtlasContent["notes"]>().toMatchTypeOf<readonly WorldNote[]>();
    expectTypeOf(resolveCampaign).parameter(0).toEqualTypeOf<CampaignResolverModel>();
    expectTypeOf(resolveCampaign).parameter(1).toEqualTypeOf<readonly WorldNote[]>();
  });

  it("reads worlds as WorldModel: no schemaVersion needed, scale optional", () => {
    expectTypeOf<CampaignResolverModel["worlds"][number]>().toEqualTypeOf<WorldModel>();
    expectTypeOf<WorldModel["maps"][number]>().toEqualTypeOf<MapModel>();
    expectTypeOf<WorldModel>().not.toHaveProperty("schemaVersion");
    expectTypeOf<MapModel["scale"]>().toEqualTypeOf<MapScale | undefined>();
    // A v2 world file still fits: it is a WorldModel plus its schemaVersion.
    expectTypeOf<WorldFileV2>().toMatchTypeOf<WorldModel>();
  });
});

describe("loaded content resolves for campaign main", () => {
  it("takes the v1 adapter's model of a fixture straight in", () => {
    const { model, notes } = loadAtlasModel(
      path.join(FIX, "v1/content"),
      { defaultWorld: "emberwold", include: [], exclude: [] },
      { root: FIX },
    );
    const r = resolveCampaign(model, notes, "main");
    expect(r.campaign).toBe("main");
    expect(r.worlds).toEqual([{ id: "emberwold", ships: true, reason: "ships" }]);
    expect(r.maps.map((m) => [m.id, m.ships])).toEqual([
      ["ember-overview", true],
      ["ember-depths", true],
    ]);
    expect(r.regions.map((x) => [x.id, x.reason])).toEqual([
      ["ash-flats", "ships"],
      ["cinder-vault", "visibility"],
      ["odd-region", "visibility"],
    ]);
    expect(r.notes.find((n) => n.id === "unplaced")).toMatchObject({
      ships: false,
      reason: "secret",
    });
    expect(r.notes.filter((n) => n.ships).map((n) => n.id)).toEqual([
      "spy",
      "hermit",
      "smith",
      "vault-keeper",
    ]);
    expect(r.orphanEntries).toEqual([]);
  });

  it("takes today's content/ straight in: every map ships, a note ships exactly when its frontmatter does", () => {
    const { model, notes } = loadAtlasModel(path.join(REPO, "content"), REAL_CONFIG, {
      root: REPO,
    });
    expect(model.schemaVersion).toBe(1);
    const r = resolveCampaign(model, notes, "main");
    expect(r.worlds.map((w) => [w.id, w.ships])).toEqual([[REAL_CONFIG.defaultWorld, true]]);
    expect(r.maps.length).toBeGreaterThan(0);
    expect(r.maps.every((m) => m.ships)).toBe(true);
    expect(r.notes.map((n) => n.id)).toEqual(notes.map((n) => n.note.id));
    for (const [i, n] of r.notes.entries()) {
      const { visibility, atlas } = notes[i].note;
      expect(n.ships).toBe(!noteIsSecret(visibility, atlas));
    }
    expect(r.orphanEntries).toEqual([]);
  });

  it("takes the v2 loader's model straight in", () => {
    const { model, notes } = loadAtlasModel(
      path.join(FIX, "v2/content"),
      { defaultWorld: "aldmoor", include: [], exclude: [] },
      { root: FIX },
    );
    expect(model.schemaVersion).toBe(2);
    const r = resolveCampaign(model, notes, "main");
    expect(r.campaign).toBe("main");
    expect(r.maps.some((m) => m.ships)).toBe(true);
  });
});
