// @vitest-environment node
/**
 * R-20: the v1 -> v2 migration and its down-migration, on the fixture vault
 * `src/test/fixtures/migrate-v2-site/` and temp copies of it. Nothing here
 * reads or writes the live `content/` except the last test, which migrates a
 * temp copy of it.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";
import {
  validateAtlasFileV2,
  validateCampaignFileV2,
  validateWorldFileV2,
} from "../../../src/atlas/content/schemaV2";
import { parseFrontmatter } from "../../../src/atlas/content/frontmatter";
import { checkMigration, checkMigrationDown, readConfig } from "./checkMigration";
import {
  MigrationRefused,
  checkOutDir,
  guardedFolders,
  planMigrateDown,
  planMigrateUp,
  writeMigration,
  type MigrationPlan,
} from "./migrateV2";

const ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(ROOT, "src/test/fixtures/migrate-v2-site");
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) fs.rmSync(t, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migrate-test-"));
  temps.push(d);
  return d;
}

/** A temp copy of a project (config, content, public). */
function copyProject(from: string, edit?: (dir: string) => void): string {
  const d = tmp();
  fs.cpSync(from, d, { recursive: true });
  edit?.(d);
  return d;
}

function opts(project: string, allowDropPinStyle = true) {
  const config = readConfig(path.join(project, "atlas.config.json"));
  return {
    contentRoot: path.join(project, config.contentRoot),
    config,
    root: project,
    publicDir: path.join(project, "public"),
    allowDropPinStyle,
  };
}

/** The fixture's harbor pin has a label and style: most tests allow dropping them. */
const up = (project: string) => planMigrateUp(opts(project));
const fileText = (plan: MigrationPlan, rel: string) => {
  const b = plan.files.get(rel);
  if (!b) throw new Error(`no ${rel} in the plan`);
  return b.toString("utf8");
};
const yamlOf = (plan: MigrationPlan, rel: string) =>
  yaml.load(fileText(plan, rel)) as Record<string, unknown>;

