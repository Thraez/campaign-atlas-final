/**
 * Vite copies all of public/ into dist/, so a DM portrait saved to
 * public/atlas/assets/images shipped to players even though no player note
 * shows it. The prune keeps only the images the player JSON names.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectImageRefs, readPlayerImageRefs } from "../../scripts/atlas/playerImageRefs";
import { pruneUnreferencedImages } from "../../scripts/vite-plugin-prune-player-files";

/** Prune `dir` against the refs of one player JSON text. */
const pruneFromJson = (dir: string, json: string) =>
  pruneUnreferencedImages(dir, collectImageRefs([json]));

describe("collectImageRefs", () => {
  it("collects whole asset paths, from paths and bare embeds", () => {
    const refs = collectImageRefs([
      '{"src":"/atlas/assets/maps/Map.png","body":"![[Corven.webp]]","title":"Corven"}',
    ]);
    expect([...refs].sort()).toEqual(["assets/images/Corven.webp", "assets/maps/Map.png"]);
  });

  it("reads paths with spaces, quotes and parens in markdown, HTML and CSS", () => {
    const refs = collectImageRefs([
      JSON.stringify({
        a: "Look: ![](/atlas/assets/images/foo(1).png) and more",
        b: 'Look: ![alt](</atlas/assets/images/my pic.png> "title") here',
        c: '<p><img alt="x" src="/atlas/assets/images/your pic.png"></p>',
        d: "<div style=\"background: url('/atlas/assets/images/bg pic.png')\"></div>",
        e: "Look: ![](/atlas/assets/images/o'neil.png)",
        f: "<img src='/atlas/assets/images/a \"b\".png'>",
      }),
    ]);
    expect([...refs]).toEqual(
      expect.arrayContaining([
        'assets/images/a "b".png',
        "assets/images/bg pic.png",
        "assets/images/foo(1).png",
        "assets/images/my pic.png",
        "assets/images/o'neil.png",
        "assets/images/your pic.png",
      ]),
    );
  });

  it("collects atlas paths outside assets/, as values and inside markdown and HTML", () => {
    const refs = collectImageRefs([
      JSON.stringify({
        layers: [{ src: "atlas/maps/overlay.png" }],
        body: 'See ![](/atlas/handouts/letter.png) and <img src="/atlas/plates/a b.webp">',
      }),
    ]);
    expect([...refs]).toEqual(
      expect.arrayContaining(["handouts/letter.png", "maps/overlay.png", "plates/a b.webp"]),
    );
  });

  it("ignores external URLs and paths outside the atlas dir", () => {
    const refs = collectImageRefs([
      '{"a":"https://example.com/atlas/assets/maps/x.png","b":"assets/maps/y.png","c":"/atlas/../secret.png"}',
    ]);
    expect([...refs]).toEqual([]);
  });
});

