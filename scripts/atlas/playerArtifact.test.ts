import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listTextFiles, locatePlayerAtlas, resolveAssetFile } from "./playerArtifact";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "player-artifact-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, text = "{}"): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

describe("locatePlayerAtlas", () => {
  it("finds atlas.json at the top of the source store (public/atlas)", () => {
    const file = write("public/atlas/atlas.json");
    const dir = path.join(root, "public", "atlas");
    expect(locatePlayerAtlas(dir)).toEqual({ atlasDir: dir, atlasJson: file, layout: "store" });
  });

  it("finds atlas.json under atlas/ in the built site (dist)", () => {
    const file = write("dist/atlas/atlas.json");
    const dir = path.join(root, "dist");
    expect(locatePlayerAtlas(dir)).toEqual({
      atlasDir: path.join(dir, "atlas"),
      atlasJson: file,
      layout: "built-site",
    });
  });

  it("looks only where the given layout keeps atlas.json", () => {
    write("dist/atlas.json");
    expect(locatePlayerAtlas(path.join(root, "dist"), "built-site")).toBeNull();
    write("public/atlas/atlas/atlas.json");
    expect(locatePlayerAtlas(path.join(root, "public", "atlas"), "store")).toBeNull();
  });

  it("is null when neither layout has an atlas.json", () => {
    write("dist/index.html", "<html>");
    expect(locatePlayerAtlas(path.join(root, "dist"))).toBeNull();
    expect(locatePlayerAtlas(path.join(root, "missing"))).toBeNull();
  });
});

describe("resolveAssetFile", () => {
  it("resolves a site-root layer src against the atlas dir", () => {
    const atlasDir = path.join(root, "public", "atlas");
    const want = path.join(atlasDir, "assets", "maps", "world.fog.png");
    expect(resolveAssetFile(atlasDir, "atlas/assets/maps/world.fog.png")).toBe(want);
    expect(resolveAssetFile(atlasDir, "/atlas/assets/maps/world.fog.png")).toBe(want);
  });

  it("is null for a value that is not one of our assets", () => {
    expect(resolveAssetFile(root, "https://example.com/x.png")).toBeNull();
    expect(resolveAssetFile(root, "atlas/../../etc/passwd")).toBeNull();
  });
});

describe("listTextFiles", () => {
  it("lists text files at any depth and skips binaries", () => {
    const a = write("site/index.html", "<html>");
    const b = write("site/atlas/atlas.json");
    write("site/atlas/assets/maps/world.png", "png");
    expect(listTextFiles(path.join(root, "site"), "test")).toEqual({
      files: expect.arrayContaining([a, b]),
      unreadable: [],
    });
  });
});
