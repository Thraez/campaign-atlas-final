// @vitest-environment node
/**
 * The editor's player preview and the player build share one projection
 * context builder (code-retro 08 review). The preview reads the DM atlas, so
 * the folder-excluded notes reach it through `buildReport.excludedNotes`;
 * without them a link to a `_dm/` note would show in the preview while the
 * build redacts it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAtlas } from "../../../scripts/build-atlas";
import {
  projectEntityForPlayer,
  buildProjectionContext,
} from "@/atlas/content/projectEntityForPlayer";
import type { AtlasProject } from "@/atlas/content/schema";

let root: string;
let dm: AtlasProject;
let player: AtlasProject;

function write(rel: string, text: string) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-preview-"));
  write(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  write(
    "content/w/_atlas/world.yaml",
    "schemaVersion: 1\nmaps:\n  - id: m1\n    name: M\n    width: 100\n    height: 100\n    layers: []\n",
  );
  write(
    "content/w/notes/town.md",
    "---\ntitle: Town\natlas:\n  visibility: player\n---\n" +
      "Beware [[Khal_Azum]] and [[Hidden Plot]]. {{secret:s1}} Ask [[Mayor]].\n",
  );
  write("content/w/notes/mayor.md", "---\ntitle: Mayor\natlas:\n  visibility: player\n---\nHi.\n");
  write(
    "content/w/notes/khal.md",
    "---\ntitle: Khal Azum\natlas:\n  visibility: dm\n---\nThe villain.\n",
  );
  write("content/w/_dm/plot.md", "---\ntitle: Hidden Plot\n---\nThe twist.\n");
  dm = (await buildAtlas(root, { player: false, strict: false })).project;
  player = (await buildAtlas(root, { player: true, strict: false })).project;
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("player preview matches the player build", () => {
  it("the DM report lists the folder-excluded notes; the player report does not", () => {
    expect(dm.buildReport?.excludedNotes).toEqual([
      { id: expect.any(String), title: "Hidden Plot", aliases: [] },
    ]);
    expect(player.buildReport?.excludedNotes).toBeUndefined();
    expect(JSON.stringify(player)).not.toContain("Hidden Plot");
  });

  it("redacts loose-matched and _dm/ links and strips secret markers, as the build does", () => {
    const entitiesById = new Map(dm.entities.map((e) => [e.id, e]));
    const town = entitiesById.get("town")!;
    const preview = projectEntityForPlayer(
      town,
      buildProjectionContext(entitiesById, dm.buildReport?.excludedNotes),
    );
    for (const text of [preview.body, preview.bodyHtml]) {
      expect(text).not.toContain("Khal");
      expect(text).not.toContain("Hidden Plot");
      expect(text).not.toContain("{{secret:");
      expect(text).toContain("Mayor");
    }
    const built = player.entities.find((e) => e.id === "town")!;
    expect(preview.body).toBe(built.body);
    expect(preview.bodyHtml).toBe(built.bodyHtml);
  });

  it("without the excluded notes the _dm/ link would show (the gap this closes)", () => {
    const entitiesById = new Map(dm.entities.map((e) => [e.id, e]));
    const preview = projectEntityForPlayer(
      entitiesById.get("town")!,
      buildProjectionContext(entitiesById),
    );
    expect(preview.body).toContain("Hidden Plot");
  });
});
