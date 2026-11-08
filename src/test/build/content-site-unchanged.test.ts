// @vitest-environment node
/**
 * R-11b: moving the player build onto the per-campaign resolver must not change
 * today's site. Builds the player (strict) and DM atlases of `content/` in
 * process (nothing is written) and compares `atlas.json` and
 * `search-index.json` with the committed snapshots, apart from `version` and
 * `publishedAt`. The snapshots were taken with the build as it was before the
 * resolver (main at 3e4daac8).
 *
 * A content edit changes the site on purpose: rerun this file with `-u` and
 * review the snapshot diff before committing it.
 *
 * The same test pins that the resolver reports no rule-8 name collision and no
 * orphan `notes:` entry for `content/` (campaign `main`), so the strict player
 * build's new failures can't block today's publish.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAtlas } from "../../../scripts/build-atlas";
import { loadAtlasModel } from "../../../scripts/atlas/loadAtlasModel";
import { resolveCampaign } from "@/atlas/content/resolveCampaign";

const ROOT = path.resolve(__dirname, "../../..");
const SNAP = path.join(__dirname, "__snapshots__", "content-site");

function stable(v: unknown): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}

describe("today's site is unchanged by the resolver (content/)", () => {
  for (const mode of ["player", "dm"] as const) {
    it(`${mode} atlas.json and search-index.json match the snapshot`, async () => {
      const { project, searchIndex, report } = await buildAtlas(ROOT, {
        player: mode === "player",
        strict: mode === "player",
      });
      expect(report.failure).toBeUndefined();
      const { version: _v, publishedAt: _p, ...atlas } = project;
      await expect(stable(atlas)).toMatchFileSnapshot(path.join(SNAP, `${mode}-atlas.json`));
      await expect(stable(searchIndex)).toMatchFileSnapshot(
        path.join(SNAP, `${mode}-search-index.json`),
      );
    });
  }

  it("the resolver reports no name collision and no orphan entry for campaign main", () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "atlas.config.json"), "utf8")) as {
      contentRoot: string;
      defaultWorld: string;
      include: string[];
      exclude: string[];
    };
    const { model, notes } = loadAtlasModel(path.join(ROOT, cfg.contentRoot), cfg, { root: ROOT });
    const r = resolveCampaign(model, notes, "main");
    expect(r.collisions).toEqual([]);
    expect(r.orphanEntries).toEqual([]);
  });
});