function treeHash(dir: string): string {
  const h = crypto.createHash("sha256");
  const walk = (rel: string) => {
    for (const d of fs
      .readdirSync(path.join(dir, rel), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = path.join(rel, d.name);
      if (d.isDirectory()) walk(r);
      else h.update(r).update(fs.readFileSync(path.join(dir, r)));
    }
  };
  walk("");
  return h.digest("hex");
}

function refusal(run: () => unknown): string[] {
  try {
    run();
  } catch (e) {
    if (e instanceof MigrationRefused) return e.reasons;
    throw e;
  }
  throw new Error("expected MigrationRefused");
}

const replaceIn = (file: string, from: string | RegExp, to: string) => {
  const t = fs.readFileSync(file, "utf8");
  const n = t.replace(from, to);
  if (n === t) throw new Error(`no match in ${file}`);
  fs.writeFileSync(file, n);
};

/** Load a YAML file, edit it, write it back. */
function editYaml(file: string, edit: (v: any) => void): void {
  const v = yaml.load(fs.readFileSync(file, "utf8"));
  edit(v);
  fs.writeFileSync(file, yaml.dump(v, { lineWidth: -1 }));
}

describe("up: the fixture's migrated files", () => {
  const plan = up(FIXTURE);
  const world = yamlOf(plan, "vale/_atlas/world.yaml") as {
    world: { id: string; name: string };
    maps: Record<string, unknown>[];
    [k: string]: unknown;
  };
  const vale = world.maps.find((m) => m.id === "vale") as Record<string, unknown> & {
    regions: { id: string; visibility: unknown }[];
    sound: { id: string; visibility?: unknown }[];
    pins: { note: string; x: number; y: number; visibility: unknown }[];
  };
  const depths = world.maps.find((m) => m.id === "depths") as Record<string, unknown> & {
    regions: { id: string; visibility: unknown }[];
    pins: { note: string; x: number; y: number; visibility: unknown }[];
  };

  it("pass the v2 validators", () => {
    const a = validateAtlasFileV2(yamlOf(plan, "_atlas/atlas.yaml"));
    const w = validateWorldFileV2(world);
    const c = validateCampaignFileV2(yamlOf(plan, "_atlas/campaigns/main.yaml"));
    expect([a.ok, w.ok, c.ok]).toEqual([true, true, true]);
  });

  it("write atlas.yaml: schema 2, an ocean, the world, campaign main, one onOcean per map", () => {
    expect(yamlOf(plan, "_atlas/atlas.yaml")).toEqual({
      schemaVersion: 2,
      ocean: { width: 1800, height: 1000, sea: "default" },
      worlds: ["vale"],
      campaigns: ["main"],
      onOcean: [
        { map: "vale", x: 0, y: 0, scale: 1, rotation: 0 },
        { map: "depths", x: 1000, y: 0, scale: 1, rotation: 0 },
      ],
    });
  });

  it("name the world, lift water and keep calendar, credits and import at world level", () => {
    expect(world.world).toEqual({ id: "vale", name: "The Vale" });
    expect(world.water).toEqual({ enabled: true, intensity: 0.4 });
    expect(world.calendar).toEqual({
      name: "Vale Reckoning",
      months: [
        { name: "Thaw", days: 30 },
        { name: "Harvest", days: 31 },
      ],
    });
    expect(world.credits).toEqual({ badges: false, page: true });
    expect(world.import).toEqual({ folders: { npc: "people" }, defaultFolder: "imports" });
    for (const m of world.maps) expect(m.water).toBeUndefined();
  });

  it("keep maps top-level with their layers unchanged, a scale and a zoom range, shipping to main", () => {
    expect(world.maps.map((m) => m.id)).toEqual(["vale", "depths"]);
    expect(vale.layers).toEqual([
      {
        id: "base",
        src: "atlas/assets/maps/vale-base.png",
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
        opacity: 1,
        zIndex: 10,
      },
    ]);
    for (const m of world.maps) {
      expect(m.visibility).toEqual({ main: "player" });
      expect(m.zoom).toEqual({ min: -6, max: 4 });
      expect(m.frame).toBeUndefined();
    }
    expect(vale.scale).toEqual({ unitsPerPixel: 0.5, unitLabel: "mi" });
  });

  it("nest regions under their map: shipping values per campaign, the rest dm", () => {
    const vis = (rs: { id: string; visibility: unknown }[]) =>
      Object.fromEntries(rs.map((r) => [r.id, r.visibility]));
    expect(vis(vale.regions)).toEqual({
      "harbor-ward": { main: "player" },
      "fog-marsh": { main: "player" },
      lair: "dm",
      "whisper-glade": { main: "rumor" },
    });
    // `cellar` has no visibility (dm); `thin-strip` has two points (dropped).
    expect(vis(depths.regions)).toEqual({ cellar: "dm" });
    expect(plan.warnings.join("\n")).toMatch(/region "thin-strip".*dropped/);
  });

  it("move sound areas to sound:, keep enabled/masterGain under soundscape, drop a 2-point sound-only area", () => {
    expect(vale.soundscape).toEqual({ masterGain: 0.6 });
    expect(vale.sound.map((a) => [a.id, a.visibility])).toEqual([
      ["lit-gulls", { main: "player" }],
      ["fog-wind", { main: "player" }],
      ["dm-drums", "dm"],
      ["ride-harbor", undefined],
      ["ride-lair", { main: "player" }],
      ["ride-marsh", undefined],
    ]);
    expect(plan.warnings.join("\n")).toMatch(/too-small/);
    expect(plan.dropped).toEqual(
      expect.arrayContaining(["sound:vale/too-small", "region:depths/thin-strip"]),
    );
  });

  it("move pins into the map: per-note visibility, a secretId pin as dm, a legacy x/y pin", () => {
    const pins = (m: typeof vale | typeof depths) =>
      m.pins.map((p) => `${p.note}@${p.x},${p.y}=${JSON.stringify(p.visibility)}`).sort();
    expect(pins(vale)).toEqual(
      [
        'harbor@100,100={"main":"player"}',
        'harbor@220,220={"main":"player"}',
        'old-mill@640,520={"main":"player"}',
        'vault-keeper@120,400="dm"',
        'vault-keeper@150,150={"main":"player"}',
        'watchtower@300,450={"main":"player"}',
      ]
        .concat(pins(vale).filter((p) => /^(vampire|fogged)/.test(p)))
        .sort(),
    );
    expect(plan.warnings.join("\n")).toMatch(
      /harbor\.md: atlas\.placements\[1\] label and pin style dropped/,
    );
    expect(plan.warnings.join("\n")).toMatch(/vault-keeper\.md: .*secret "hidden-door".*dm/);
    expect(plan.dropped).toContain("pinStyle:harbor@vale:220,220");
  });

  it("keep the v1 world.yaml's comment header, and carry every key it has", () => {
    expect(fileText(plan, "vale/_atlas/world.yaml")).toMatch(
      /^# R-20 fixture: a v1 vault[^]*\n# Schema v2 \(ADR-0003\)/,
    );
    expect(plan.warnings.join("\n")).not.toMatch(/not carried over/);
  });

  it("drop the header's yaml-language-server line (v1 schema; no v2 one) and warn", () => {
    const d = copyProject(FIXTURE, (c) =>
      replaceIn(
        path.join(c, "content/vale/_atlas/world.yaml"),
        /^/,
        "# yaml-language-server: $schema=../../../schemas/world.schema.json\n",
      ),
    );
    const p = up(d);
    const text = fileText(p, "vale/_atlas/world.yaml");
    expect(text).not.toMatch(/yaml-language-server/);
    expect(text).toMatch(/^# R-20 fixture: a v1 vault[^]*\n# Schema v2 \(ADR-0003\)/);
    expect(p.warnings.join("\n")).toMatch(
      /vale\/_atlas\/world\.yaml: header line "# yaml-language-server: .*" dropped/,
    );
  });

  it("write campaign main: the fogged map with its reveals and feather, the other open, notes: vault", () => {
    expect(yamlOf(plan, "_atlas/campaigns/main.yaml")).toEqual({
      id: "main",
      name: "Main",
      notes: "vault",
      maps: {
        vale: {
          state: "fogged",
          reveals: [
            [
              [0, 0],
              [500, 0],
              [500, 1000],
              [0, 1000],
            ],
          ],
          featherPx: 12,
        },
        depths: { state: "open" },
      },
    });
  });

  it("remove pin fields from every note, excluded ones too, and keep the rest byte-identical", () => {
    for (const rel of [
      "vale/places/harbor.md",
      "vale/places/old-mill.md",
      "vale/_drafts/new-keep.md",
    ]) {
      const before = fs.readFileSync(path.join(FIXTURE, "content", rel), "utf8");
      const after = fileText(plan, rel);
      const b = parseFrontmatter(before).data as { atlas: Record<string, unknown> };
      const a = parseFrontmatter(after).data as { atlas: Record<string, unknown> };
      const { placements: _p, x: _x, y: _y, ...rest } = b.atlas;
      expect(a).toEqual({ ...b, atlas: rest });
      expect(after.slice(after.indexOf("\n---\n"))).toBe(before.slice(before.indexOf("\n---\n")));
    }
    expect(plan.warnings.join("\n")).toMatch(/new-keep\.md: pin fields removed; .*never shipped/);
    // A note without pins is copied as it is.
    expect(plan.files.get("vale/lore/market-rumour.md")).toEqual(
      fs.readFileSync(path.join(FIXTURE, "content/vale/lore/market-rumour.md")),
    );
  });

  it("copy the map images and audio beside world.yaml, srcs unchanged", () => {
    expect(plan.files.get("vale/_atlas/atlas/assets/maps/vale-base.png")).toEqual(
      fs.readFileSync(path.join(FIXTURE, "public/atlas/assets/maps/vale-base.png")),
    );
    expect(plan.files.has("vale/_atlas/atlas/assets/audio/gulls.ogg")).toBe(true);
  });
});

describe("up: refusals and conversions on edited copies", () => {
  const worldYaml = (d: string) => path.join(d, "content/vale/_atlas/world.yaml");

  it("refuses per-map water that differs, naming both maps", () => {
    const d = copyProject(FIXTURE, (d) =>
      replaceIn(
        worldYaml(d),
        "    water: { enabled: true, intensity: 0.4 }\n    layers:\n      - id: base\n        src: atlas/assets/maps/depths",
        "    water: { enabled: true, intensity: 0.9 }\n    layers:\n      - id: base\n        src: atlas/assets/maps/depths",
      ),
    );
    expect(refusal(() => up(d)).join("\n")).toMatch(/vale.*depths|depths.*vale/);
  });

  it("refuses a map with no scale, naming it", () => {
    const d = copyProject(FIXTURE, (d) =>
      replaceIn(worldYaml(d), "    scale: { unitsPerPixel: 2, unitLabel: ft }\n", ""),
    );
    expect(refusal(() => up(d))).toEqual([expect.stringMatching(/map "depths" has no scale/)]);
  });

  it("refuses a malformed region not marked player (v1's player build fails on it)", () => {
    const d = copyProject(FIXTURE, (d) =>
      replaceIn(
        worldYaml(d),
        "    visibility: player\n    points: [[0, 0], [100, 100]]",
        "    visibility: rumor\n    points: [[0, 0], [100, 100]]",
      ),
    );
    expect(refusal(() => up(d)).join("\n")).toMatch(/thin-strip/);
  });

  it("refuses a shipping pin's label or style by default; --allow-drop-pin-style drops them", () => {
    expect(refusal(() => planMigrateUp(opts(FIXTURE, false)))).toEqual([
      expect.stringMatching(
        /harbor\.md: atlas\.placements\[1\] ships with a label and pin style .*--allow-drop-pin-style/,
      ),
    ]);
  });

  it("warns about every world.yaml key it doesn't carry, at any depth", () => {
    const d = copyProject(FIXTURE, (d) => {
      replaceIn(worldYaml(d), "schemaVersion: 1\n", "schemaVersion: 1\nbanner: old\n");
      replaceIn(worldYaml(d), "        opacity: 1\n", "        opacity: 1\n        tint: red\n");
      replaceIn(worldYaml(d), "      featherPx: 12\n", "      featherPx: 12\n      blur: 3\n");
    });
    const w = up(d).warnings.join("\n");
    expect(w).toMatch(/world\.yaml: banner is not carried over/);
    expect(w).toMatch(/world\.yaml: maps\[vale\]\.layers\[base\]\.tint is not carried over/);
    expect(w).toMatch(/world\.yaml: maps\[vale\]\.fog\.blur is not carried over/);
  });

  it("warns when comments inside removed pin fields are dropped", () => {
    const d = copyProject(FIXTURE, (d) =>
      replaceIn(
        path.join(d, "content/vale/places/harbor.md"),
        "    - { mapId: vale, x: 220",
        "    # the old pier\n    - { mapId: vale, x: 220",
      ),
    );
    expect(up(d).warnings.join("\n")).toMatch(/harbor\.md: 1 comment line\(s\) .* dropped/);
  });

  it("maps hidden to hidden and a missing or invalid value to dm", () => {
    const d = copyProject(FIXTURE, (d) => {
      replaceIn(
        worldYaml(d),
        "    visibility: rumor\n    points: [[50",
        "    visibility: hidden\n    points: [[50",
      );
      replaceIn(
        worldYaml(d),
        "    visibility: dm\n    points: [[300",
        "    visibility: sekrit\n    points: [[300",
      );
    });
    const world = yamlOf(up(d), "vale/_atlas/world.yaml") as {
      maps: { id: string; regions?: { id: string; visibility: unknown }[] }[];
    };
    const vis = Object.fromEntries(
      world.maps.flatMap((m) => m.regions ?? []).map((r) => [r.id, r.visibility]),
    );
    expect(vis).toMatchObject({ "whisper-glade": "hidden", lair: "dm", cellar: "dm" });
  });

  it("migrates a fog with no enabled: as fogged", () => {
    const d = copyProject(FIXTURE, (d) => replaceIn(worldYaml(d), "      enabled: true\n", ""));
    const c = yamlOf(up(d), "_atlas/campaigns/main.yaml") as {
      maps: Record<string, { state: string }>;
    };
    expect(c.maps.vale.state).toBe("fogged");
  });

  it("refuses a flow-style atlas: block holding pins, naming the note", () => {
    const d = copyProject(FIXTURE, (d) =>
      fs.writeFileSync(
        path.join(d, "content/vale/places/flow.md"),
        "---\ntitle: Flow\natlas: { visibility: player, x: 1, y: 2 }\n---\nBody\n",
      ),
    );
    expect(refusal(() => up(d)).join("\n")).toMatch(/flow\.md: atlas: is written flow-style/);
  });

  it("leaves v2 content as it is (idempotent)", () => {
    const d = tmp();
    const cfg = path.join(d, "atlas.config.json");
    fs.copyFileSync(path.join(FIXTURE, "atlas.config.json"), cfg);
    writeMigration(up(FIXTURE), path.join(d, "content"), path.join(FIXTURE, "content"));
    const before = treeHash(d);
    const again = up(d);
    expect(again.alreadyDone).toBe(true);
    expect(again.files.size).toBe(0);
    expect(treeHash(d)).toBe(before);
  });
});

describe("--out", () => {
  const content = path.join(FIXTURE, "content");

  it("refuses the content root, a folder inside it, and one that holds it", () => {
    for (const out of [
      content,
      path.join(content, "vale"),
      path.join(content, "new", "deeper"),
      FIXTURE,
    ]) {
      expect(() => checkOutDir(out, content)).toThrow(MigrationRefused);
    }
  });

  it("refuses the vault, a folder inside it, and one that holds it", () => {
    const vault = path.join(tmp(), "Vault");
    for (const out of [vault, path.join(vault, "x"), path.dirname(vault)]) {
      expect(() => checkOutDir(out, content, [vault])).toThrow(/the vault/);
    }
  });

  it("refuses any folder in an Obsidian vault, with no settings file at all", () => {
    const root = tmp();
    expect(guardedFolders(root)).toEqual([]);
    const vault = path.join(tmp(), "Vault");
    fs.mkdirSync(path.join(vault, ".obsidian"), { recursive: true });
    for (const out of [vault, path.join(vault, "x"), path.join(vault, "x", "y")]) {
      expect(() => checkOutDir(out, content, guardedFolders(root))).toThrow(/in an Obsidian vault/);
    }
  });

  it("refuses a target folder that itself holds .obsidian", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".obsidian"));
    expect(refusal(() => checkOutDir(d, content)).join("\n")).toMatch(/Obsidian vault/);
  });

  it("refuses a saved vaultPath that isn't absolute", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, ".local-atlas"));
    fs.writeFileSync(
      path.join(root, ".local-atlas", "editor-settings.json"),
      JSON.stringify({ vaultPath: "Vault-DnD" }),
    );
    expect(refusal(() => guardedFolders(root)).join("\n")).toMatch(/isn't absolute/);
    fs.writeFileSync(
      path.join(root, ".local-atlas", "editor-settings.json"),
      JSON.stringify({ vaultPath: "/somewhere/Vault" }),
    );
    expect(guardedFolders(root)).toEqual(["/somewhere/Vault"]);
  });

  it("leaves nothing at --out, not even the parents it made, when a write fails", () => {
    const parent = tmp();
    const out = path.join(parent, "new", "deeper", "migrated");
    const bad: MigrationPlan = {
      ...up(FIXTURE),
      files: new Map([
        ["a", Buffer.from("file")],
        ["a/b", Buffer.from("a file under a file")],
      ]),
    };
    expect(() => writeMigration(bad, out, content)).toThrow();
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("refuses a folder that already has files", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "x"), "");
    expect(() => checkOutDir(d, content)).toThrow(/not empty/);
  });

  it("writes the plan to a fresh folder and never touches the content root", () => {
    const before = treeHash(FIXTURE);
    const out = path.join(tmp(), "migrated");
    const plan = up(FIXTURE);
    writeMigration(plan, out, content);
    expect(fs.readFileSync(path.join(out, "_atlas/atlas.yaml"))).toEqual(
      plan.files.get("_atlas/atlas.yaml"),
    );
    expect(treeHash(FIXTURE)).toBe(before);
  });
});

