// @vitest-environment node
/**
 * R-11b review fixes: in player builds, link redaction and warning scrubbing
 * follow the resolver, and the shipped report names nothing it dropped.
 *
 * - A note the resolver refuses (though its frontmatter would ship) is a
 *   secret link target: its name is redacted from other notes' bodies and
 *   scrubbed from the shipped report. In v1 only a duplicate id makes the
 *   resolver refuse a note frontmatter allows, so the test wraps the resolution
 *   to refuse one id.
 * - A region the resolver drops for linking a DM note isn't named in the
 *   shipped report.
 * - A redacted link's warning (which can carry a #heading or folder text that
 *   name scrubbing misses) stays out of the shipped player report; the console
 *   report keeps it. (DM builds don't redact links, so there is no such warning.)
 *
 * Fixture vaults are temp roots; buildAtlas only plans writes and
 * writeBuildOutput isn't called.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAtlas } from "../../../scripts/build-atlas";

const refused = new Set<string>();
vi.mock("../../../scripts/atlas/playerResolution", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../scripts/atlas/playerResolution")>();
  return {
    ...real,
    playerResolution: (...args: Parameters<typeof real.playerResolution>) => {
      const r = real.playerResolution(...args);
      return { ...r, noteShips: (id: string) => !refused.has(id) && r.noteShips(id) };
    },
  };
});

const tmps: string[] = [];
afterEach(() => {
  refused.clear();
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

function vault(worldYaml: Record<string, unknown>, notes: Record<string, string>): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-resolver-redact-"));
  tmps.push(tmp);
  const put = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  put(
    "atlas.config.json",
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  put("content/w/_atlas/world.yaml", yaml.dump(worldYaml));
  for (const [rel, body] of Object.entries(notes)) put(`content/w/${rel}`, body);
  return tmp;
}

const note = (title: string, visibility: string, body = "body") =>
  `---\ntitle: ${title}\natlas:\n  type: settlement\n  visibility: ${visibility}\n---\n${body}\n`;

const WORLD = { maps: [{ id: "m1", name: "Map One", width: 1000, height: 1000, layers: [] }] };

describe("player build: redaction follows the resolver", () => {
  it("a note the resolver drops is redacted as link text and scrubbed from the report", async () => {
    refused.add("ghost-tower");
    const root = vault(WORLD, {
      "harbor.md": note("Harbor", "player", "Boats sail to [[Ghost Tower]] at night."),
      "ghost-tower.md": note("Ghost Tower", "player"),
    });
    const { project, report } = await buildAtlas(root, { player: true, strict: false });
    expect(project.entities.map((e) => e.id)).toEqual(["harbor"]);
    const shipped = JSON.stringify(project);
    expect(shipped).not.toContain("Ghost Tower");
    expect(shipped).not.toContain("ghost-tower");
    // The console report still says what happened.
    expect(report.warnings.some((w) => w.includes("ghost-tower"))).toBe(true);
    // Strict player builds fail on the cross-reference leak (exit 8).
    const strict = await buildAtlas(root, { player: true, strict: true });
    expect(strict.report.failure?.exitCode).toBe(8);
  });

  it("without the refusal the same link ships (control)", async () => {
    const root = vault(WORLD, {
      "harbor.md": note("Harbor", "player", "Boats sail to [[Ghost Tower]] at night."),
      "ghost-tower.md": note("Ghost Tower", "player"),
    });
    const { project } = await buildAtlas(root, { player: true, strict: true });
    expect(JSON.stringify(project)).toContain("Ghost Tower");
  });

  it("a region dropped for linking a DM note isn't named in the shipped report", async () => {
    const root = vault(
      {
        ...WORLD,
        regions: [
          {
            id: "cellar-region",
            mapId: "m1",
            name: "Lair",
            entityId: "vampire",
            visibility: "player",
            points: [
              [0, 0],
              [100, 0],
              [100, 100],
            ],
          },
        ],
      },
      { "harbor.md": note("Harbor", "player"), "vampire.md": note("Vampire", "dm") },
    );
    const { project, report } = await buildAtlas(root, { player: true, strict: false });
    expect(report.warnings.some((w) => w.includes('region "cellar-region"'))).toBe(true);
    expect(JSON.stringify(project)).not.toContain("cellar-region");
  });

  it("a redacted link's warning (heading and folder text) stays out of the player report", async () => {
    const notes = {
      "harbor.md": note(
        "Harbor",
        "player",
        "See [[npcs/Khal Azum#Hidden Crypt Plans|the stranger]].",
      ),
      "npcs/khal-azum.md": note("Khal Azum", "dm"),
    };
    const player = await buildAtlas(vault(WORLD, notes), { player: true, strict: false });
    expect(player.report.warnings.some((w) => w.includes("Hidden Crypt Plans"))).toBe(true);
    const shipped = JSON.stringify(player.project);
    expect(shipped).not.toContain("Hidden Crypt Plans");
    expect(shipped).not.toContain("npcs/");
  });
});
