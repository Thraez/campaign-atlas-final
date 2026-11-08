// @vitest-environment node
/**
 * R-11c: the old Publish Check gives the strict player build's verdict. For
 * each fixture vault, the DM build gives the project the editor loads; the
 * Publish Check (`validateProject`) blocks on it exactly when
 * `buildAtlas(--player --strict)` fails, and both name the same item.
 *
 * The sound-only-area-in-fog rows: the build doesn't fail on them, and both the
 * Publish Check and the build ask the resolver, which drops an area with any
 * part under fog (arch-02, R-11b). The Publish Check warns; the strict player
 * atlas leaves the area out.
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAtlas, formatBuildReport } from "../../scripts/build-atlas";
import { validateProject, type Issue } from "@/atlas/yaml/validateProject";

const WORLD = "parity-world";

const MAP_YAML = [
  "maps:",
  "  - id: m1",
  "    name: Parity Map",
  "    width: 1000",
  "    height: 1000",
  "    layers: []",
];

interface Fixture {
  name: string;
  /** Content-relative note files under the world folder. */
  notes: Record<string, string>;
  /** Extra world.yaml lines appended after the map (or replacing it, see `mapYaml`). */
  world?: string[];
  /** Replaces the default map block. */
  mapYaml?: string[];
  /** Whether the strict player build fails (and so the Publish Check blocks). */
  fails: boolean;
  /** The strict build's exit code when it fails. */
  exitCode?: number;
  /** The Publish Check's blocking issue code when it blocks. */
  code?: string;
  /** Names both the build's leak line and the blocking issue must carry (case-blind). */
  names?: string[];
}

