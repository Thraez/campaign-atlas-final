/**
 * R-16: `npm run atlas:tree` on the v2 test world (`content-next/`) shows the
 * two campaigns differing exactly as `content-next/README.md` says, today's
 * `content/` shows its one map for `main`, the vault checks leave
 * `content-next/` alone, and nothing that publishes reads it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  atlasTree,
  formatAtlasTree,
  loadAtlasTree,
  type CampaignTree,
  type TreeMap,
} from "./atlas-tree";
import { loadAtlasModel } from "./loadAtlasModel";
import { isVaultNote } from "./vaultContent";
import { resolveCampaign } from "../../src/atlas/content/resolveCampaign";
import { run as checkVaultContent } from "../check-vault-content";

const REPO = path.resolve(__dirname, "../..");
const NEXT_CONFIG = path.join(REPO, "atlas.next.config.json");
const NEXT = path.join(REPO, "content-next");

function nextConfig() {
  return JSON.parse(fs.readFileSync(NEXT_CONFIG, "utf8")) as {
    contentRoot: string;
    outputDir: string;
    defaultWorld: string;
    hosting: string;
    include: string[];
    exclude: string[];
  };
}

function loadNext() {
  const cfg = nextConfig();
  return loadAtlasModel(NEXT, cfg, { root: REPO });
}

/** Every map in a tree, depth first, as `id: verdict, state, shipping counts`. */
function flat(t: CampaignTree): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (m: TreeMap) => {
    const c = m.counts;
    out[m.id] =
      `${m.ships ? "ships" : m.reason}, ${m.state}, ` +
      `pins ${c.pins.ships} regions ${c.regions.ships} routes ${c.routes.ships} sound ${c.sound.ships}`;
    m.children.forEach(walk);
  };
  t.worlds.forEach((w) => w.maps.forEach(walk));
  return out;
}

/** The tree's shape: each map's children, by id. */
function shape(t: CampaignTree): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (m: TreeMap) => {
    out[m.id] = m.children.map((c) => c.id);
    m.children.forEach(walk);
  };
  t.worlds.forEach((w) => w.maps.forEach(walk));
  return out;
}

describe("content-next/ loads clean", () => {
  it("loads with no errors and no warnings; no orphan entries or collisions in either campaign", () => {
    const loaded = loadNext();
    expect(loaded.model.schemaVersion).toBe(2);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.model.campaigns.map((c) => [c.id, c.notes])).toEqual([
      ["main", "vault"],
      ["sandbox", "hidden"],
    ]);
    for (const c of ["main", "sandbox"]) {
      const r = resolveCampaign(loaded.model, loaded.notes, c);
      expect(r.orphanEntries).toEqual([]);
      expect(r.collisions).toEqual([]);
      expect(r.warnings).toEqual([]);
      // The README's one stale entry.
      expect(r.staleEntries).toEqual([{ world: "quessaly", note: "wexley-tarn" }]);
    }
  });

  it("keeps its map images lossless, in <world>/_atlas/images/, a few hundred px", () => {
    const { model } = loadNext();
    for (const w of model.worlds) {
      for (const m of w.maps) {
        expect(m.layers).toHaveLength(1);
        const src = m.layers[0].src;
        expect(src).toMatch(/^images\/[a-z-]+\.png$/);
        const file = path.join(NEXT, w.world.id, "_atlas", src);
        expect(fs.existsSync(file), file).toBe(true);
        const png = fs.readFileSync(file);
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([m.width, m.height]);
        expect(Math.max(m.width, m.height)).toBeLessThanOrEqual(600);
      }
    }
  });
});

