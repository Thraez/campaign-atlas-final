/**
 * code-retro 06 review: a player note's wikilink to a secret note must be
 * redacted however the author spelled the name: spaces, underscores or
 * dashes. The build's cross-reference index folds them together, so the
 * player build redacts `[[Khal Azum]]` and `[[Khal_Azum]]` alike, not only
 * the derived-secrets scan.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBuild } from "../../scripts/build-atlas";

const NOTES: Record<string, string> = {
  // Excluded folder: the build never reads it, so it is a secret target.
  "w/_dm/Khal_Azum.md": "---\natlas:\n  visibility: dm\n---\nThe lich.\n",
  // A dm note with an underscored frontmatter title.
  "w/npcs/vel.md": "---\ntitle: Vel_Thorn\natlas:\n  visibility: dm\n---\nA spy.\n",
  "w/events/rumour.md": [
    "---",
    "title: Market Rumour",
    "atlas:",
    "  visibility: player",
    "---",
    "They say [[Khal Azum]] woke. Others say [[Khal_Azum]], or [[khal-azum|the old one]].",
    "And [[Vel Thorn]] and [[vel-thorn]] were seen.",
    "",
  ].join("\n"),
};

let tmp: string;
let atlasText: string;
let atlas: { entities: { id: string; body: string; links: { target: string }[] }[] };

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xref-variants-"));
  const configPath = path.join(tmp, "atlas.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  fs.mkdirSync(path.join(tmp, "content/w/_atlas"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "content/w/_atlas/world.yaml"),
    "schemaVersion: 1\nmaps:\n  - id: m1\n    name: M\n    width: 100\n    height: 100\n    layers: []\n",
  );
  for (const [rel, raw] of Object.entries(NOTES)) {
    const abs = path.join(tmp, "content", rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, raw);
  }
  const outDir = path.join(tmp, "player-out");
  const result = await runBuild({ player: true, strict: false, configPath, outDir });
  expect(result.error).toBeUndefined();
  atlasText = fs.readFileSync(path.join(outDir, "atlas.json"), "utf8");
  atlas = JSON.parse(atlasText);
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("secret wikilinks are redacted in every spelling", () => {
  it("the player note ships", () => {
    expect(atlas.entities.map((e) => e.id)).toEqual(["market-rumour"]);
  });

  it("no spelling of either secret name survives in the player atlas", () => {
    expect(atlasText).not.toMatch(/khal|azum|vel[ _-]?thorn|the old one/i);
  });

  it("every link was redacted, none left as a broken link with its text", () => {
    const e = atlas.entities[0];
    expect(e.links.map((l) => l.target)).toEqual(["", "", "", "", ""]);
    expect(e.body).not.toContain("[[");
  });
});
