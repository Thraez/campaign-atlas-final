// @vitest-environment node
/**
 * `v1PinVisibility`: the one v1 pin-visibility rule shared by the build's
 * loader and the old Publish Check. Every branch, then the loader end to end
 * (including its warning for a pin behind a secret lock).
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { v1PinVisibility } from "./pinVisibility";
import { noteIsSecret } from "./visibility";
import { loadAtlasModel } from "../../../scripts/atlas/loadAtlasModel";

describe("v1PinVisibility", () => {
  it.each([
    ["dm", {}],
    ["hidden", {}],
  ] as const)("a %s note's pin loads as dm", (vis, atlas) => {
    expect(v1PinVisibility(noteIsSecret(vis, atlas), vis, undefined)).toBe("dm");
  });

  it("a player note with publish: false loads as dm", () => {
    expect(v1PinVisibility(noteIsSecret("player", { publish: false }), "player", undefined)).toBe(
      "dm",
    );
  });

  it("a placement behind a secret lock loads as dm, even on a player note", () => {
    expect(v1PinVisibility(noteIsSecret("player", {}), "player", "the-twist")).toBe("dm");
  });

  it.each(["player", "rumor"] as const)("otherwise a %s note's pin keeps its visibility", (vis) => {
    expect(v1PinVisibility(noteIsSecret(vis, {}), vis, undefined)).toBe(vis);
  });
});

describe("the build's loader reads v1 pins through it", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
  });

  function note(id: string, atlas: string[]): [string, string] {
    return [`places/${id}.md`, ["---", "atlas:", ...atlas.map((l) => `  ${l}`), "---", ""].join("\n")];
  }

  it("gives each pin the rule's visibility and warns about the locked one", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-pinvis-"));
    temps.push(root);
    const content = path.join(root, "content");
    const world = path.join(content, "w");
    fs.mkdirSync(path.join(world, "_atlas"), { recursive: true });
    fs.mkdirSync(path.join(world, "places"), { recursive: true });
    fs.writeFileSync(
      path.join(world, "_atlas", "world.yaml"),
      "maps:\n  - id: m1\n    name: M\n    width: 100\n    height: 100\n    layers: []\n",
    );
    const at = (x: number, extra = "") =>
      `placements: [{ mapId: m1, x: ${x}, y: 10${extra} }]`;
    const notes = [
      note("boss", ["type: npc", "visibility: dm", at(1)]),
      note("draft", ["type: place", "visibility: player", "publish: false", at(2)]),
      note("vault", ["type: place", "visibility: player", at(3, ", secretId: the-twist")]),
      note("inn", ["type: place", "visibility: rumor", at(4)]),
    ];
    for (const [rel, text] of notes) fs.writeFileSync(path.join(world, rel), text);

    const { model, warnings } = loadAtlasModel(
      content,
      { defaultWorld: "w", include: [], exclude: [] },
      { root },
    );
    const pins = Object.fromEntries(
      (model.worlds[0].maps[0].pins ?? []).map((p) => [p.note, p.visibility]),
    );
    expect(pins).toEqual({ boss: "dm", draft: "dm", vault: "dm", inn: "rumor" });
    const locked = warnings.filter((w) => w.includes("behind secret"));
    expect(locked).toHaveLength(1);
    expect(locked[0]).toContain('"the-twist"');
    expect(locked[0]).toContain("vault.md");
  });
});
