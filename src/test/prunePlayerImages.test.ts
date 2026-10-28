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
import { pruneUnreferencedImages } from "../../scripts/vite-plugin-prune-player-images";

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

  it("ignores external URLs and paths outside the atlas assets", () => {
    const refs = collectImageRefs([
      '{"a":"https://example.com/atlas/assets/maps/x.png","b":"assets/maps/y.png","c":"/atlas/assets/../secret.png"}',
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
    for (const sub of ["images", "maps", "audio"]) fs.mkdirSync(path.join(dir, sub));
    fs.writeFileSync(path.join(dir, "images", "Corven.webp"), "x".repeat(10));
    fs.writeFileSync(path.join(dir, "images", "shown.webp"), "x");
    fs.writeFileSync(path.join(dir, "images", ".gitkeep"), "");
    fs.writeFileSync(path.join(dir, "maps", "world.png"), "x");
    fs.writeFileSync(path.join(dir, "maps", "dm-only.png"), "x".repeat(5));
    fs.writeFileSync(path.join(dir, "maps", "world.yaml"), "maps: []");
    fs.writeFileSync(path.join(dir, "audio", "cave.ogg"), "x");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("removes images the player JSON does not name and keeps the rest", () => {
    const json = '{"body":"![[shown.webp]]","layers":[{"src":"/atlas/assets/maps/world.png"}]}';
    const { removed, bytes } = pruneFromJson(dir, json);

    expect(removed.sort()).toEqual(["images/Corven.webp", "maps/dm-only.png"]);
    expect(bytes).toBe(15);
    expect(fs.readdirSync(path.join(dir, "images")).sort()).toEqual([".gitkeep", "shown.webp"]);
    expect(fs.readdirSync(path.join(dir, "maps")).sort()).toEqual(["world.png", "world.yaml"]);
    expect(fs.readdirSync(path.join(dir, "audio"))).toEqual(["cave.ogg"]);
  });

  it("prunes a DM-only image whose name is a suffix of a shown image's name", () => {
    fs.writeFileSync(path.join(dir, "images", "shelf.png"), "x");
    fs.writeFileSync(path.join(dir, "images", "elf.png"), "x");
    const json = '{"body":"![[shelf.png]]"}';
    const { removed } = pruneFromJson(dir, json);

    expect(removed).toContain("images/elf.png");
    expect(removed).not.toContain("images/shelf.png");
  });

  it("prunes a DM-only image that shares its file name with a shown image in another folder", () => {
    fs.writeFileSync(path.join(dir, "images", "world.png"), "x");
    const json = '{"layers":[{"src":"atlas/assets/maps/world.png"}]}';
    const { removed } = pruneFromJson(dir, json);

    expect(removed).toContain("images/world.png");
    expect(removed).not.toContain("maps/world.png");
  });

  it("keeps images named by every path form the player JSON uses", () => {
    const names = ["a.png", "b.png", "c.png", "old map.png", "new map.png", "d.png"];
    for (const n of names) fs.writeFileSync(path.join(dir, "maps", n), "x");
    for (const n of ["p.webp", "q r.webp", "Edric.webp"]) {
      fs.writeFileSync(path.join(dir, "images", n), "x");
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

    expect(removed.sort()).toEqual(["images/shown.webp", "maps/dm-only.png", "maps/world.png"]);
  });

  it("prunes DM-only images of every image type the player could show", () => {
    const exts = [".avif", ".bmp", ".tif", ".tiff", ".ico", ".svg"];
    for (const ext of exts) fs.writeFileSync(path.join(dir, "images", `dm-secret${ext}`), "x");
    const { removed } = pruneFromJson(dir, "{}");

    for (const ext of exts) expect(removed).toContain(`images/dm-secret${ext}`);
  });

  it("is a no-op when the assets dir is absent", () => {
    expect(pruneFromJson(path.join(dir, "nope"), "{}")).toEqual({
      removed: [],
      bytes: 0,
    });
  });
});
