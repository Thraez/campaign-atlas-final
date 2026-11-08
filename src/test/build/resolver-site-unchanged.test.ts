// @vitest-environment node
/**
 * R-11b: moving the player build onto the per-campaign resolver changes the
 * site only where the ticket says so. A frozen fixture vault
 * (`src/test/fixtures/atlas-resolver-site/`: fog with a partial reveal,
 * regions, routes with entity waypoints, ride-on and sound-only sound areas,
 * a rumor note, a password-secretId pin) is built in process, player and DM,
 * and `atlas.json` and `search-index.json` are compared with the committed
 * snapshots, apart from `version`, `publishedAt` and the secrets' random
 * salt, iv and ciphertext. buildAtlas only plans writes; nothing is written.
 *
 * The snapshots are the build before the resolver (3e4daac8) with exactly
 * these differences, each a declared change:
 * - player: the Vault Keeper's `secretId` pin is dropped (R-12 loads such a
 *   pin as dm);
 * - player: the sound-only area half under fog (`fog-wind`) is dropped
 *   (arch-02), as are the two invalid sound areas (no id; two points); the
 *   remaining areas renumber;
 * - player and DM: Harbor Road's `{ entityId: harbor }` waypoint takes
 *   Harbor's first pin on the map (100,100), not its last (220,220);
 * - player: the redacted-link warning about the rumor's link to the DM note
 *   is no longer in the shipped report (review fix; the console keeps it).
 *
 * Editing the fixture changes the site on purpose: rerun with `-u` and review
 * the snapshot diff before committing it.
 *
 * The last test pins that the resolver reports no rule-8 name collision and no
 * orphan `notes:` entry for the live `content/` (campaign `main`), so the
 * strict player build's new failures can't block today's publish.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAtlas } from "../../../scripts/build-atlas";
import { loadAtlasModel } from "../../../scripts/atlas/loadAtlasModel";
import { resolveCampaign } from "@/atlas/content/resolveCampaign";

const ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(ROOT, "src/test/fixtures/atlas-resolver-site");
const SNAP = path.join(__dirname, "__snapshots__", "resolver-site");

/** Stable JSON; the encrypt pass's random fields are masked. */
function stable(v: unknown): string {
  return `${JSON.stringify(
    v,
    (k, val: unknown) => (k === "salt" || k === "iv" || k === "ciphertext" ? "<random>" : val),
    2,
  )}\n`;
}

describe("the frozen fixture site changes only as declared", () => {
  for (const mode of ["player", "dm"] as const) {
    it(`${mode} atlas.json and search-index.json match the snapshot`, async () => {
      const { project, searchIndex, report } = await buildAtlas(FIXTURE, {
        player: mode === "player",
        strict: false,
      });
      expect(report.failure).toBeUndefined();
      const { version: _v, publishedAt: _p, ...atlas } = project;
      await expect(stable(atlas)).toMatchFileSnapshot(path.join(SNAP, `${mode}-atlas.json`));
      await expect(stable(searchIndex)).toMatchFileSnapshot(
        path.join(SNAP, `${mode}-search-index.json`),
      );
    });
  }
});

describe("live content/", () => {
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
