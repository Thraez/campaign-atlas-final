// @vitest-environment node
/**
 * R-17: one player output per campaign. Built from a temp copy of the v2 test
 * world (`content-next/`, campaigns `main` "Lantern Road" and `sandbox`).
 *
 * - The default player build writes both stores, `.atlas-campaigns/<id>/atlas/`,
 *   each with its own `assets/` (copies, no shared dir) and its
 *   `must-not-ship.json` beside it, never in it.
 * - Sentinels: every id and name the campaign's must-not-ship file lists, and
 *   the other campaign's id and name, are absent from every file of the
 *   store (whole word, any case); the bytes of every hidden map image and
 *   sound bed are absent from every file. Named on purpose: map
 *   `brindlecross` (sandbox), world `skerrow` and `hookhaven` (sandbox), pin
 *   of `mossbeck-well`, route `eel-path`, sound `frog-chorus` (rule 9, both),
 *   sound `reed-whisper` (sandbox), note `marra-quillon` (main).
 * - Every registry scan passes on both campaigns' outputs.
 * - A note body linking a hidden map or note: the link is redacted, the
 *   name and id are absent, and a strict build fails (exit 8).
 * - `--campaign` builds one; one campaign failing writes nothing at all.
 * - Review round 1: a hidden name, id or path (or another campaign's) in any
 *   shipped text fails every v2 player build (exit 12, nothing written);
 *   stores are replaced whole and a full build drops removed campaigns; the
 *   stores root can't be public/ (case or symlink), the repo, a source folder
 *   or an unmarked folder; markdown and HTML images fail closed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { runBuild } from "../../../scripts/build-atlas";
import {
  readMustNotShip,
  STORES_ROOT_MARKER,
  type MustNotShipFile,
} from "../../../scripts/atlas/build/campaignStore";
import { scanTasks } from "../../../scripts/atlas/scanRegistry";
import { readPlayerImageRefs } from "../../../scripts/atlas/playerImageRefs";
import { run as checkFogSafety } from "../../../scripts/check-fog-safety";

const ROOT = path.resolve(__dirname, "../../..");
const CAMPAIGNS = { main: "Lantern Road", sandbox: "Sandbox" } as const;
type Campaign = keyof typeof CAMPAIGNS;

const tmps: string[] = [];
afterAll(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

/** A temp root holding `content-next/` and its config as `atlas.config.json`. */
function testWorld(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r17-"));
  tmps.push(root);
  fs.cpSync(path.join(ROOT, "content-next"), path.join(root, "content-next"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "atlas.next.config.json"), path.join(root, "atlas.config.json"));
  return root;
}

function edit(root: string, rel: string, from: string, to: string) {
  const file = path.join(root, "content-next", rel);
  const text = fs.readFileSync(file, "utf8");
  expect(text, rel).toContain(from);
  fs.writeFileSync(file, text.replace(from, to));
}