function note(atlas: Record<string, unknown>, body = ""): string {
  const lines = Object.entries(atlas).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`);
  return `---\natlas:\n${lines.join("\n")}\n---\n${body}\n`;
}

const town = (body: string) =>
  note({ type: "settlement", visibility: "player", summary: "A town." }, body);

/** Area "x" twice: a lit player area, and a dm one the v1 adapter skips (2 points). */
const SHADOWED_AREAS = [
  "        - { id: x, name: x, visibility: player, points: [[10, 10], [300, 10], [300, 300]], bed: { src: audio/drums.ogg } }",
  "        - { id: x, name: x, visibility: dm, points: [[777, 777], [888, 888]], bed: { src: audio/dm-secret.ogg } }",
];

const FIXTURES: Fixture[] = [
  {
    name: "clean: player notes, a region and a route between shipped notes",
    notes: {
      "places/town.md": note(
        {
          type: "settlement",
          visibility: "player",
          summary: "A town.",
          placements: [{ mapId: "m1", x: 10, y: 10 }],
        },
        "See [[Inn]].",
      ),
      "places/inn.md": note({
        type: "settlement",
        visibility: "rumor",
        summary: "An inn.",
        placements: [{ mapId: "m1", x: 50, y: 50 }],
      }),
    },
    world: [
      "regions:",
      "  - { id: inn-yard, name: inn-yard, mapId: m1, visibility: player, entityId: inn, points: [[0, 0], [100, 0], [100, 100]] }",
      "routes:",
      "  - { id: inn-road, name: inn-road, mapId: m1, visibility: player, waypoints: [{ entityId: town }, { entityId: inn }] }",
    ],
    fails: false,
  },
  {
    name: "missing visibility: a player note wikilinks a note with no visibility",
    notes: {
      "places/town.md": town("Beware [[Crypt]]."),
      "places/crypt.md": note({ type: "place", summary: "A crypt." }),
    },
    fails: true,
    exitCode: 8,
    code: "spoiler-leak-wikilink",
    names: ["town", "crypt"],
  },
  {
    name: "missing visibility: a region with no visibility links a dm note",
    notes: {
      "places/boss.md": note({ type: "npc", visibility: "dm", summary: "The boss." }),
    },
    world: [
      "regions:",
      "  - { id: lair, name: lair, mapId: m1, entityId: boss, points: [[0, 0], [100, 0], [100, 100]] }",
    ],
    fails: false,
  },
  {
    name: "invalid visibility on a note",
    notes: {
      "places/oddity.md": note({ type: "place", visibility: "secret", summary: "Odd." }),
    },
    fails: true,
    exitCode: 3,
    code: "invalid-visibility",
    names: ["oddity", "secret"],
  },
  {
    name: "a player region links a dm note",
    notes: {
      "places/boss.md": note({ type: "npc", visibility: "dm", summary: "The boss." }),
    },
    world: [
      "regions:",
      "  - { id: crypt-zone, name: crypt-zone, mapId: m1, visibility: player, entityId: boss, points: [[0, 0], [100, 0], [100, 100]] }",
    ],
    fails: true,
    exitCode: 6,
    code: "spoiler-leak-region",
    names: ["crypt-zone", "boss"],
  },
  {
    name: "a player route has a waypoint on a dm note",
    notes: {
      "places/camp.md": note({
        type: "place",
        visibility: "player",
        summary: "A camp.",
        placements: [{ mapId: "m1", x: 10, y: 10 }],
      }),
      "places/boss.md": note({
        type: "npc",
        visibility: "dm",
        summary: "The boss.",
        placements: [{ mapId: "m1", x: 90, y: 90 }],
      }),
    },
    world: [
      "routes:",
      "  - { id: night-road, name: night-road, mapId: m1, visibility: player, waypoints: [{ entityId: camp }, { entityId: boss }] }",
    ],
    fails: true,
    exitCode: 7,
    code: "spoiler-leak-route",
    names: ["night-road", "boss"],
  },
  {
    name: "a player note wikilinks a note with atlas.publish: false",
    notes: {
      "places/town.md": town("Read the [[Draft]]."),
      "places/draft.md": note({
        type: "place",
        visibility: "player",
        publish: false,
        summary: "Unfinished.",
      }),
    },
    fails: true,
    exitCode: 8,
    code: "spoiler-leak-wikilink",
    names: ["town", "draft"],
  },
  {
    name: "a player note wikilinks a folder-excluded note",
    notes: {
      "places/town.md": town("Watch the [[Spy]]."),
      "_dm/spy.md": note({ type: "npc", visibility: "player", summary: "A spy." }),
    },
    fails: true,
    exitCode: 8,
    code: "spoiler-leak-wikilink",
    names: ["town", "spy"],
  },
  {
    name: "a sound-only area with a point under fog",
    notes: {},
    mapYaml: [
      ...MAP_YAML,
      "    fog:",
      "      enabled: true",
      "      reveals:",
      "        - [[0, 0], [200, 0], [200, 200], [0, 200]]",
      "    soundscape:",
      "      areas:",
      "        - id: war-drums",
      "          name: war-drums",
      "          visibility: player",
      "          points: [[100, 100], [600, 100], [600, 600]]",
      "          bed: { src: audio/drums.ogg }",
    ],
    fails: false,
  },
  {
    name: "two sound areas share an id (a dm 2-point area behind a lit player one)",
    notes: {},
    mapYaml: [...MAP_YAML, "    soundscape:", "      areas:", ...SHADOWED_AREAS],
    fails: true,
    exitCode: 22,
    code: "duplicate-sound-area-id",
  },
  {
    name: "a sound area with no id",
    notes: {},
    mapYaml: [
      ...MAP_YAML,
      "    soundscape:",
      "      areas:",
      "        - { name: nameless, visibility: player, points: [[10, 10], [90, 10], [90, 90]], bed: { src: audio/drums.ogg } }",
    ],
    fails: true,
    exitCode: 22,
    code: "sound-area-missing-id",
  },
];

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function writeVault(f: Fixture): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r11c-"));
  roots.push(root);
  const worldDir = path.join(root, "content", WORLD);
  fs.mkdirSync(path.join(worldDir, "_atlas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: WORLD,
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  fs.writeFileSync(
    path.join(worldDir, "_atlas", "world.yaml"),
    [...(f.mapYaml ?? MAP_YAML), ...(f.world ?? [])].join("\n") + "\n",
  );
  for (const [rel, text] of Object.entries(f.notes)) {
    const file = path.join(worldDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const audio = path.join(root, "public", "atlas", "assets", "audio");
  fs.mkdirSync(audio, { recursive: true });
  fs.writeFileSync(path.join(audio, "drums.ogg"), "OggS");
  fs.writeFileSync(path.join(audio, "dm-secret.ogg"), "OggS");
  return root;
}

const text = (i: Issue) => `${i.message} ${JSON.stringify(i.scope ?? {})}`.toLowerCase();

async function run(f: Fixture) {
  const root = writeVault(f);
  const dm = await buildAtlas(root, { player: false, strict: false });
  expect(dm.report.failure, "the DM build of the fixture builds").toBeUndefined();
  const player = await buildAtlas(root, { player: true, strict: true });
  const report = validateProject({ project: dm.project, draftPlacements: [] });
  return { dm, player, report, blocking: report.issues.filter((i) => i.severity === "blocking") };
}

describe("Publish Check blocks exactly when the strict player build fails (R-11c)", () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))("%s", async (_name, f) => {
    const { player, blocking } = await run(f);
    const buildFails = player.report.failure !== undefined;

    expect(buildFails, `strict build: ${player.report.failure?.message ?? "passed"}`).toBe(f.fails);
    expect(
      blocking.length > 0,
      `blocking: ${blocking.map((i) => `[${i.code}] ${i.message}`).join("; ")}`,
    ).toBe(f.fails);
    if (!f.fails) return;

    expect(player.report.failure?.exitCode).toBe(f.exitCode);
    expect(blocking.map((i) => i.code)).toEqual([f.code]);
    const buildLines = player.report.warnings.map((w) => w.toLowerCase());
    for (const name of f.names ?? []) {
      expect(text(blocking[0]), `the blocking issue names "${name}"`).toContain(name);
      expect(
        buildLines.some((w) => w.includes(name)),
        `a build warning names "${name}"`,
      ).toBe(true);
    }
  });
});

/** A map lit in two strips (y 0-300 and 700-1000) with fog between them. */
const STRIPS_YAML = [
  ...MAP_YAML,
  "    fog:",
  "      enabled: true",
  "      reveals:",
  "        - [[0, 0], [1000, 0], [1000, 300], [0, 300]]",
  "        - [[0, 700], [1000, 700], [1000, 1000], [0, 1000]]",
  "    soundscape:",
  "      areas:",
  "        - id: river-song",
  "          name: river-song",
  "          visibility: player",
  "          points: [[100, 200], [900, 200], [900, 800], [100, 800]]",
  "          bed: { src: audio/drums.ogg }",
  "        - id: market-hum",
  "          name: market-hum",
  "          visibility: player",
  "          points: [[100, 50], [900, 50], [900, 250], [100, 250]]",
  "          bed: { src: audio/drums.ogg }",
];

const partlyFogged: Fixture = {
  name: "a sound-only area whose corners are lit but whose middle crosses a fog gap",
  notes: {},
  mapYaml: STRIPS_YAML,
  fails: false,
};

const shippedAreas = (project: { maps: { id: string; soundscape?: { areas?: unknown[] } }[] }) =>
  project.maps.find((m) => m.id === "m1")?.soundscape?.areas ?? [];

describe("sound-only area under fog (R-11c, matching R-11b's build)", () => {
  const fixture = FIXTURES.find((f) => f.name.startsWith("a sound-only area"))!;

  it("the Publish Check warns the area is left out of the player atlas, without blocking", async () => {
    const { report } = await run(fixture);
    const hits = report.issues.filter((i) => i.code === "sound-area-fogged");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("warning");
    expect(hits[0].message).toContain("war-drums");
    expect(hits[0].message).toContain("left out of the player atlas");
    expect(hits[0].message).not.toContain("R-11b");
    expect(hits[0].scope).toEqual({ mapId: "m1" });
  });

  it("the strict player atlas leaves the area out, as the Publish Check says", async () => {
    const { dm, player } = await run(fixture);
    expect(player.report.failure).toBeUndefined();
    expect(shippedAreas(dm.project)).toHaveLength(1);
    expect(shippedAreas(player.project)).toEqual([]);
  });

  it("an area only partly under fog (a fog gap between lit strips) is reported and left out; a lit one ships", async () => {
    const { dm, player, report, blocking } = await run(partlyFogged);
    expect(player.report.failure).toBeUndefined();
    expect(blocking).toEqual([]);

    const hits = report.issues.filter((i) => i.code === "sound-area-fogged");
    expect(hits.map((i) => i.message)).toEqual([expect.stringContaining("river-song")]);
    expect(hits[0].severity).toBe("warning");

    // The DM atlas keeps both; the player atlas keeps only the lit one, with
    // its name stripped and its id replaced.
    expect(shippedAreas(dm.project)).toHaveLength(2);
    const kept = shippedAreas(player.project) as { id: string; name?: string; points: unknown }[];
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBeUndefined();
    expect(kept[0].points).toEqual([
      [100, 50],
      [900, 50],
      [900, 250],
      [100, 250],
    ]);
  });
});

/** A map lit on its left half (x 0-500) with sound areas appended. */
const halfLit = (areaLines: string[], world: string[] = []): Fixture => ({
  name: "sound areas on a half-lit map",
  notes: {},
  mapYaml: [
    ...MAP_YAML,
    "    fog:",
    "      enabled: true",
    "      reveals:",
    "        - [[0, 0], [500, 0], [500, 1000], [0, 1000]]",
    "    soundscape:",
    "      areas:",
    ...areaLines,
  ],
  world,
  fails: false,
});

const soundIssues = (issues: Issue[]) =>
  issues
    .filter((i) => i.code.startsWith("sound-area-"))
    .map((i) => ({ code: i.code, severity: i.severity, message: i.message }));

describe("sound areas the player build leaves out for other reasons (R-11c)", () => {
  it("a ride-on area of a fogged region and of a dm region warns; a lit player region's ships", async () => {
    const f = halfLit(
      [
        "        - { id: fog-ride, name: fog-ride, regionId: dark-wood, bed: { src: audio/drums.ogg } }",
        "        - { id: dm-ride, name: dm-ride, regionId: lair, bed: { src: audio/drums.ogg } }",
        "        - { id: lit-ride, name: lit-ride, regionId: meadow, bed: { src: audio/drums.ogg } }",
      ],
      [
        "regions:",
        "  - { id: dark-wood, name: dark-wood, mapId: m1, visibility: player, points: [[600, 100], [900, 100], [900, 400]] }",
        "  - { id: lair, name: lair, mapId: m1, visibility: dm, points: [[100, 100], [300, 100], [300, 300]] }",
        "  - { id: meadow, name: meadow, mapId: m1, visibility: player, points: [[100, 500], [300, 500], [300, 700]] }",
      ],
    );
    const { dm, player, report, blocking } = await run(f);
    expect(player.report.failure).toBeUndefined();
    expect(blocking).toEqual([]);
    const hits = soundIssues(report.issues);
    expect(hits).toHaveLength(2);
    for (const [h, name, region] of [
      [hits[0], "fog-ride", "dark-wood"],
      [hits[1], "dm-ride", "lair"],
    ] as const) {
      expect(h.code).toBe("sound-area-region-hidden");
      expect(h.severity).toBe("warning");
      expect(h.message).toContain(name);
      expect(h.message).toContain(region);
    }
    expect(shippedAreas(dm.project)).toHaveLength(3);
    expect(shippedAreas(player.project)).toEqual([expect.objectContaining({ regionId: "meadow" })]);
  });

  it('regionId: "" is a sound-only area in both: fogged, it warns as fogged; lit, it ships', async () => {
    const f = halfLit([
      '        - { id: blank-fog, name: blank-fog, regionId: "", visibility: player, points: [[100, 100], [900, 100], [900, 400]], bed: { src: audio/drums.ogg } }',
      '        - { id: blank-lit, name: blank-lit, regionId: "", visibility: player, points: [[100, 500], [300, 500], [300, 700]], bed: { src: audio/drums.ogg } }',
    ]);
    const { player, report } = await run(f);
    expect(player.report.failure).toBeUndefined();
    expect(soundIssues(report.issues)).toEqual([
      expect.objectContaining({
        code: "sound-area-fogged",
        message: expect.stringContaining("blank-fog"),
      }),
    ]);
    const kept = shippedAreas(player.project) as { points: unknown }[];
    expect(kept.map((a) => a.points)).toEqual([
      [
        [100, 500],
        [300, 500],
        [300, 700],
      ],
    ]);
  });

  it("an area the adapter skips (fewer than 3 points, no region) warns it won't play; the build drops it", async () => {
    const f = halfLit([
      "        - { id: stub, name: stub, visibility: player, points: [[100, 100], [200, 100]], bed: { src: audio/drums.ogg } }",
    ]);
    const { dm, player, report, blocking } = await run(f);
    expect(player.report.failure).toBeUndefined();
    expect(blocking).toEqual([]);
    expect(soundIssues(report.issues)).toEqual([
      {
        code: "sound-area-malformed",
        severity: "warning",
        message: expect.stringContaining('"stub" won\'t play for players'),
      },
    ]);
    expect(shippedAreas(dm.project)).toHaveLength(1);
    expect(shippedAreas(player.project)).toEqual([]);
  });
});

describe("sound-area ids the build can't trust (R-11c)", () => {
  const shadowed = FIXTURES.find((f) => f.name.startsWith("two sound areas share an id"))!;

  it("a duplicate id fails the strict player build and blocks the Publish Check, both naming it", async () => {
    const { player, blocking } = await run(shadowed);
    expect(player.report.failure?.exitCode).toBe(22);
    expect(player.report.failure?.message).toContain('"x"');
    expect(player.report.failure?.message).toContain('"m1"');
    expect(blocking.map((i) => i.code)).toEqual(["duplicate-sound-area-id"]);
    expect(blocking[0].message).toContain('"x"');
    expect(blocking[0].scope).toEqual({ mapId: "m1" });
  });

  it("a non-strict player build ships neither area: no dm points, no dm audio file", async () => {
    const root = writeVault(shadowed);
    const player = await buildAtlas(root, { player: true, strict: false });
    expect(player.report.failure).toBeUndefined();
    expect(shippedAreas(player.project)).toEqual([]);
    const json = JSON.stringify(player.project);
    expect(json).not.toContain("777");
    expect(json).not.toContain("dm-secret");
    // The DM-side terminal report says why; the shipped atlas doesn't.
    const line = 'map "m1": 2 sound areas share the id "x"';
    expect(formatBuildReport(player.report)).toContain(line);
    expect(json).not.toContain("share the id");
    expect(JSON.stringify(player.project.buildReport ?? {})).not.toContain("sound area");
  });

  it("a bed src of only spaces is malformed: the Publish Check warns and the build drops it", async () => {
    const f: Fixture = {
      name: "blank src",
      notes: {},
      mapYaml: [
        ...MAP_YAML,
        "    soundscape:",
        "      areas:",
        '        - { id: hush, name: hush, visibility: player, points: [[10, 10], [90, 10], [90, 90]], bed: { src: "   " } }',
      ],
      fails: false,
    };
    const { player, report, blocking } = await run(f);
    expect(player.report.failure).toBeUndefined();
    expect(blocking).toEqual([]);
    expect(soundIssues(report.issues)).toEqual([
      expect.objectContaining({
        code: "sound-area-malformed",
        message: expect.stringContaining("hush"),
      }),
    ]);
    expect(shippedAreas(player.project)).toEqual([]);
  });
});
