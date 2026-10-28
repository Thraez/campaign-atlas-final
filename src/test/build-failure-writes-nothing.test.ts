// @vitest-environment node
/**
 * A build that fails a gate writes nothing (code-retro 08 review). An
 * unclosed `%%` fails the build, but before this fix runBuild had already
 * written atlas.json and search-index.json, carrying the text after the
 * stray `%%` — into public/atlas when the save plugin rebuilt.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBuild } from "../../scripts/build-atlas";

let root: string;

function writeVault(body: string) {
  fs.mkdirSync(path.join(root, "content/w/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(root, "content/w/notes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  fs.writeFileSync(
    path.join(root, "content/w/_atlas/world.yaml"),
    "schemaVersion: 1\nmaps:\n  - id: m1\n    name: M\n    width: 100\n    height: 100\n    layers: []\n",
  );
  fs.writeFileSync(
    path.join(root, "content/w/notes/leaky.md"),
    `---\ntitle: Leaky\natlas:\n  visibility: player\n---\n${body}\n`,
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-fail-nowrite-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const out = () => path.join(root, "out");
const quiet = { log: console.log, error: console.error };

describe("a failed build writes nothing", () => {
  it.each([true, false])(
    "player=%s: unclosed %% fails and leaves no atlas files",
    async (player) => {
      writeVault("fine %% UNCLOSEDLEAK");
      console.log = console.error = () => {};
      const r = await runBuild({ player, strict: false, outDir: "out" }, root).finally(() => {
        console.log = quiet.log;
        console.error = quiet.error;
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).not.toBe(0);
      expect(fs.existsSync(path.join(out(), "atlas.json"))).toBe(false);
      expect(fs.existsSync(path.join(out(), "search-index.json"))).toBe(false);
    },
  );

  it("does not overwrite the files a previous good build wrote", async () => {
    writeVault("All public.");
    console.log = console.error = () => {};
    try {
      expect((await runBuild({ player: true, strict: true }, root)).ok).toBe(true);
      const before = {
        atlas: fs.readFileSync(path.join(out(), "atlas.json"), "utf8"),
        search: fs.readFileSync(path.join(out(), "search-index.json"), "utf8"),
      };
      writeVault("fine %% UNCLOSEDLEAK");
      const r = await runBuild({ player: true, strict: true }, root);
      expect(r.ok).toBe(false);
      const atlas = fs.readFileSync(path.join(out(), "atlas.json"), "utf8");
      const search = fs.readFileSync(path.join(out(), "search-index.json"), "utf8");
      expect(atlas).toBe(before.atlas);
      expect(search).toBe(before.search);
      expect(atlas + search).not.toContain("UNCLOSEDLEAK");
    } finally {
      console.log = quiet.log;
      console.error = quiet.error;
    }
  });
});
