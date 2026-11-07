import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../../../scripts/check-player-secrets";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cps-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeAtlas(entities: unknown, search: unknown = []) {
  fs.writeFileSync(path.join(dir, "atlas.json"), JSON.stringify({ entities, placements: [] }));
  fs.writeFileSync(path.join(dir, "search-index.json"), JSON.stringify(search));
}

describe("check-player-secrets", () => {
  it("passes on clean ciphertext-only secrets", () => {
    writeAtlas([
      {
        id: "a",
        body: "normal text",
        secrets: [
          {
            id: "s",
            lockType: "password",
            teaser: "hint",
            salt: "QUJD",
            iv: "QUJD",
            ciphertext: "QUJDREVG",
          },
        ],
      },
    ]);
    expect(run({ dir })).toBe(0);
  });

  it("fails if a secret has a 'reveal' field", () => {
    writeAtlas([
      {
        id: "b",
        body: "x",
        secrets: [
          {
            id: "s",
            lockType: "password",
            reveal: "plaintext",
            salt: "Q",
            iv: "Q",
            ciphertext: "Q",
          },
        ],
      },
    ]);
    expect(run({ dir })).toBe(13);
  });

  it("fails if a secret has a 'password' field", () => {
    writeAtlas([
      {
        id: "c",
        body: "x",
        secrets: [
          { id: "s", lockType: "password", password: "pw", salt: "Q", iv: "Q", ciphertext: "Q" },
        ],
      },
    ]);
    expect(run({ dir })).toBe(13);
  });

  it("fails if entity body contains an unstripped {{secret:}} marker", () => {
    writeAtlas([{ id: "d", body: "He keeps ledgers {{secret:signet}}" }]);
    expect(run({ dir })).toBe(13);
  });

  it("fails if search index excerpt contains an unstripped marker", () => {
    writeAtlas([], [{ id: "e", excerpt: "He keeps ledgers {{secret:signet}}" }]);
    expect(run({ dir })).toBe(13);
  });

  it("returns 0 when the dir does not exist (nothing to check)", () => {
    expect(run({ dir: path.join(dir, "nope") })).toBe(0);
  });
});

describe("check-player-secrets on the built site (dist/atlas/atlas.json)", () => {
  let site: string;
  beforeEach(() => {
    site = fs.mkdtempSync(path.join(os.tmpdir(), "cps-dist-"));
    fs.mkdirSync(path.join(site, "atlas"));
  });
  afterEach(() => {
    fs.rmSync(site, { recursive: true, force: true });
  });

  const writeSite = (name: string, text: string) =>
    fs.writeFileSync(path.join(site, "atlas", name), text);

  it("fails if a secret has a forbidden field", () => {
    writeSite(
      "atlas.json",
      JSON.stringify({ entities: [{ id: "b", secrets: [{ id: "s", reveal: "plaintext" }] }] }),
    );
    expect(run({ dir: site })).toBe(13);
  });

  it("passes on clean ciphertext-only secrets", () => {
    writeSite(
      "atlas.json",
      JSON.stringify({ entities: [{ id: "a", secrets: [{ id: "s", ciphertext: "Q" }] }] }),
    );
    writeSite("search-index.json", "[]");
    expect(run({ dir: site })).toBe(0);
  });

  it("fails when atlas.json is not valid JSON", () => {
    writeSite("atlas.json", "{ not json");
    expect(run({ dir: site })).not.toBe(0);
  });

  it("fails when search-index.json is not valid JSON", () => {
    writeSite("atlas.json", "{}");
    writeSite("search-index.json", "[ not json");
    expect(run({ dir: site })).not.toBe(0);
  });
});

describe("check-player-secrets with the layout given", () => {
  let site: string;
  beforeEach(() => {
    site = fs.mkdtempSync(path.join(os.tmpdir(), "cps-layout-"));
  });
  afterEach(() => {
    fs.rmSync(site, { recursive: true, force: true });
  });

  it("a built site with no atlas/atlas.json fails", () => {
    fs.writeFileSync(path.join(site, "index.html"), "<html>");
    expect(run({ dir: site, layout: "built-site" })).toBe(13);
  });

  it("a built site is not read from <dir>/atlas.json", () => {
    fs.writeFileSync(path.join(site, "atlas.json"), "{}");
    expect(run({ dir: site, layout: "built-site" })).toBe(13);
  });

  it("a store with no atlas.json and nothing else to flag passes", () => {
    expect(run({ dir: site, layout: "store" })).toBe(0);
  });
});

describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "check-player-secrets on unreadable paths",
  () => {
    let site: string;
    let locked: string;
    beforeEach(() => {
      site = fs.mkdtempSync(path.join(os.tmpdir(), "cps-unreadable-"));
      fs.writeFileSync(path.join(site, "atlas.json"), "{}");
    });
    afterEach(() => {
      fs.chmodSync(locked, 0o755);
      fs.rmSync(site, { recursive: true, force: true });
    });

    it("fails on a dir it cannot read", () => {
      locked = path.join(site, "assets");
      fs.mkdirSync(locked);
      fs.writeFileSync(path.join(locked, "page.txt"), "{{secret:x}}");
      fs.chmodSync(locked, 0o000);
      expect(run({ dir: site })).toBe(13);
    });

    it("fails on a text file it cannot read", () => {
      locked = path.join(site, "page.txt");
      fs.writeFileSync(locked, "{{secret:x}}");
      fs.chmodSync(locked, 0o000);
      expect(run({ dir: site })).toBe(13);
    });
  },
);

describe("check-player-secrets on the source store (public/atlas)", () => {
  it("fails when atlas.json is not valid JSON", () => {
    fs.writeFileSync(path.join(dir, "atlas.json"), "{ not json");
    fs.writeFileSync(path.join(dir, "search-index.json"), "[]");
    expect(run({ dir })).not.toBe(0);
  });
});