const storeOf = (root: string, c: string) => path.join(root, ".atlas-campaigns", c, "atlas");
const content = (root: string, rel: string) => path.join(root, "content-next", rel);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (s: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}(?![\\p{L}\\p{N}])`, "iu");

/** Which of `words` appear, whole word and any case, in any file under `dir`. */
function wordsIn(dir: string, words: string[]): string[] {
  const texts = walk(dir).map((f) => fs.readFileSync(f).toString("latin1"));
  return words.filter((w) => texts.some((t) => wholeWord(w).test(t)));
}

/** Which of `files` (absolute) have their bytes inside any file under `dir`. */
function bytesIn(dir: string, files: string[]): string[] {
  const outs = walk(dir).map((f) => fs.readFileSync(f));
  return files.filter((f) => {
    const needle = fs.readFileSync(f);
    return outs.some((o) => o.indexOf(needle) !== -1);
  });
}

const silence = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};
afterEach(() => vi.restoreAllMocks());

const IMAGES = {
  quessalyWorld: "quessaly/_atlas/images/quessaly-world.png",
  oskmark: "quessaly/_atlas/images/oskmark.png",
  brindlecross: "quessaly/_atlas/images/brindlecross.png",
  tallowford: "quessaly/_atlas/images/tallowford.png",
  mirefold: "quessaly/_atlas/images/mirefold.png",
  mirefoldCellars: "quessaly/_atlas/images/mirefold-cellars.png",
  skerrowIsles: "skerrow/_atlas/images/skerrow-isles.png",
  hookhaven: "skerrow/_atlas/images/hookhaven.png",
};
const AUDIO = {
  frogChorus: "quessaly/_atlas/audio/frog-chorus.ogg",
  reedWhisper: "quessaly/_atlas/audio/reed-whisper.ogg",
};

/** Per campaign: what it ships and what must not reach it (both by content path). */
const EXPECT: Record<Campaign, { ships: string[]; hidden: string[] }> = {
  main: {
    ships: [
      IMAGES.quessalyWorld,
      IMAGES.oskmark,
      IMAGES.brindlecross,
      IMAGES.tallowford,
      IMAGES.skerrowIsles,
      IMAGES.hookhaven,
      AUDIO.reedWhisper,
    ],
    hidden: [IMAGES.mirefold, IMAGES.mirefoldCellars, AUDIO.frogChorus],
  },
  sandbox: {
    // oskmark is fogged in sandbox: its layers don't ship (no fog mask yet).
    ships: [IMAGES.quessalyWorld],
    hidden: [
      IMAGES.oskmark,
      IMAGES.brindlecross,
      IMAGES.tallowford,
      IMAGES.mirefold,
      IMAGES.mirefoldCellars,
      IMAGES.skerrowIsles,
      IMAGES.hookhaven,
      AUDIO.frogChorus,
      AUDIO.reedWhisper,
    ],
  },
};

describe("R-17: one player store per campaign", () => {
  let root: string;
  const mns = {} as Record<Campaign, MustNotShipFile>;

  beforeAll(async () => {
    root = testWorld();
    silence();
    const r = await runBuild({ player: true, strict: true }, root);
    vi.restoreAllMocks();
    expect(r, r.error).toMatchObject({ ok: true, exitCode: 0 });
    for (const c of Object.keys(CAMPAIGNS) as Campaign[]) {
      mns[c] = readMustNotShip(path.join(root, ".atlas-campaigns", c, "must-not-ship.json"));
    }
  });

  it("writes each store with its JSON and assets, and the must-not-ship file beside it", () => {
    expect(fs.readdirSync(path.join(root, ".atlas-campaigns")).sort()).toEqual([
      STORES_ROOT_MARKER,
      "main",
      "sandbox",
    ]);
    for (const c of Object.keys(CAMPAIGNS) as Campaign[]) {
      expect(fs.readdirSync(path.join(root, ".atlas-campaigns", c)).sort()).toEqual([
        "atlas",
        "must-not-ship.json",
      ]);
      const files = walk(storeOf(root, c)).map((f) => path.relative(storeOf(root, c), f));
      expect(files).toContain("atlas.json");
      expect(files).toContain("search-index.json");
      expect(files.filter((f) => !f.startsWith(`assets${path.sep}`)).sort()).toEqual([
        "atlas.json",
        "search-index.json",
      ]);
      expect(mns[c].campaign).toBe(c);
    }
    // Nothing reached v1's served dir.
    expect(fs.existsSync(path.join(root, "public"))).toBe(false);
  });

  it.each(Object.keys(CAMPAIGNS) as Campaign[])(
    "%s: the store holds exactly the files its atlas.json names, as copies",
    (c) => {
      const store = storeOf(root, c);
      const refs = [...readPlayerImageRefs(store)].sort();
      const assets = walk(path.join(store, "assets"))
        .map((f) => path.relative(store, f).split(path.sep).join("/"))
        .sort();
      expect(assets).toEqual(refs);
      for (const f of walk(store)) expect(fs.lstatSync(f).isSymbolicLink(), f).toBe(false);
      // Hashed names only: no DM file name ships.
      for (const a of assets)
        expect(a).toMatch(/^assets\/(maps\/[0-9a-f]{16}\.png|audio\/[0-9a-f]{8}\.ogg)$/);
    },
  );

  it.each(Object.keys(CAMPAIGNS) as Campaign[])("%s: names its own campaign only", (c) => {
    const atlas = JSON.parse(fs.readFileSync(path.join(storeOf(root, c), "atlas.json"), "utf8"));
    expect(atlas.campaign).toEqual({ id: c, name: CAMPAIGNS[c] });
    expect(atlas.campaigns).toBeUndefined();
    const other = (Object.keys(CAMPAIGNS) as Campaign[]).filter((o) => o !== c);
    expect(mns[c].otherCampaigns).toEqual(other.map((o) => ({ id: o, name: CAMPAIGNS[o] })));
    expect(
      wordsIn(
        storeOf(root, c),
        other.flatMap((o) => [o, CAMPAIGNS[o]]),
      ),
    ).toEqual([]);
  });

  it("the sentinels are in the must-not-ship files", () => {
    expect(mns.sandbox.ids).toEqual(
      expect.arrayContaining([
        "brindlecross",
        "skerrow",
        "hookhaven",
        "skerrow-isles",
        "eel-path",
        "frog-chorus",
        "reed-whisper",
        "the-murkwater",
        "gilda-moth",
        "the-tide-warden",
      ]),
    );
    expect(mns.main.ids).toEqual(
      expect.arrayContaining([
        "eel-path",
        "frog-chorus",
        "the-murkwater",
        "marra-quillon",
        "mirefold",
      ]),
    );
    for (const c of Object.keys(CAMPAIGNS) as Campaign[]) {
      // mossbeck-well's pin, inside the-murkwater (rule 9).
      expect(mns[c].pinLocations, c).toContainEqual(
        expect.objectContaining({ map: "oskmark", x: 220, y: 300 }),
      );
    }
  });

  it.each(Object.keys(CAMPAIGNS) as Campaign[])(
    "%s: no must-not-ship id or name is in any file of the store",
    (c) => {
      expect(mns[c].ids.length + mns[c].names.length).toBeGreaterThan(10);
      expect(wordsIn(storeOf(root, c), [...mns[c].ids, ...mns[c].names])).toEqual([]);
    },
  );

  it.each(Object.keys(CAMPAIGNS) as Campaign[])(
    "%s: hidden images and sound beds are absent by bytes; shipped ones are present",
    (c) => {
      const abs = (rels: string[]) => rels.map((r) => content(root, r));
      expect(bytesIn(storeOf(root, c), abs(EXPECT[c].hidden))).toEqual([]);
      expect(bytesIn(storeOf(root, c), abs(EXPECT[c].ships))).toEqual(abs(EXPECT[c].ships));
    },
  );

  it("the hidden pin, route and sound area are absent from the maps", () => {
    for (const c of Object.keys(CAMPAIGNS) as Campaign[]) {
      const atlas = JSON.parse(fs.readFileSync(path.join(storeOf(root, c), "atlas.json"), "utf8"));
      const oskmark = atlas.maps.find((m: { id: string }) => m.id === "oskmark");
      expect(oskmark, c).toBeDefined();
      const ids = (xs: { id?: string; entity?: string; note?: string }[] = []) =>
        xs.map((x) => x.id ?? x.entity ?? x.note);
      expect(ids(oskmark.routes)).not.toContain("eel-path");
      expect(ids(oskmark.soundscape?.areas)).not.toContain("frog-chorus");
      const pins = atlas.placements.map((p: { mapId: string; x: number; y: number }) => [
        p.mapId,
        p.x,
        p.y,
      ]);
      expect(pins).not.toContainEqual(["oskmark", 220, 300]);
      expect(wordsIn(storeOf(root, c), ["mossbeck-well@oskmark"])).toEqual([]);
    }
  });

  it("check-fog-safety reads sandbox's fog from its campaign file", async () => {
    const config = path.join(root, "atlas.config.json");
    const copy = path.join(root, "fog-copy", "atlas");
    fs.cpSync(storeOf(root, "sandbox"), copy, { recursive: true });
    const file = path.join(copy, "atlas.json");
    const clean = fs.readFileSync(file, "utf8");
    silence();
    expect(await checkFogSafety({ dir: copy, config, layout: "store", campaign: "sandbox" })).toBe(
      0,
    );
    // A region east of x = 300 on oskmark is under sandbox's fog.
    const atlas = JSON.parse(clean);
    atlas.maps
      .find((m: { id: string }) => m.id === "oskmark")
      .regions.push({
        id: "planted",
        points: [
          [400, 100],
          [450, 100],
          [450, 150],
        ],
      });
    fs.writeFileSync(file, JSON.stringify(atlas));
    expect(await checkFogSafety({ dir: copy, config, layout: "store", campaign: "sandbox" })).toBe(
      15,
    );
    // The campaign can't be told, or the artifact is another one: not verified.
    expect(await checkFogSafety({ dir: copy, config, layout: "store", campaign: "main" })).toBe(17);
    delete atlas.campaign;
    fs.writeFileSync(file, JSON.stringify(atlas));
    expect(await checkFogSafety({ dir: copy, config, layout: "store" })).toBe(17);
    vi.restoreAllMocks();
    fs.rmSync(path.dirname(copy), { recursive: true });
  });

  it("every registry scan passes on both campaigns' outputs", async () => {
    // The built site is the store under `atlas/` beside the app (R-18 builds it).
    for (const c of Object.keys(CAMPAIGNS)) {
      const site = path.join(root, "dist-campaigns", c);
      fs.cpSync(storeOf(root, c), path.join(site, "atlas"), { recursive: true });
      fs.writeFileSync(path.join(site, "index.html"), "<!doctype html><title>Atlas</title>");
    }
    const ctx = {
      root,
      configPath: path.join(root, "atlas.config.json"),
      contentDir: path.join(root, "content-next"),
    };
    const tasks = scanTasks(ctx).filter((t) => t.campaign !== "(legacy)");
    const campaigns = new Set(tasks.map((t) => t.campaign));
    expect(campaigns).toEqual(new Set(["main", "sandbox", undefined]));
    silence();
    const results: [string, number][] = [];
    for (const t of tasks) results.push([t.label, await t.run()]);
    vi.restoreAllMocks();
    expect(results.filter(([, code]) => code !== 0)).toEqual([]);
    expect(results.length).toBeGreaterThan(20);
  });
});

describe("R-17: a note body linking an item hidden in the campaign", () => {
  /** haskel-thimbleby ships in both campaigns; its body links three items. */
  function linkingWorld(): string {
    const root = testWorld();
    edit(
      root,
      "quessaly/npcs/haskel-thimbleby.md",
      "walks the eastern dikes of Oskmark.",
      "walks the eastern dikes of Oskmark, from [[Brindlecross]] to [[Hookhaven]], with [[Marra Quillon]].",
    );
    return root;
  }

  it("sandbox, non-strict: the hidden map names and ids are absent; the link is redacted", async () => {
    const root = linkingWorld();
    silence();
    const r = await runBuild({ player: true, strict: false, campaign: "sandbox" }, root);
    vi.restoreAllMocks();
    expect(r, r.error).toMatchObject({ ok: true });
    const store = storeOf(root, "sandbox");
    expect(wordsIn(store, ["Brindlecross", "brindlecross", "Hookhaven", "hookhaven"])).toEqual([]);
    // Marra Quillon ships in sandbox: her link stays.
    expect(wordsIn(store, ["Marra Quillon"])).toEqual(["Marra Quillon"]);
    const atlas = JSON.parse(fs.readFileSync(path.join(store, "atlas.json"), "utf8"));
    const haskel = atlas.entities.find((e: { id: string }) => e.id === "haskel-thimbleby");
    expect(haskel.body).toContain("…");
  });

  it("main, non-strict: the hidden note is absent; the shown maps stay", async () => {
    const root = linkingWorld();
    silence();
    const r = await runBuild({ player: true, strict: false, campaign: "main" }, root);
    vi.restoreAllMocks();
    expect(r, r.error).toMatchObject({ ok: true });
    const store = storeOf(root, "main");
    expect(wordsIn(store, ["Marra Quillon", "marra-quillon"])).toEqual([]);
    expect(wordsIn(store, ["Brindlecross", "Hookhaven"])).toEqual(["Brindlecross", "Hookhaven"]);
  });

  it("strict: the build fails (cross-ref leak, exit 8) and writes nothing for any campaign", async () => {
    const root = linkingWorld();
    silence();
    const r = await runBuild({ player: true, strict: true }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: false, exitCode: 8 });
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });
});

describe("R-17: which campaigns a run builds", () => {
  it("--campaign builds that one only", async () => {
    const root = testWorld();
    silence();
    const r = await runBuild({ player: true, strict: true, campaign: "sandbox" }, root);
    vi.restoreAllMocks();
    expect(r, r.error).toMatchObject({ ok: true });
    expect(fs.readdirSync(path.join(root, ".atlas-campaigns")).sort()).toEqual([
      STORES_ROOT_MARKER,
      "sandbox",
    ]);
  });

  it("--out is the root of the stores", async () => {
    const root = testWorld();
    silence();
    const r = await runBuild({ player: true, strict: true, outDir: "elsewhere" }, root);
    vi.restoreAllMocks();
    expect(r, r.error).toMatchObject({ ok: true });
    for (const c of Object.keys(CAMPAIGNS)) {
      expect(fs.existsSync(path.join(root, "elsewhere", c, "atlas", "atlas.json")), c).toBe(true);
      expect(fs.existsSync(path.join(root, "elsewhere", c, "must-not-ship.json")), c).toBe(true);
    }
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });

  it("refuses a store inside public/", async () => {
    const root = testWorld();
    silence();
    const r = await runBuild({ player: true, strict: true, outDir: "public/atlas" }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(r.error).toMatch(/inside .*public/);
  });

  it("a map image outside its world's _atlas folder fails the build", async () => {
    const root = testWorld();
    edit(
      root,
      "quessaly/_atlas/world.yaml",
      "src: images/tallowford.png",
      "src: ../../skerrow/_atlas/images/hookhaven.png",
    );
    silence();
    const r = await runBuild({ player: true, strict: true, campaign: "main" }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });
});

describe("R-17: shipped text naming what the campaign hides fails the build (exit 12)", () => {
  // marra-quillon ships in sandbox; each case adds one plain-text leak to it.
  const NOTE = "quessaly/npcs/marra-quillon.md";
  const cases: [string, (t: string) => string][] = [
    ["a hidden map in the body", (t) => t + "\nShe once sailed to Hookhaven.\n"],
    ["a hidden world in a heading", (t) => t + "\n## The Skerrow Isles\n\ntext\n"],
    [
      "a hidden map in summary",
      (t) =>
        t.replace("  visibility: player", "  visibility: player\n  summary: Rumours of Hookhaven"),
    ],
    [
      "a hidden id in tags",
      (t) => t.replace("  visibility: player", "  visibility: player\n  tags: [hookhaven]"),
    ],
    ["a hidden region's id", (t) => t + "\nNear gannet-rock.\n"],
    ["the other campaign's name", (t) => t + "\nUnlike the Lantern Road crew.\n"],
  ];
  it.each(cases)("%s: strict and not, nothing written", async (_label, change) => {
    const root = testWorld();
    const file = content(root, NOTE);
    const before = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, change(before));
    expect(fs.readFileSync(file, "utf8")).not.toBe(before);
    silence();
    const strict = await runBuild({ player: true, strict: true, campaign: "sandbox" }, root);
    const loose = await runBuild({ player: true, strict: false }, root);
    vi.restoreAllMocks();
    expect(strict).toMatchObject({ ok: false, exitCode: 12 });
    expect(loose).toMatchObject({ ok: false, exitCode: 12 });
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });
});

describe("R-17: a local file URL in a v2 note fails closed", () => {
  it.each([
    ["markdown image", "\n![x](images/oskmark.png)\n"],
    ["HTML image", '\n<img src="images/oskmark.png">\n'],
    ["HTML image, unquoted", "\n<img src=images/oskmark.png>\n"],
    ["reference-style image", "\n![x][r]\n\n[r]: images/oskmark.png\n"],
    ["unused reference definition", "\ntext\n\n[r]: images/oskmark.png\n"],
    [
      "picture source srcset",
      '\n<picture><source srcset="a.webp 1x, images/oskmark.png 2x"></picture>\n',
    ],
    ["HTML link", '\n<a href="images/oskmark.png">map</a>\n'],
    ["markdown link to a file", "\n[map](images/oskmark.png)\n"],
    ["markdown link to a hidden id", "\nSee [the harbour](hookhaven).\n"],
    ["HTML image, attribute after a slash", '\n<img/src="images/oskmark.png">\n'],
    ["meta refresh", '\n<meta http-equiv="refresh" content="0;url=images/oskmark.png">\n'],
  ])("%s: exit 1, nothing written", async (_label, add) => {
    const root = testWorld();
    const file = content(root, "quessaly/npcs/marra-quillon.md");
    fs.appendFileSync(file, add);
    silence();
    const r = await runBuild({ player: true, strict: false, campaign: "sandbox" }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });
});

describe("R-17: what a v2 note may link to", () => {
  it("the web, mail, a fragment and wikilinks build; another campaign's id as a word is fine", async () => {
    const root = testWorld();
    fs.appendFileSync(
      content(root, "quessaly/npcs/marra-quillon.md"),
      "\n[site](https://example.com/a.png) [mail](mailto:a@b.c) [top](#top)\n" +
        "She works the main road.\n",
    );
    silence();
    const r = await runBuild({ player: true, strict: true, campaign: "sandbox" }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: true, exitCode: 0 });
  });
});

describe("R-17: stores are replaced whole", () => {
  it("a rebuild leaves no file of the last one; a full build drops a removed campaign's dir", async () => {
    const root = testWorld();
    silence();
    expect(await runBuild({ player: true, strict: true }, root)).toMatchObject({ ok: true });
    const stores = path.join(root, ".atlas-campaigns");
    fs.writeFileSync(path.join(storeOf(root, "main"), "stale-old.json"), '{"x":"Mirefold"}');
    fs.mkdirSync(path.join(storeOf(root, "main"), "fog"));
    fs.writeFileSync(path.join(storeOf(root, "main"), "fog", "old.png"), "x");
    fs.mkdirSync(path.join(stores, "gone", "atlas"), { recursive: true });
    fs.writeFileSync(path.join(stores, "gone", "atlas", "atlas.json"), "{}");

    // --campaign: that store is replaced whole; other dirs are left alone.
    expect(await runBuild({ player: true, strict: true, campaign: "main" }, root)).toMatchObject({
      ok: true,
    });
    expect(fs.existsSync(path.join(storeOf(root, "main"), "stale-old.json"))).toBe(false);
    expect(fs.existsSync(path.join(storeOf(root, "main"), "fog"))).toBe(false);
    expect(fs.existsSync(path.join(stores, "gone"))).toBe(true);

    // Every campaign: anything else in the stores root goes.
    expect(await runBuild({ player: true, strict: true }, root)).toMatchObject({ ok: true });
    vi.restoreAllMocks();
    expect(fs.readdirSync(stores).sort()).toEqual([STORES_ROOT_MARKER, "main", "sandbox"]);
  });
});

describe("R-17: pruning leaves what isn't a store", () => {
  it("a marked folder keeps its other files, with a warning", async () => {
    const root = testWorld();
    const out = path.join(root, "notes");
    fs.mkdirSync(path.join(out, "sub"), { recursive: true });
    fs.writeFileSync(path.join(out, STORES_ROOT_MARKER), "");
    fs.writeFileSync(path.join(out, "keep.txt"), "x");
    fs.writeFileSync(path.join(out, "sub", "keep.md"), "x");
    fs.mkdirSync(path.join(out, "gone", "atlas"), { recursive: true });
    fs.writeFileSync(path.join(out, "gone", "atlas", "atlas.json"), "{}");
    silence();
    const r = await runBuild({ player: true, strict: true, outDir: "notes" }, root);
    const warned = vi.mocked(console.warn).mock.calls.flat().join("\n");
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: true });
    expect(fs.readdirSync(out).sort()).toEqual(
      [STORES_ROOT_MARKER, "keep.txt", "main", "sandbox", "sub"].sort(),
    );
    expect(fs.existsSync(path.join(out, "sub", "keep.md"))).toBe(true);
    expect(warned).toMatch(/keep\.txt.*isn't a campaign store/);
  });

  it("a campaign's folder that isn't a store is refused, nothing written", async () => {
    const root = testWorld();
    const out = path.join(root, "notes");
    fs.mkdirSync(path.join(out, "main"), { recursive: true });
    fs.writeFileSync(path.join(out, STORES_ROOT_MARKER), "");
    fs.writeFileSync(path.join(out, "main", "keep.txt"), "x");
    silence();
    const r = await runBuild({ player: true, strict: true, outDir: "notes" }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: false, exitCode: 1 });
    expect(fs.readdirSync(out).sort()).toEqual([STORES_ROOT_MARKER, "main"].sort());
    expect(fs.readdirSync(path.join(out, "main"))).toEqual(["keep.txt"]);
  });
});

describe("R-17: where the stores root may be", () => {
  async function refused(root: string, outDir: string) {
    silence();
    const r = await runBuild({ player: true, strict: true, outDir }, root);
    vi.restoreAllMocks();
    expect(r, outDir).toMatchObject({ ok: false, exitCode: 1 });
    expect(r.error).toMatch(/refusing to write campaign stores/);
  }

  it("not public/ through a symlink", async () => {
    const root = testWorld();
    fs.mkdirSync(path.join(root, "public"));
    fs.symlinkSync(path.join(root, "public"), path.join(root, "pub-link"));
    await refused(root, "pub-link");
    await refused(root, "pub-link/x");
    expect(fs.readdirSync(path.join(root, "public"))).toEqual([]);
  });

  it.runIf(process.platform === "darwin" || process.platform === "win32")(
    "not public/ in another letter case (case-insensitive disk)",
    async () => {
      const root = testWorld();
      fs.mkdirSync(path.join(root, "public"));
      await refused(root, "PUBLIC");
      await refused(root, "Public/x");
      expect(fs.readdirSync(path.join(root, "public"))).toEqual([]);
    },
  );

  it("not the repo root, a source folder, or a folder of other files", async () => {
    const root = testWorld();
    fs.mkdirSync(path.join(root, "src", "atlas", "assets"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "atlas", "assets", "keep.ts"), "");
    fs.mkdirSync(path.join(root, "other"));
    fs.writeFileSync(path.join(root, "other", "keep.txt"), "");
    await refused(root, ".");
    await refused(root, "src");
    await refused(root, "content-next/out");
    await refused(root, "other");
    expect(fs.existsSync(path.join(root, "src", "atlas", "assets", "keep.ts"))).toBe(true);
    expect(fs.readdirSync(path.join(root, "other"))).toEqual(["keep.txt"]);
  });
});

describe("R-17: a hidden path after any non-path character fails the build (exit 12)", () => {
  // main hides mirefold; its image is renamed so no id or name matches it,
  // leaving only the path match to catch it.
  it.each([
    ["an autolink", "\nSee <images/zq-vault-art.png>.\n"],
    ["after a colon", "\nart:images/zq-vault-art.png\n"],
    ["between tags", "\n<span>images/zq-vault-art.png</span>\n"],
    ["after a comma", "\nsee a,images/zq-vault-art.png\n"],
    ["after a bracket", "\nsee [images/zq-vault-art.png]\n"],
  ])("%s", async (_label, add) => {
    const root = testWorld();
    const wy = content(root, "quessaly/_atlas/world.yaml");
    const yaml = fs.readFileSync(wy, "utf8");
    expect(yaml).toContain("src: images/mirefold.png");
    fs.writeFileSync(wy, yaml.replace("src: images/mirefold.png", "src: images/zq-vault-art.png"));
    const img = content(root, "quessaly/_atlas/images/mirefold.png");
    fs.renameSync(img, path.join(path.dirname(img), "zq-vault-art.png"));
    fs.appendFileSync(content(root, "quessaly/places/pellam-ferry.md"), add);
    silence();
    const r = await runBuild({ player: true, strict: true, campaign: "main" }, root);
    vi.restoreAllMocks();
    expect(r).toMatchObject({ ok: false, exitCode: 12 });
    expect(fs.existsSync(path.join(root, ".atlas-campaigns"))).toBe(false);
  });
});
