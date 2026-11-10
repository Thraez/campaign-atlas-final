// @vitest-environment node
/**
 * R-17b: the structural campaign isolation scan (`scripts/check-campaign-isolation.ts`).
 *
 * A hand-made v2 output for campaign `a` of a two-campaign content root (`a`
 * "Campaign A" and `main` "Lantern Road", a copy of the scan-registry v2
 * fixture), with a must-not-ship file listing short and long hidden ids,
 * names and paths. Each test plants one fault in a clean copy and checks the
 * exit code: 23 structural, 24 text, 25 assets, 20 output missing. The real
 * build's outputs (content-next) pass it in `campaign-stores.test.ts`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXIT,
  decodeForSearch,
  isolationSecrets,
  run,
} from "../../scripts/check-campaign-isolation";
import type { MustNotShipFile } from "../../scripts/atlas/build/campaignStore";

const V2_CONTENT = path.resolve(__dirname, "fixtures/scan-registry/v2/content");

const tmps: string[] = [];
afterAll(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const MAP_PNG = "assets/maps/0123456789abcdef.png";
const BED_OGG = "assets/audio/0badf00d.ogg";

type Json = Record<string, unknown>;

function cleanAtlas(): Json {
  return {
    version: "1",
    schemaVersion: 2,
    worlds: [{ id: "vale", name: "The Vale", defaultMapId: "vale-overview" }],
    ocean: {
      width: 1000,
      height: 1000,
      sea: "default",
      onOcean: [{ map: "vale-overview", x: 0, y: 0, scale: 1, rotation: 0 }],
    },
    campaign: { id: "a", name: "Campaign A" },
    maps: [
      {
        id: "vale-overview",
        worldId: "vale",
        name: "Vale",
        width: 1000,
        height: 1000,
        layers: [{ id: "base", src: `atlas/${MAP_PNG}` }],
        regions: [
          {
            id: "meadow",
            mapId: "vale-overview",
            name: "Meadow",
            points: [
              [0, 0],
              [10, 0],
              [10, 10],
            ],
          },
        ],
        routes: [],
        soundscape: {
          areas: [{ id: "area-0", regionId: "meadow", bed: { src: `atlas/${BED_OGG}` } }],
        },
      },
    ],
    entities: [
      {
        id: "inn",
        title: "Inn",
        type: "location",
        world: "vale",
        aliases: [],
        body: "The main road meets a ford.",
        bodyHtml: "<p>The <em>main</em> road meets a ford.</p>",
        links: [],
        backlinks: [],
      },
    ],
    placements: [
      {
        id: "inn@vale-overview",
        entityId: "inn",
        mapId: "vale-overview",
        x: 1,
        y: 1,
        label: "Inn",
      },
    ],
    assets: [{ id: "asset-0", src: `atlas/${MAP_PNG}`, type: "image" }],
  };
}

function cleanIndex(): Json[] {
  return [
    {
      id: "inn",
      title: "Inn",
      type: "location",
      aliases: [],
      excerpt: "The main road meets a ford.",
      bodyText: "The main road meets a ford.",
    },
  ];
}

function cleanMustNotShip(): MustNotShipFile {
  return {
    campaign: "a",
    // `c1` (a hidden map, 2 chars), `fen` (a hidden world, 3 chars),
    // `gloomharbour-vault` (a hidden note), `hookhaven` (a hidden map).
    ids: ["c1", "fen", "gloomharbour-vault", "hookhaven", "base-cellar"],
    names: ["Gloomharbour Vault", "Hookhaven", "Fen", "Bog"],
    paths: ["images/hookhaven-chart.png", "images/c1.png"],
    pinLocations: [],
    otherCampaigns: [{ id: "main", name: "Lantern Road" }],
  };
}

interface Out {
  root: string;
  config: string;
  store: string;
  site: string;
  mns: string;
  atlas: Json;
  index: Json[];
  m: MustNotShipFile;
}

/** A temp root: the v2 fixture content with campaigns `a` and `main`, and a's clean output. */
function output(): Out {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "isolation-"));
  tmps.push(root);
  const content = path.join(root, "content");
  fs.cpSync(V2_CONTENT, content, { recursive: true });
  const campaigns = path.join(content, "_atlas", "campaigns");
  fs.rmSync(path.join(campaigns, "b.yaml"));
  fs.writeFileSync(
    path.join(campaigns, "main.yaml"),
    "id: main\nname: Lantern Road\nnotes: hidden\nmaps:\n  vale-overview:\n    state: open\n",
  );
  const atlasYaml = path.join(content, "_atlas", "atlas.yaml");
  fs.writeFileSync(
    atlasYaml,
    fs.readFileSync(atlasYaml, "utf8").replace("  - a\n  - b", "  - a\n  - main"),
  );
  const config = path.join(root, "atlas.config.json");
  fs.writeFileSync(
    config,
    JSON.stringify({
      contentRoot: "content",
      outputDir: ".atlas-campaigns",
      defaultWorld: "vale",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  const store = path.join(root, ".atlas-campaigns", "a", "atlas");
  const out: Out = {
    root,
    config,
    store,
    site: path.join(root, "dist-campaigns", "a"),
    mns: path.join(root, ".atlas-campaigns", "a", "must-not-ship.json"),
    atlas: cleanAtlas(),
    index: cleanIndex(),
    m: cleanMustNotShip(),
  };
  write(out);
  put(path.join(store, MAP_PNG), "png");
  put(path.join(store, BED_OGG), "ogg");
  return out;
}

function put(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** (Re)write the output's JSON and must-not-ship file from `o`. */
function write(o: Out) {
  put(path.join(o.store, "atlas.json"), JSON.stringify(o.atlas));
  put(path.join(o.store, "search-index.json"), JSON.stringify(o.index));
  put(o.mns, JSON.stringify(o.m));
}

/** The built site: the store under `atlas/`, plus an app shell and a bundle. */
function buildSite(o: Out) {
  fs.cpSync(o.store, path.join(o.site, "atlas"), { recursive: true });
  put(path.join(o.site, "index.html"), '<!doctype html><div id="main"></div>');
  // Short ids as ordinary substrings of a bundle: `main`, `a`.
  put(
    path.join(o.site, "assets", "index-abc123.js"),
    'function main(a){var main=a;return document.getElementById("main")}main(1);',
  );
}

const scan = (o: Out, layout: "store" | "built-site" = "store") =>
  run({
    dir: layout === "store" ? o.store : o.site,
    layout,
    config: o.config,
    mustNotShip: o.mns,
  });

const errors = () => vi.mocked(console.error).mock.calls.flat().join("\n");

const maps = (o: Out) => o.atlas.maps as Json[];
const entities = (o: Out) => o.atlas.entities as Json[];

describe("check-campaign-isolation: the clean output", () => {
  it("passes on the store", () => {
    const o = output();
    expect(scan(o), errors()).toBe(0);
  });

  it("passes on the built site, whose bundle holds `main` and `a` as ordinary substrings", () => {
    const o = output();
    buildSite(o);
    expect(scan(o, "built-site"), errors()).toBe(0);
  });

  it("reports how many names were checked by text and how many by structure only", () => {
    const o = output();
    expect(scan(o)).toBe(0);
    const log = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(log).toMatch(/\d+ name\(s\) by text search/);
    expect(log).toMatch(/\d+ by structure only/);
  });

  it("splits the set: long specific names go to text search, short and common ones don't", () => {
    const { text, structuralOnly } = isolationSecrets(cleanMustNotShip());
    const names = text.map((s) => s.name.toLowerCase());
    expect(names).toContain("gloomharbour vault");
    expect(names).toContain("lantern road");
    expect(names).not.toContain("c1");
    expect(names).not.toContain("fen");
    expect(names).not.toContain("main");
    expect(structuralOnly).toEqual(expect.arrayContaining(["c1", "fen", "Bog", "main"]));
  });
});

describe("check-campaign-isolation: structural (exit 23)", () => {
  it("another campaign's id in the campaign field", () => {
    const o = output();
    o.atlas.campaign = { id: "main", name: "Campaign A" };
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("another campaign's name in the campaign field", () => {
    const o = output();
    o.atlas.campaign = { id: "a", name: "Lantern Road" };
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a campaign field with anything besides this campaign's id and name", () => {
    const o = output();
    o.atlas.campaign = { id: "a", name: "Campaign A", others: ["x"] };
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a top-level campaigns list (the DM build's)", () => {
    const o = output();
    o.atlas.campaigns = [{ id: "a", name: "Campaign A" }];
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("another campaign's id as a key of a per-campaign map left anywhere", () => {
    const o = output();
    maps(o)[0].visibilityByCampaign = { a: "player", main: "dm" };
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a hidden map id of 2 characters (c1) in maps", () => {
    const o = output();
    maps(o).push({ id: "c1", worldId: "vale", name: "Cellar", layers: [] });
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
    expect(errors()).toContain("c1");
  });

  it("a hidden world id in ocean", () => {
    const o = output();
    (o.atlas.ocean as { onOcean: Json[] }).onOcean.push({ map: "fen", x: 0, y: 0 });
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a hidden world id in worlds", () => {
    const o = output();
    (o.atlas.worlds as Json[]).push({ id: "fen", name: "Moor" });
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a hidden map as a map's parent", () => {
    const o = output();
    maps(o)[0].parent = "c1";
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it.each([
    [
      "a pin",
      (o: Out) => (o.atlas.placements as Json[]).push({ id: "x@c1", entityId: "inn", mapId: "c1" }),
    ],
    [
      "a region",
      (o: Out) => (maps(o)[0].regions as Json[]).push({ id: "c1", mapId: "vale-overview" }),
    ],
    [
      "a route",
      (o: Out) => (maps(o)[0].routes as Json[]).push({ id: "fen", mapId: "vale-overview" }),
    ],
    [
      "a sound area",
      (o: Out) => ((maps(o)[0].soundscape as { areas: Json[] }).areas[0].regionId = "base-cellar"),
    ],
    ["a note", (o: Out) => entities(o).push({ id: "c1", title: "Moss", world: "vale" })],
    ["a link", (o: Out) => (entities(o)[0].links = [{ target: "x", resolvedId: "c1" }])],
  ])("a hidden id in %s", (_what, plant) => {
    const o = output();
    plant(o);
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a hidden short name as a name field", () => {
    const o = output();
    (maps(o)[0].regions as Json[])[0].name = "Bog";
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("an entity whose world is not in worlds", () => {
    const o = output();
    entities(o)[0].world = "moor";
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a map whose world is not in worlds, or whose parent isn't shipped", () => {
    const o = output();
    maps(o)[0].worldId = "moor";
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
    const p = output();
    maps(p)[0].parent = "elsewhere";
    write(p);
    expect(scan(p)).toBe(EXIT.structural);
  });

  it("a pin on a map that isn't shipped", () => {
    const o = output();
    (o.atlas.placements as Json[])[0].mapId = "elsewhere";
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a hidden id in search-index.json", () => {
    const o = output();
    o.index.push({ id: "c1", title: "Moss", type: "location", aliases: [] });
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a hidden image path or its file name as a value, any length", () => {
    const o = output();
    entities(o)[0].images = ["c1.png"];
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("an atlas.json that isn't valid JSON", () => {
    const o = output();
    put(path.join(o.store, "atlas.json"), "{not json");
    expect(scan(o)).toBe(EXIT.structural);
  });

  it("a must-not-ship file whose campaign list disagrees with the content's", () => {
    const o = output();
    o.m.otherCampaigns = [];
    write(o);
    expect(scan(o)).toBe(EXIT.structural);
  });
});

describe("check-campaign-isolation: text (exit 24)", () => {
  const plantBody = (o: Out, html: string) => {
    entities(o)[0].bodyHtml = html;
    write(o);
  };

  it("a hidden long name in search-index.json", () => {
    const o = output();
    o.index[0].bodyText = "Rumours of the Gloomharbour Vault.";
    write(o);
    expect(scan(o)).toBe(EXIT.text);
  });

  it("another campaign's name in a note body", () => {
    const o = output();
    plantBody(o, "<p>As seen on the lantern road.</p>");
    expect(scan(o)).toBe(EXIT.text);
  });

  it.each([
    ["inline markup", "<p>Hook<em>haven</em></p>"],
    ["a soft hyphen entity", "<p>Hook&shy;haven</p>"],
    ["a soft hyphen character", "<p>Hook\u00ADhaven</p>"],
    ["a zero-width space", "<p>Hook\u200Bhaven</p>"],
    ["numeric entities", "<p>&#72;ook&#x68;aven</p>"],
    ["an escaped closing tag", "<p>Hook<span>hav<\\/span>en</p>"],
    ["percent-encoding", '<a href="/x?q=Gloomharbour%20Vault">x</a>'],
    ["a non-breaking space", "<p>Gloomharbour&nbsp;Vault</p>"],
    ["a line break", "<p>Gloomharbour\n   Vault</p>"],
  ])("a hidden name split by %s", (_what, html) => {
    const o = output();
    plantBody(o, html);
    expect(scan(o)).toBe(EXIT.text);
  });

  it("a hidden image's file name in text", () => {
    const o = output();
    plantBody(o, "<p>see hookhaven-chart.png</p>");
    expect(scan(o)).toBe(EXIT.text);
  });

  it("a percent-encoded hidden path", () => {
    const o = output();
    plantBody(o, '<img src="x/images%2Fhookhaven-chart.png">');
    expect(scan(o)).toBe(EXIT.text);
  });

  it("a hidden name in the built site's bundle", () => {
    const o = output();
    buildSite(o);
    put(path.join(o.site, "assets", "chunk.js"), 'const x="Gloomharbour Vault";');
    expect(scan(o, "built-site")).toBe(EXIT.text);
  });

  it("names inside longer words don't hit (no false positive)", () => {
    const o = output();
    plantBody(o, "<p>Hookhavens and the maintenance of a remain.</p>");
    expect(scan(o), errors()).toBe(0);
  });
});

describe("decodeForSearch", () => {
  it("joins names split by inline markup, entities and invisible characters", () => {
    expect(decodeForSearch("Hook<em>haven</em>")).toContain("Hookhaven");
    expect(decodeForSearch("Hook&shy;haven")).toContain("Hookhaven");
    expect(decodeForSearch("Hook\\u00adhaven")).toContain("Hookhaven");
    expect(decodeForSearch("Hook%C2%ADhaven")).toContain("Hookhaven");
    expect(decodeForSearch("&amp;lt;b&amp;gt;")).not.toContain("&");
  });

  it("keeps block tags as a word break", () => {
    expect(decodeForSearch("<p>Hook</p><p>haven</p>")).not.toContain("Hookhaven");
  });
});

describe("check-campaign-isolation: assets (exit 25)", () => {
  it("an unreferenced image in the store", () => {
    const o = output();
    put(path.join(o.store, "assets", "maps", "fedcba9876543210.png"), "png");
    expect(scan(o)).toBe(EXIT.assets);
  });

  it("an unreferenced audio file in the store", () => {
    const o = output();
    put(path.join(o.store, "assets", "audio", "deadbeef.ogg"), "ogg");
    expect(scan(o)).toBe(EXIT.assets);
  });

  it("any other file in the store", () => {
    const o = output();
    put(path.join(o.store, "world.yaml"), "x: 1");
    expect(scan(o)).toBe(EXIT.assets);
  });

  it("a reference that resolves to no file in the store", () => {
    const o = output();
    fs.rmSync(path.join(o.store, BED_OGG));
    expect(scan(o)).toBe(EXIT.assets);
  });

  it("a symlink in the store", () => {
    const o = output();
    const real = path.join(o.root, "elsewhere.png");
    put(real, "png");
    fs.rmSync(path.join(o.store, MAP_PNG));
    fs.symlinkSync(real, path.join(o.store, MAP_PNG));
    expect(scan(o)).toBe(EXIT.assets);
  });

  it("a built site whose atlas dir holds a file its store doesn't", () => {
    const o = output();
    buildSite(o);
    put(path.join(o.site, "atlas", "assets", "maps", "world.png"), "png");
    expect(scan(o, "built-site")).toBe(EXIT.assets);
  });

  it("a built site whose atlas dir lacks a file of its store", () => {
    const o = output();
    buildSite(o);
    fs.rmSync(path.join(o.site, "atlas", BED_OGG));
    expect(scan(o, "built-site")).toBe(EXIT.assets);
  });
});

describe("check-campaign-isolation: output missing (exit 20)", () => {
  it("no output dir", () => {
    const o = output();
    fs.rmSync(path.join(o.root, ".atlas-campaigns", "a", "atlas"), { recursive: true });
    expect(scan(o)).toBe(EXIT.missing);
  });

  it("no atlas.json", () => {
    const o = output();
    fs.rmSync(path.join(o.store, "atlas.json"));
    expect(scan(o)).toBe(EXIT.missing);
  });

  it("no search-index.json", () => {
    const o = output();
    fs.rmSync(path.join(o.store, "search-index.json"));
    expect(scan(o)).toBe(EXIT.missing);
  });

  it("no must-not-ship file", () => {
    const o = output();
    fs.rmSync(o.mns);
    expect(scan(o)).toBe(EXIT.missing);
  });

  it("a built site whose store is missing", () => {
    const o = output();
    buildSite(o);
    fs.rmSync(o.store, { recursive: true });
    expect(scan(o, "built-site")).toBe(EXIT.missing);
  });
});

describe("check-campaign-isolation: bad input fails closed (exit 1)", () => {
  it("a malformed must-not-ship file", () => {
    const o = output();
    put(o.mns, '{"campaign":"a"}');
    expect(scan(o)).toBe(1);
  });

  it("a campaign the content doesn't list", () => {
    const o = output();
    o.m.campaign = "zzz";
    write(o);
    expect(scan(o)).toBe(1);
  });
});
