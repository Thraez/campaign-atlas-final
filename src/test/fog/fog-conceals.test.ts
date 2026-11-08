// @vitest-environment node
/**
 * R-07b: fog shapes (`conceals`) drawn inside a lit area must stay fogged.
 * The editor's Fog tab saves them as `conceals`; the world loader used to drop
 * them, so the player build, the resolver and the fog scan all saw the area as
 * lit. These tests load them through `loadWorldConfig` and build a strict
 * player atlas from a temp vault (buildAtlas plans the fog masks; nothing is
 * written to the repo).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { buildAtlas } from "../../../scripts/build-atlas";
import { loadWorldConfig, WorldConfigError } from "../../../scripts/atlas/loadWorldConfig";
import type { MapDocument, SoundArea } from "@/atlas/content/schema";

const tmps: string[] = [];
afterEach(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** The whole map is revealed; a fog shape re-fogs its middle (400-600). */
const REVEAL = rect(0, 0, 1000, 1000);
const CONCEAL = rect(400, 400, 600, 600);
const LIT = rect(10, 10, 100, 100);
const INSIDE_CONCEAL = rect(450, 450, 550, 550);

function vault(
  worldYaml: Record<string, unknown>,
  notes: Record<string, string> = {},
  files: Record<string, Buffer> = {},
): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-fog-conceals-"));
  tmps.push(tmp);
  const put = (rel: string, body: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  put(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  put("content/w/_atlas/world.yaml", yaml.dump(worldYaml));
  for (const [rel, body] of Object.entries(notes)) put(`content/w/${rel}`, body);
  for (const [rel, body] of Object.entries(files)) put(rel, body);
  return tmp;
}

function world(
  fog: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  sound: unknown[] = [],
) {
  return {
    maps: [
      {
        id: "m1",
        name: "Map One",
        width: 1000,
        height: 1000,
        layers: [],
        fog,
        soundscape: { areas: sound },
      },
    ],
    ...extra,
  };
}

const note = (title: string, x: number, y: number) =>
  `---\ntitle: ${title}\natlas:\n  type: settlement\n  visibility: player\n  x: ${x}\n  y: ${y}\n---\nbody\n`;

const bed = (src: string) => ({ src: `atlas/assets/audio/${src}.ogg` });

const m1 = (project: { maps: MapDocument[] }) => project.maps.find((m) => m.id === "m1")!;

describe("loadWorldConfig carries fog shapes (conceals)", () => {
  it("keeps conceals on top-level and nested fog", () => {
    const root = vault({
      ...world({ enabled: true, reveals: [REVEAL], conceals: [CONCEAL] }),
      maps: [
        {
          id: "m1",
          name: "One",
          width: 1000,
          height: 1000,
          layers: [],
          fog: { enabled: true, reveals: [REVEAL], conceals: [CONCEAL] },
        },
        { id: "m2", name: "Two", width: 1000, height: 1000, layers: [] },
      ],
      fog: [{ mapId: "m2", enabled: true, reveals: [REVEAL], conceals: [CONCEAL] }],
    });
    const cfg = loadWorldConfig(path.join(root, "content"), "w", root)!;
    for (const id of ["m1", "m2"]) {
      expect(cfg.fogs.find((f) => f.mapId === id)?.conceals).toEqual([CONCEAL]);
    }
  });

  it("defaults to no conceals", () => {
    const root = vault(world({ enabled: true, reveals: [REVEAL] }));
    const cfg = loadWorldConfig(path.join(root, "content"), "w", root)!;
    expect(cfg.fogs[0].conceals).toBeUndefined();
    expect(cfg.fogs[0].featherPx).toBeUndefined();
  });

  it("keeps the soft edge (featherPx) and rejects a bad one", () => {
    const ok = vault(world({ enabled: true, reveals: [REVEAL], featherPx: 4 }));
    expect(loadWorldConfig(path.join(ok, "content"), "w", ok)!.fogs[0].featherPx).toBe(4);
    for (const featherPx of [-1, "wide"]) {
      const bad = vault(world({ enabled: true, reveals: [REVEAL], featherPx }));
      expect(() => loadWorldConfig(path.join(bad, "content"), "w", bad)).toThrow(WorldConfigError);
    }
  });

  it.each([
    ["not a list", "nope"],
    ["a shape that isn't a list", ["nope"]],
    [
      "a point that isn't a pair of numbers",
      [
        [
          [400, 400],
          [600, "x"],
          [600, 600],
        ],
      ],
    ],
    [
      "a point with three coordinates",
      [
        [
          [400, 400, 1],
          [600, 400],
          [600, 600],
        ],
      ],
    ],
    [
      "a shape with fewer than 3 points",
      [
        [
          [400, 400],
          [600, 600],
        ],
      ],
    ],
  ])("fails closed on a malformed conceal: %s", (_label, conceals) => {
    const root = vault(world({ enabled: true, reveals: [REVEAL], conceals }));
    expect(() => loadWorldConfig(path.join(root, "content"), "w", root)).toThrow(WorldConfigError);
  });
});

describe("strict player build: a fog shape inside a reveal stays fogged", () => {
  const fog = { enabled: true, reveals: [REVEAL], conceals: [CONCEAL] };
  const extra = {
    regions: [
      { id: "lit-region", mapId: "m1", name: "Lit", visibility: "player", points: LIT },
      { id: "hid-region", mapId: "m1", name: "Hid", visibility: "player", points: INSIDE_CONCEAL },
    ],
    routes: [
      {
        id: "lit-route",
        mapId: "m1",
        name: "Lit Road",
        visibility: "player",
        waypoints: [
          [10, 10],
          [100, 100],
        ],
      },
      // Both ends lit; the middle crosses the fog shape.
      {
        id: "hid-route",
        mapId: "m1",
        name: "Hid Road",
        visibility: "player",
        waypoints: [
          [300, 500],
          [700, 500],
        ],
      },
    ],
  };
  const sound = [
    { id: "lit-sound", name: "Lit", visibility: "player", points: LIT, bed: bed("lit") },
    { id: "hid-sound", name: "Hid", visibility: "player", points: INSIDE_CONCEAL, bed: bed("hid") },
  ];
  const notes = { "harbor.md": note("Harbor", 50, 50), "tower.md": note("Tower", 500, 500) };

  it("hides a pin inside the fog shape", async () => {
    const { project, report } = await buildAtlas(vault(world(fog, extra, sound), notes), {
      player: true,
      strict: true,
    });
    expect(report.failure).toBeUndefined();
    expect(project.placements.map((p) => p.entityId)).toEqual(["harbor"]);
  });

  it("hides a region inside the fog shape", async () => {
    const { project } = await buildAtlas(vault(world(fog, extra, sound), notes), {
      player: true,
      strict: true,
    });
    expect((m1(project).regions ?? []).map((r) => r.id)).toEqual(["lit-region"]);
  });

  it("hides a route crossing the fog shape", async () => {
    const { project } = await buildAtlas(vault(world(fog, extra, sound), notes), {
      player: true,
      strict: true,
    });
    expect((m1(project).routes ?? []).map((r) => r.id)).toEqual(["lit-route"]);
  });

  it("hides a sound area inside the fog shape", async () => {
    const { project } = await buildAtlas(vault(world(fog, extra, sound), notes), {
      player: true,
      strict: true,
    });
    const srcs = (m1(project).soundscape?.areas ?? []).map((a: SoundArea) => a.bed.src);
    expect(srcs).toEqual(["atlas/assets/audio/lit.ogg"]);
  });

  it("without the fog shape the same content all ships (control)", async () => {
    const open = { enabled: true, reveals: [REVEAL] };
    const { project } = await buildAtlas(vault(world(open, extra, sound), notes), {
      player: true,
      strict: true,
    });
    expect(project.placements.map((p) => p.entityId).sort()).toEqual(["harbor", "tower"]);
    expect((m1(project).regions ?? []).map((r) => r.id)).toEqual(["lit-region", "hid-region"]);
    expect((m1(project).routes ?? []).map((r) => r.id)).toEqual(["lit-route", "hid-route"]);
    expect(m1(project).soundscape?.areas).toHaveLength(2);
  });

  it("paints the fog shape into the redacted map image", async () => {
    const img = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const layer = {
      id: "lyr",
      src: "atlas/assets/maps/m1.png",
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
      opacity: 1,
      zIndex: 1,
    };
    const w = world(fog);
    w.maps[0].layers = [layer] as never[];
    const root = vault(w, {}, { "public/atlas/assets/maps/m1.png": img });
    const { project, assets } = await buildAtlas(root, { player: true, strict: true });
    expect(m1(project).layers[0].src).toBe("atlas/assets/maps/m1.fog.png");
    const mask = assets.fog?.files.find((f) => f.path.endsWith("m1.fog.png"));
    expect(mask).toBeDefined();
    const { data, info } = await sharp(mask!.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alpha(100, 100)).toBeGreaterThanOrEqual(250); // lit
    expect(alpha(500, 500)).toBe(0); // under the fog shape
  });
});
