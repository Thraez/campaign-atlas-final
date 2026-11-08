// @vitest-environment node
/**
 * R-11c: the old Publish Check gives the strict player build's verdict. For
 * each fixture vault, the DM build gives the project the editor loads; the
 * Publish Check (`validateProject`) blocks on it exactly when
 * `buildAtlas(--player --strict)` fails, and both name the same item.
 *
 * The sound-only-area-in-fog row: the Publish Check reads the resolver, which
 * drops the area; the build drops it only once R-11b (arch-02) moves the build
 * onto the resolver. Until then that half is an `it.todo`.
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAtlas } from "../../scripts/build-atlas";
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

describe("sound-only area under fog (R-11c; arch-02 lands in R-11b)", () => {
  const fixture = FIXTURES.find((f) => f.name.startsWith("a sound-only area"))!;

  it("the Publish Check says it won't play for players, without blocking", async () => {
    const { report } = await run(fixture);
    const hits = report.issues.filter((i) => i.code === "sound-area-fogged");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("suggestion");
    expect(hits[0].message).toContain("war-drums");
    expect(hits[0].scope).toEqual({ mapId: "m1" });
  });

  // Today's build still ships the area (arch-02). R-11b drops it through the
  // resolver; then this half of the parity holds and the todo becomes a test:
  // the strict player atlas's m1 soundscape has no area.
  it.todo("R-11b: the strict player atlas leaves the area out, as the Publish Check says");
});