describe("atlas:tree on content-next/", () => {
  const { trees } = loadAtlasTree(NEXT_CONFIG, REPO);
  const [main, sandbox] = trees;

  it("has both campaigns, the ocean and the same three-level tree in each", () => {
    expect(trees.map((t) => [t.campaign, t.name, t.notesMode])).toEqual([
      ["main", "Lantern Road", "vault"],
      ["sandbox", "Sandbox", "hidden"],
    ]);
    for (const t of trees) {
      expect(t.ocean).toEqual({ width: 3000, height: 2000, sea: "default" });
      expect(t.worlds.map((w) => w.id)).toEqual(["quessaly", "skerrow"]);
      expect(shape(t)).toEqual({
        "quessaly-world": ["oskmark"],
        oskmark: ["brindlecross", "tallowford", "mirefold"],
        brindlecross: [],
        tallowford: [],
        mirefold: ["mirefold-cellars"],
        "mirefold-cellars": [],
        "skerrow-isles": ["hookhaven"],
        hookhaven: [],
      });
      expect(t.worlds[0].maps[0].onOcean).toMatchObject({ x: 200, y: 300, scale: 2 });
      expect(t.worlds[1].maps[0].onOcean).toMatchObject({ x: 2200, y: 600, scale: 1 });
    }
  });

  it("main: everything open, every map ships", () => {
    expect(main.worlds.map((w) => [w.id, w.ships])).toEqual([
      ["quessaly", true],
      ["skerrow", true],
    ]);
    expect(flat(main)).toEqual({
      "quessaly-world": "ships, open, pins 0 regions 1 routes 1 sound 0",
      // Pin of marra-quillon hidden by notes: (entry); regions the-murkwater
      // (dm) and heron-flats (sandbox only) hide what is in or reaching into
      // them (rule 9); the-fenlands contains the-murkwater and ships.
      oskmark: "ships, open, pins 1 regions 2 routes 0 sound 1",
      brindlecross: "ships, open, pins 1 regions 0 routes 0 sound 0",
      tallowford: "ships, open, pins 1 regions 0 routes 0 sound 0",
      mirefold: "frame-in-hidden-region, open, pins 0 regions 0 routes 0 sound 0",
      "mirefold-cellars": "parent-hidden, open, pins 0 regions 0 routes 0 sound 0",
      "skerrow-isles": "ships, open, pins 0 regions 1 routes 0 sound 0",
      hookhaven: "ships, open, pins 1 regions 0 routes 0 sound 0",
    });
    expect(main.notes.total).toBe(8);
    expect([...main.notes.ships].sort()).toEqual([
      "gilda-moth",
      "haskel-thimbleby",
      "mossbeck-well",
      "pellam-ferry",
      "the-tide-warden",
    ]);
  });

  it("sandbox: differs from main exactly as the README says", () => {
    expect(sandbox.worlds.map((w) => [w.id, w.ships, w.reason])).toEqual([
      ["quessaly", true, "ships"],
      ["skerrow", false, "no-map-ships"], // rule 5
    ]);
    expect(flat(sandbox)).toEqual({
      "quessaly-world": "ships, open, pins 0 regions 1 routes 1 sound 0",
      // Fogged: haskel-thimbleby's pin under fog; reedmere hidden (and
      // reed-whisper with it); heron-flats and heron-trail ship here.
      oskmark: "ships, fogged, pins 1 regions 2 routes 1 sound 0",
      brindlecross: "visibility, open, pins 0 regions 0 routes 0 sound 0",
      tallowford: "frame-fogged, open, pins 0 regions 0 routes 0 sound 0", // rule 4
      mirefold: "frame-in-hidden-region, open, pins 0 regions 0 routes 0 sound 0",
      "mirefold-cellars": "parent-hidden, open, pins 0 regions 0 routes 0 sound 0",
      "skerrow-isles": "unknown-state, unknown, pins 0 regions 0 routes 0 sound 0",
      hookhaven: "parent-hidden, open, pins 0 regions 0 routes 0 sound 0",
    });
    expect(sandbox.notes.total).toBe(8);
    expect([...sandbox.notes.ships].sort()).toEqual([
      "haskel-thimbleby",
      "marra-quillon",
      "mossbeck-well",
    ]);
  });

  it("each README case resolves as the table says", () => {
    const loaded = loadNext();
    const m = resolveCampaign(loaded.model, loaded.notes, "main");
    const s = resolveCampaign(loaded.model, loaded.notes, "sandbox");
    const note = (r: typeof m, id: string) => r.notes.find((n) => n.id === id)?.reason;
    const pin = (r: typeof m, noteId: string) => r.pins.find((p) => p.note === noteId)?.reason;
    const item = (list: typeof m.regions, id: string) => list.find((x) => x.id === id)?.reason;

    // Note visible in both.
    expect([note(m, "haskel-thimbleby"), note(s, "haskel-thimbleby")]).toEqual(["ships", "ships"]);
    // Note hidden only via notes: in one campaign.
    expect([note(m, "marra-quillon"), note(s, "marra-quillon")]).toEqual(["entry", "ships"]);
    // Region visible in one campaign only, and its ride-on sound.
    expect([item(m.regions, "reedmere"), item(s.regions, "reedmere")]).toEqual([
      "ships",
      "visibility",
    ]);
    expect([item(m.sound, "reed-whisper"), item(s.sound, "reed-whisper")]).toEqual([
      "ships",
      "region-hidden",
    ]);
    // Map fogged in one campaign, with a pin under the fog.
    expect([pin(m, "haskel-thimbleby"), pin(s, "haskel-thimbleby")]).toEqual(["ships", "fogged"]);
    // Frontmatter dm; stale basedOn.
    expect([note(m, "the-ninth-lantern"), note(s, "the-ninth-lantern")]).toEqual([
      "secret",
      "secret",
    ]);
    expect([note(m, "wexley-tarn"), note(s, "wexley-tarn")]).toEqual([
      "stale-entry",
      "stale-entry",
    ]);
    // Rule 5: the second world's note.
    expect([note(m, "the-tide-warden"), note(s, "the-tide-warden")]).toEqual([
      "ships",
      "world-hidden",
    ]);
    // notes: vault vs notes: hidden.
    expect([note(m, "pellam-ferry"), note(s, "pellam-ferry")]).toEqual(["ships", "not-named"]);
    expect([note(m, "gilda-moth"), note(s, "gilda-moth")]).toEqual(["ships", "not-named"]);
    // The hidden region itself; its contents are tested below (rule 9).
    expect([item(m.regions, "the-murkwater"), item(s.regions, "the-murkwater")]).toEqual([
      "visibility",
      "visibility",
    ]);
    // Rule 9: a player region wholly inside it, a route crossing it with no
    // waypoint inside, a container that still ships, a city framed partly
    // over it (hidden with its subtree), and a region hidden in main only.
    for (const r of [m, s]) {
      expect(item(r.regions, "sunken-bell")).toBe("in-hidden-region");
      expect(item(r.routes, "ferrymans-cut")).toBe("in-hidden-region");
      expect(item(r.regions, "the-fenlands")).toBe("ships");
      expect(r.maps.find((x) => x.id === "mirefold")?.reason).toBe("frame-in-hidden-region");
      expect(r.maps.find((x) => x.id === "mirefold-cellars")?.reason).toBe("parent-hidden");
      expect(item(r.regions, "bog-market")).toBe("map-hidden");
    }
    expect([item(m.regions, "heron-flats"), item(s.regions, "heron-flats")]).toEqual([
      "visibility",
      "ships",
    ]);
    expect([item(m.routes, "heron-trail"), item(s.routes, "heron-trail")]).toEqual([
      "in-hidden-region",
      "ships",
    ]);
    // mossbeck-well ships as a note, but its only pin is hidden: the build warns.
    expect(m.hiddenPinNotes).toEqual([
      { note: "mossbeck-well", regions: [{ map: "oskmark", region: "the-murkwater" }] },
    ]);
    expect(s.hiddenPinNotes).toEqual(m.hiddenPinNotes);
  });

  const insideMurkwater = (c: string) => {
    const loaded = loadNext();
    const r = resolveCampaign(loaded.model, loaded.notes, c);
    return [
      r.pins.find((p) => p.note === "mossbeck-well"),
      r.routes.find((x) => x.id === "eel-path"),
      r.sound.find((x) => x.id === "frog-chorus"),
    ];
  };

  it("the pin, route and sound-only area inside the-murkwater all resolve", () => {
    for (const c of ["main", "sandbox"]) {
      for (const item of insideMurkwater(c)) expect(item).toBeDefined();
    }
  });

  // GOALS.md: a hidden zone and everything inside it or reaching into it
  // never ship (ADR-0004 rule 9, R-11e).
  it("a pin, route and sound-only area inside a hidden region don't ship", () => {
    for (const c of ["main", "sandbox"]) {
      for (const item of insideMurkwater(c)) {
        expect(item!.ships).toBe(false);
        expect(item!.reason).toBe("in-hidden-region");
      }
    }
  });

  it("prints each campaign's tree", () => {
    const text = formatAtlasTree(trees);
    expect(text).toContain('campaign main "Lantern Road" (notes: vault)');
    expect(text).toContain('campaign sandbox "Sandbox" (notes: hidden)');
    expect(text).toContain("ocean 3000x2000, sea default");
    expect(text).toMatch(
      /^ {6}oskmark "Oskmark": ships, fogged \| pins 1\/3, regions 2\/5, routes 1\/3, sound 0\/2$/m,
    );
    // Item reasons on a map that ships, rule 9's among them.
    expect(text).toMatch(/^ {8}hidden: .*pin mossbeck-well \(in-hidden-region\)/m);
    expect(text).toMatch(/^ {8}hidden: .*route ferrymans-cut \(in-hidden-region\)/m);
    expect(text).toMatch(/^ {8}mirefold "Mirefold": hidden \(frame-in-hidden-region\), open \|/m);
    expect(text).toMatch(/^ {8}tallowford "Tallowford": hidden \(frame-fogged\), open \|/m);
    expect(text).toContain('world skerrow "The Skerrow Isles": hidden (no-map-ships)');
  });
});