describe("readPlayerImageRefs", () => {
  it("fails closed on invalid JSON, naming the file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "player-refs-"));
    try {
      fs.writeFileSync(path.join(dir, "atlas.json"), "{not json");
      expect(() => readPlayerImageRefs(dir)).toThrow(/atlas\.json/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pruneUnreferencedImages", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-images-"));
    for (const sub of ["images", "maps", "audio"])
      fs.mkdirSync(path.join(dir, "assets", sub), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "images", "Corven.webp"), "x".repeat(10));
    fs.writeFileSync(path.join(dir, "assets", "images", "shown.webp"), "x");
    fs.writeFileSync(path.join(dir, "assets", "images", ".gitkeep"), "");
    fs.writeFileSync(path.join(dir, "assets", "maps", "world.png"), "x");
    fs.writeFileSync(path.join(dir, "assets", "maps", "dm-only.png"), "x".repeat(5));
    fs.writeFileSync(path.join(dir, "assets", "maps", "world.yaml"), "maps: []");
    fs.writeFileSync(path.join(dir, "assets", "audio", "cave.ogg"), "x");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("removes images the player JSON does not name and keeps the rest", () => {
    const json = '{"body":"![[shown.webp]]","layers":[{"src":"/atlas/assets/maps/world.png"}]}';
    const { removed, bytes } = pruneFromJson(dir, json);

    expect(removed.sort()).toEqual(["assets/images/Corven.webp", "assets/maps/dm-only.png"]);
    expect(bytes).toBe(15);
    expect(fs.readdirSync(path.join(dir, "assets", "images")).sort()).toEqual([
      ".gitkeep",
      "shown.webp",
    ]);
    expect(fs.readdirSync(path.join(dir, "assets", "maps")).sort()).toEqual([
      "world.png",
      "world.yaml",
    ]);
    expect(fs.readdirSync(path.join(dir, "assets", "audio"))).toEqual(["cave.ogg"]);
  });

  it("prunes a DM-only image whose name is a suffix of a shown image's name", () => {
    fs.writeFileSync(path.join(dir, "assets", "images", "shelf.png"), "x");
    fs.writeFileSync(path.join(dir, "assets", "images", "elf.png"), "x");
    const json = '{"body":"![[shelf.png]]"}';
    const { removed } = pruneFromJson(dir, json);

    expect(removed).toContain("assets/images/elf.png");
    expect(removed).not.toContain("assets/images/shelf.png");
  });

  it("prunes a DM-only image that shares its file name with a shown image in another folder", () => {
    fs.writeFileSync(path.join(dir, "assets", "images", "world.png"), "x");
    const json = '{"layers":[{"src":"atlas/assets/maps/world.png"}]}';
    const { removed } = pruneFromJson(dir, json);

    expect(removed).toContain("assets/images/world.png");
    expect(removed).not.toContain("assets/maps/world.png");
  });

  it("keeps images named by every path form the player JSON uses", () => {
    const names = ["a.png", "b.png", "c.png", "old map.png", "new map.png", "d.png"];
    for (const n of names) fs.writeFileSync(path.join(dir, "assets", "maps", n), "x");
    for (const n of ["p.webp", "q r.webp", "Edric.webp"]) {
      fs.writeFileSync(path.join(dir, "assets", "images", n), "x");
    }
    const json = JSON.stringify({
      maps: [
        {
          layers: [
            { src: "atlas/assets/maps/a.png" }, // the build's form: relative to public/
            { src: "/atlas/assets/maps/b.png" },
            { src: "/campaign-atlas/atlas/assets/maps/c.png?v=2#top" }, // base prefix, query, hash
            { src: "atlas/assets/maps/old%20map.png" },
            { src: "atlas/assets/maps/new map.png" },
            { src: "./atlas/assets/maps/d.png" },
          ],
        },
      ],
      entities: [
        {
          body: "Intro ![[Corven.webp|300]] and ![[Edric.webp]]",
          bodyHtml: '<p><img src="/atlas/assets/images/p.webp" alt=""></p>',
          summary: "![](/atlas/assets/images/q%20r.webp)",
        },
      ],
    });
    const { removed } = pruneFromJson(dir, json);

    expect(removed.sort()).toEqual([
      "assets/images/shown.webp",
      "assets/maps/dm-only.png",
      "assets/maps/world.png",
    ]);
  });

  it("prunes DM-only images of every image type the player could show", () => {
    const exts = [".avif", ".bmp", ".tif", ".tiff", ".ico", ".svg"];
    for (const ext of exts)
      fs.writeFileSync(path.join(dir, "assets", "images", `dm-secret${ext}`), "x");
    const { removed } = pruneFromJson(dir, "{}");

    for (const ext of exts) expect(removed).toContain(`assets/images/dm-secret${ext}`);
  });

  it("prunes and keeps images anywhere under the atlas dir, not only assets/", () => {
    fs.mkdirSync(path.join(dir, "maps"));
    fs.writeFileSync(path.join(dir, "maps", "overlay.png"), "x");
    fs.writeFileSync(path.join(dir, "maps", "dm-only.png"), "x");
    fs.writeFileSync(path.join(dir, "stray.webp"), "x");
    const json =
      '{"layers":[{"src":"atlas/maps/overlay.png"},{"src":"atlas/assets/maps/world.png"}]}';
    const { removed } = pruneFromJson(dir, json);

    expect(removed).toEqual(expect.arrayContaining(["maps/dm-only.png", "stray.webp"]));
    expect(removed).not.toContain("maps/overlay.png");
    expect(removed).not.toContain("assets/maps/world.png");
  });

  it("is a no-op when the atlas dir is absent", () => {
    expect(pruneFromJson(path.join(dir, "nope"), "{}")).toEqual({
      removed: [],
      bytes: 0,
    });
  });
});