describe("down: refusals", () => {
  /** A temp v2 project: the fixture migrated, then edited. */
  function v2Project(edit?: (content: string) => void): string {
    const d = tmp();
    fs.copyFileSync(path.join(FIXTURE, "atlas.config.json"), path.join(d, "atlas.config.json"));
    writeMigration(up(FIXTURE), path.join(d, "content"), path.join(FIXTURE, "content"));
    edit?.(path.join(d, "content"));
    return d;
  }
  const down = (d: string) =>
    planMigrateDown({ ...opts(d), publicDir: path.join(FIXTURE, "public") });

  it("plans the fixture's copy back down", () => {
    const plan = down(v2Project());
    expect(plan.files.has("_atlas/atlas.yaml")).toBe(false);
    expect(yamlOf(plan, "vale/_atlas/world.yaml").schemaVersion).toBe(1);
  });

  it("refuses more than one campaign", () => {
    const d = v2Project((c) => {
      replaceIn(path.join(c, "_atlas/atlas.yaml"), "  - main\n", "  - main\n  - second\n");
      fs.writeFileSync(
        path.join(c, "_atlas/campaigns/second.yaml"),
        "id: second\nname: Second\nnotes: vault\nmaps: {}\n",
      );
    });
    expect(refusal(() => down(d)).join("\n")).toMatch(/campaign\(s\) "main", "second"/);
  });

  it("refuses a map with a parent", () => {
    const d = v2Project((c) => {
      replaceIn(path.join(c, "_atlas/atlas.yaml"), / {2}- map: depths\n( {4}.*\n)*/, "");
      replaceIn(
        path.join(c, "vale/_atlas/world.yaml"),
        / {2}- id: depths\n/,
        "  - id: depths\n    parent: vale\n    frame: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }\n    enterZoom: 1\n",
      );
    });
    expect(refusal(() => down(d)).join("\n")).toMatch(/map "depths" sits inside another map/);
  });

  it("refuses a per-campaign key other than main", () => {
    const d = v2Project((c) => {
      replaceIn(path.join(c, "_atlas/atlas.yaml"), "  - main\n", "  - main\n  - other\n");
      fs.writeFileSync(
        path.join(c, "_atlas/campaigns/other.yaml"),
        "id: other\nname: Other\nnotes: vault\nmaps: {}\n",
      );
      replaceIn(path.join(c, "vale/_atlas/world.yaml"), "main: rumor", "other: rumor");
    });
    expect(refusal(() => down(d)).join("\n")).toMatch(
      /whisper-glade.* names campaign\(s\) "other"; v1 has only "main"/,
    );
  });

  const worldOf = (c: string) => path.join(c, "vale/_atlas/world.yaml");
  const pinOf = (w: any, note: string) =>
    w.maps.find((m: any) => m.id === "vale").pins.find((p: any) => p.note === note && p.x === 100);

  it("refuses a pin whose value v1 can't give it (v1 shows the note's)", () => {
    const d = v2Project((c) =>
      editYaml(worldOf(c), (w) => (pinOf(w, "harbor").visibility = { main: "rumor" })),
    );
    expect(refusal(() => down(d)).join("\n")).toMatch(
      /pin of note "harbor" is "rumor" but v1 would show it as "player"/,
    );
  });

  it("drops, with a warning, a hidden pin of a shipping note (v1 can't hide one pin)", () => {
    const d = v2Project((c) => editYaml(worldOf(c), (w) => (pinOf(w, "harbor").visibility = "dm")));
    const plan = down(d);
    expect(plan.warnings.join("\n")).toMatch(
      /pin of note "harbor" doesn't ship .*can't hide one pin/,
    );
    const harbor = parseFrontmatter(fileText(plan, "vale/places/harbor.md")).data as any;
    expect(harbor.atlas.placements).toEqual([{ mapId: "vale", x: 220, y: 220 }]);
  });

  it("refuses a map unknown to main, and one that doesn't ship", () => {
    const d = v2Project((c) => {
      editYaml(path.join(c, "_atlas/campaigns/main.yaml"), (m) => delete m.maps.depths);
      editYaml(worldOf(c), (w) => (w.maps.find((m: any) => m.id === "vale").visibility = "dm"));
    });
    const r = refusal(() => down(d)).join("\n");
    expect(r).toMatch(/map "depths" is unknown to "main"/);
    expect(r).toMatch(/map "vale" doesn't ship to "main"/);
  });

  it("refuses a campaign that reads notes hidden", () => {
    const d = v2Project((c) =>
      replaceIn(path.join(c, "_atlas/campaigns/main.yaml"), "notes: vault", "notes: hidden"),
    );
    expect(refusal(() => down(d)).join("\n")).toMatch(/reads notes "hidden"/);
  });

  it("refuses an image or sound only under the world's _atlas/, not in public/", () => {
    const d = v2Project();
    const empty = tmp();
    const reasons = refusal(() => planMigrateDown({ ...opts(d), publicDir: empty })).join("\n");
    expect(reasons).toMatch(/"atlas\/assets\/maps\/vale-base\.png" is only under vale\/_atlas\//);
    expect(reasons).toMatch(/"atlas\/assets\/audio\/gulls\.ogg" is only under/);
  });

  it("refuses an image whose v2 copy differs from public/'s", () => {
    const d = v2Project((c) =>
      fs.appendFileSync(path.join(c, "vale/_atlas/atlas/assets/maps/vale-base.png"), "x"),
    );
    const reasons = refusal(() =>
      planMigrateDown({ ...opts(d), publicDir: path.join(FIXTURE, "public") }),
    ).join("\n");
    expect(reasons).toMatch(/vale-base\.png" differs between/);
  });

  it("lists the public/ files v1 needs, checked against the v2 copies", () => {
    const plan = planMigrateDown({ ...opts(v2Project()), publicDir: path.join(FIXTURE, "public") });
    expect([...plan.publicAssets.keys()]).toContain("atlas/assets/maps/vale-base.png");
  });

  it("refuses a notes: block", () => {
    const d = v2Project((c) =>
      fs.appendFileSync(
        path.join(c, "vale/_atlas/world.yaml"),
        "notes:\n  harbor:\n    visibility: dm\n",
      ),
    );
    expect(refusal(() => down(d)).join("\n")).toMatch(/notes: block/);
  });
});

describe("--check: the migration changes nothing a player sees", () => {
  it("fixture: v1 vs v2 differ only by the dropped region's warning; DM keeps everything; round trip the same", async () => {
    const r = await checkMigration({
      root: FIXTURE,
      configPath: "atlas.config.json",
      roundTrip: true,
      allowDropPinStyle: true,
    });
    expect(r.failures).toEqual([]);
    // Harbor's pin label and style are a declared drop (allowed, not
    // compared); the dropped thin-strip region takes its hidden-warning
    // count with it, a difference the check reports. The secret matches.
    const declared = ["atlas.json buildReport.warnings: length 1 -> 0"];
    expect(r.player).toEqual(declared);
    expect(r.dmMissing).toEqual([]);
    expect(r.roundTrip).toEqual(declared);
  }, 180_000);

  it("fails when the migrated copy shows players a dm region", async () => {
    const r = await checkMigration({
      root: FIXTURE,
      configPath: "atlas.config.json",
      allowDropPinStyle: true,
      editMigrated: (c) =>
        editYaml(path.join(c, "vale/_atlas/world.yaml"), (w) => {
          w.maps
            .find((m: any) => m.id === "vale")
            .regions.find((x: any) => x.id === "lair").visibility = { main: "player" };
        }),
    });
    expect(r.ok).toBe(false);
    expect(r.player.join("\n")).toMatch(/Lair|lair/);
  }, 180_000);

  it("down: the v1 copy of a v2 project shows players what the v2 original does", async () => {
    const d = tmp();
    fs.copyFileSync(path.join(FIXTURE, "atlas.config.json"), path.join(d, "atlas.config.json"));
    writeMigration(up(FIXTURE), path.join(d, "content"), path.join(FIXTURE, "content"));
    fs.cpSync(path.join(FIXTURE, "public"), path.join(d, "public"), { recursive: true });
    const r = await checkMigrationDown({ root: d, configPath: "atlas.config.json" });
    expect(r.failures).toEqual([]);
    expect(r.player).toEqual([]);
    expect(r.ok).toBe(true);
  }, 180_000);

  it("a temp copy of today's content/: no difference", async () => {
    const d = tmp();
    const config = readConfig(path.join(ROOT, "atlas.config.json"));
    fs.cpSync(path.join(ROOT, config.contentRoot), path.join(d, "content"), { recursive: true });
    fs.cpSync(path.join(ROOT, "public/atlas/assets"), path.join(d, "public/atlas/assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(d, "atlas.config.json"),
      JSON.stringify({ ...config, contentRoot: "content" }),
    );
    const r = await checkMigration({ root: d, configPath: "atlas.config.json", roundTrip: true });
    expect(r).toMatchObject({ ok: true, failures: [], player: [], dmMissing: [], roundTrip: [] });
  }, 180_000);
});

describe("the CLI", () => {
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const cli = path.join(ROOT, "scripts/atlas/migrate-v2.ts");
  const run = (cwd: string, ...args: string[]) =>
    spawnSync(tsx, [cli, ...args], { cwd, encoding: "utf8", timeout: 170_000 });

  it("dry run: prints the plan and writes nothing; refuses without --allow-drop-pin-style", () => {
    const d = copyProject(FIXTURE);
    const before = treeHash(d);
    const ok = run(d, "--dry-run", "--allow-drop-pin-style");
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/v1 -> v2[^]*maps: 2[^]*dry run: nothing written/);
    const refused = run(d);
    expect(refused.status).toBe(2);
    expect(refused.stderr).toMatch(/migration refused[^]*--allow-drop-pin-style/);
    expect(treeHash(d)).toBe(before);
  }, 180_000);

  it("--out: writes nothing when the check fails", () => {
    const d = copyProject(FIXTURE);
    const out = path.join(tmp(), "migrated");
    const r = run(d, "--out", out, "--allow-drop-pin-style");
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/check FAILED/);
    expect(r.stderr).toMatch(/--out was not written/);
    expect(fs.existsSync(out)).toBe(false);
  }, 180_000);
});
