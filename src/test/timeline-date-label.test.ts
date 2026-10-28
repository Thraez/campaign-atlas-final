/**
 * The build ships an entity's display date as `dateLabel` (it was `dateRaw`,
 * a name that hid the fact that it holds the formatted label, not the
 * frontmatter text). A note with a `dateValue` but no date that parses gets
 * a label and a value but no `dateYear`, so the Timeline can file it under
 * "Undated".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runBuild } from "../../scripts/build-atlas";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let originalCwd: string;
let tmpRoot: string;

function note(file: string, lines: string[]) {
  fs.writeFileSync(
    path.join(tmpRoot, "content/test-world/notes", file),
    ["---", ...lines, "---", "Body.", ""].join("\n"),
    "utf8",
  );
}

beforeAll(() => {
  originalCwd = process.cwd();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-date-label-"));
  fs.mkdirSync(path.join(tmpRoot, "content/test-world/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "content/test-world/notes"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmpRoot, "content/test-world/_atlas/world.yaml"),
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
  note("battle.md", ['title: "Battle"', "atlas:", "  visibility: player", '  date: "1247-03-15"']);
  note("flood.md", [
    'title: "Flood"',
    "atlas:",
    "  visibility: player",
    '  date: "Year of the Flood"',
    "  dateValue: 500",
  ]);
  process.chdir(tmpRoot);
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function readOut(file: string) {
  return JSON.parse(fs.readFileSync(path.join(tmpRoot, "out", file), "utf8"));
}

describe("player build: dateLabel", () => {
  it("ships the formatted date as dateLabel, never dateRaw", async () => {
    const r = await runBuild({ player: true, strict: false });
    expect(r.ok).toBe(true);
    const atlas = readOut("atlas.json");
    const battle = atlas.entities.find((e: { id: string }) => e.id === "battle");
    expect(battle.dateLabel).toBe("1247, month 3, day 15");
    expect(battle.dateYear).toBe(1247);
    expect(battle).not.toHaveProperty("dateRaw");

    const index = readOut("search-index.json");
    const entry = index.find((e: { id: string }) => e.id === "battle");
    expect(entry.dateLabel).toBe("1247, month 3, day 15");
    expect(entry).not.toHaveProperty("dateRaw");
  });

  it("an unparsable date with a dateValue gets a label and value but no year", async () => {
    const r = await runBuild({ player: true, strict: false });
    expect(r.ok).toBe(true);
    const flood = readOut("atlas.json").entities.find((e: { id: string }) => e.id === "flood");
    expect(flood.dateLabel).toBe("Year of the Flood");
    expect(flood.dateValue).toBe(500);
    expect(flood).not.toHaveProperty("dateYear");
  });
});
