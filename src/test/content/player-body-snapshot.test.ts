// @vitest-environment node
/**
 * R-11d: the player `body` and `bodyHtml` of every entity in `content/`,
 * recorded before link redaction moved from a regex over the target to the
 * wikilink token spans. The snapshot proves a redaction change touches only
 * the links that were leaking; update it only when such a change is meant.
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { buildAtlas } from "../../../scripts/build-atlas";

describe("player body snapshot of content/", () => {
  it("every entity's player body and bodyHtml match the recorded snapshot", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const { project } = await buildAtlas(repoRoot, { player: true, strict: false });
    expect(project.entities.length).toBeGreaterThan(0);
    const bodies = [...project.entities]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ id: e.id, body: e.body, bodyHtml: e.bodyHtml }));
    await expect(JSON.stringify(bodies, null, 2) + "\n").toMatchFileSnapshot(
      "./__snapshots__/player-body-content.json",
    );
  });
});