describe("atlas:tree on content/ (v1)", () => {
  it("prints today's one map for main", () => {
    const { trees } = loadAtlasTree(path.join(REPO, "atlas.config.json"), REPO);
    expect(trees.map((t) => t.campaign)).toEqual(["main"]);
    expect(trees[0].ocean).toBeNull();
    expect(trees[0].worlds).toHaveLength(1);
    const maps = trees[0].worlds[0].maps;
    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({ ships: true, children: [] });
    expect(formatAtlasTree(trees)).toContain("ocean: none (schema v1)");
  });
});

describe("atlasTree", () => {
  it("lists a map whose parent can't be found at the top, and survives a cycle", () => {
    const loaded = loadNext();
    const world = loaded.model.worlds[0];
    const model = {
      ...loaded.model,
      worlds: [
        {
          ...world,
          maps: [
            { ...world.maps[0], id: "a", parent: "b" },
            { ...world.maps[0], id: "b", parent: "a" },
            { ...world.maps[0], id: "c", parent: "nowhere" },
          ],
        },
      ],
    };
    const [t] = atlasTree({ model, notes: [] });
    expect(t.worlds[0].maps.map((m) => [m.id, m.reason])).toEqual([
      ["c", "bad-parent"],
      ["a", "bad-parent"],
    ]);
    expect(t.worlds[0].maps[1].children.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("the vault checks leave content-next/ alone", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-next-vault-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("no note carries Sync's vault marker", () => {
    const signals = { ids: new Set<string>(), hashes: new Set<string>() };
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : e.name.endsWith(".md") ? [p] : [];
      });
    const notes = walk(NEXT);
    expect(notes.length).toBeGreaterThan(5);
    for (const p of notes) {
      expect(isVaultNote(fs.readFileSync(p, "utf8"), path.relative(REPO, p), signals), p).toBe(
        false,
      );
    }
  });

  it("check-vault-content passes on it while hosting is public", async () => {
    expect(nextConfig().hosting).toBe("public");
    // A fresh root: no machine-local sync map or vault path, as on a fresh clone.
    expect(await checkVaultContent({ root: tmp, config: NEXT_CONFIG })).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      "check-vault-content: nothing in content/ came from the vault — clean",
    );
  });
});

describe("content-next/ can't reach a published build", () => {
  const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");
  // Matches literal strings only: a path built at runtime (joined, templated,
  // read from env) would slip past this guard.
  const NEXT_REFS = /content-next|atlas\.next\.config/;

  it("the publish chain, the deploy workflow, the Vite build and the scan registry never name it", () => {
    for (const rel of [
      ".github/workflows/publish-atlas.yml",
      "vite.config.ts",
      "scripts/build-atlas.ts",
      "scripts/atlas/publish-orchestrator.ts",
      "scripts/atlas/scanRegistry.ts",
    ]) {
      expect(read(rel), rel).not.toMatch(NEXT_REFS);
    }
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
      .scripts;
    for (const name of [
      "atlas:publish",
      "atlas:snapshot",
      "atlas:build:player",
      "build",
      "atlas:scan",
    ]) {
      expect(scripts[name], name).toBeDefined();
      expect(scripts[name], name).not.toMatch(NEXT_REFS);
    }
  });

  it("the published config still reads content/, and the test world's outputs are gitignored, outside public/", () => {
    expect((JSON.parse(read("atlas.config.json")) as { contentRoot: string }).contentRoot).toBe(
      "content",
    );
    const cfg = nextConfig();
    expect(cfg.contentRoot).toBe("content-next");
    expect(cfg.outputDir.startsWith("public")).toBe(false);
    const ignored = read(".gitignore").split("\n");
    expect(ignored).toContain(`${cfg.outputDir}/`);
    expect(ignored).toContain("dist-campaigns/");
  });

  it("no app source under src/ names it", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return e.name === "test" || e.name === "fixtures" ? [] : walk(p);
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
      });
    for (const p of walk(path.join(REPO, "src"))) {
      expect(fs.readFileSync(p, "utf8"), p).not.toMatch(NEXT_REFS);
    }
  });
});
