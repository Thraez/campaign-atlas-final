/**
 * Behavior tests for two player-build sanitizations:
 *   1. meta tags ("#npc", "#stub") stripped from entity.tags in player builds
 *      but preserved in DM builds (DM filtering wants them).
 *   2. aliases that duplicate the entity title dropped unconditionally — the
 *      "aka {title}" line otherwise looks like a bug.
 *
 * Exercises the programmatic runBuild() entry — cheap compared to the
 * full atlas-build.test.ts spawn harness.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runBuild } from "../../scripts/build-atlas";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let originalCwd: string;
let tmpRoot: string;

function writeVault(root: string) {
  fs.mkdirSync(path.join(root, "content/test-world/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(root, "content/test-world/notes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: [],
    }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "content/test-world/_atlas/world.yaml"),
    [
      "schemaVersion: 1",
      "maps:",
      "  - id: m1",
      "    name: Test Map",
      "    width: 1000",
      "    height: 1000",
      "    layers: []",
    ].join("\n"),
    "utf8",
  );
  // One NPC file whose flat frontmatter mimics the user's actual vault:
  // - jargon tags ("npc", "stub") alongside real ones ("scholar")
  // - aliases array that includes the title itself ("Foo Bar")
  fs.writeFileSync(
    path.join(root, "content/test-world/notes/foo-bar.md"),
    [
      "---",
      'title: "Foo Bar"',
      'tags: [npc, scholar, stub, FACTION]',
      'aliases: ["Foo", "Foo Bar", "Mr. Foo"]',
      'visibility: player',
      "---",
      "Body.",
      "",
    ].join("\n"),
    "utf8",
  );
}

function readEntity(outDir: string, id: string) {
  const atlas = JSON.parse(fs.readFileSync(path.join(outDir, "atlas.json"), "utf8"));
  return atlas.entities.find((e: { id: string }) => e.id === id);
}

beforeAll(() => {
  originalCwd = process.cwd();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-scrub-"));
  writeVault(tmpRoot);
  process.chdir(tmpRoot);
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// Player builds write to cfg.outputDir; DM builds write to .local-atlas/.
// Mirror that here so the test reads the right artifact for each mode.
const outDirFor = (player: boolean) =>
  player ? path.join(tmpRoot, "out") : path.join(tmpRoot, ".local-atlas");

describe("player builds: meta-tag scrub and alias dedup", () => {
  it("PLAYER build strips meta tags from entity.tags", async () => {
    const r = await runBuild({ player: true, strict: false });
    expect(r.ok).toBe(true);
    const entity = readEntity(outDirFor(true), "foo-bar");
    expect(entity).toBeDefined();
    // "scholar" survives. "npc", "stub", and "FACTION" (case-insensitive) are
    // jargon and should be stripped.
    expect(entity.tags).toEqual(["scholar"]);
  });

  it("DM build preserves meta tags so the editor can filter by them", async () => {
    const r = await runBuild({ player: false, strict: false });
    expect(r.ok).toBe(true);
    const entity = readEntity(outDirFor(false), "foo-bar");
    expect(entity).toBeDefined();
    // DM build keeps the raw set, in original case.
    expect(entity.tags).toEqual(["npc", "scholar", "stub", "FACTION"]);
  });

  it("aliases that duplicate the title are removed unconditionally", async () => {
    // Run both modes — assertion holds in both.
    for (const player of [true, false]) {
      const r = await runBuild({ player, strict: false });
      expect(r.ok).toBe(true);
      const entity = readEntity(outDirFor(player), "foo-bar");
      expect(entity.aliases).toEqual(["Foo", "Mr. Foo"]);
    }
  });
});
