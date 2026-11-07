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

describe("check-player-secrets on the source store (public/atlas)", () => {
  it("fails when atlas.json is not valid JSON", () => {
    fs.writeFileSync(path.join(dir, "atlas.json"), "{ not json");
    fs.writeFileSync(path.join(dir, "search-index.json"), "[]");
    expect(run({ dir })).not.toBe(0);
  });
});
