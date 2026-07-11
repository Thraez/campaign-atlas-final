import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
