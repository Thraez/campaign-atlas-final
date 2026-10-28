import { describe, it, expect } from "vitest";
import { describeWorldYamlConflict, worldYamlConflictNotice } from "@/atlas/save/worldYamlConflict";

const BEFORE = `# header
name: Astrath
maps:
  - id: overview
    name: Overview
    width: 1000
  - id: caves
    name: Caves
calendar:
  epoch: AS
`;

describe("describeWorldYamlConflict", () => {
  it("lists what changed outside, by map id and key, and nothing as overwritten when the rebuild keeps it", () => {
    const after = BEFORE.replace("name: Caves", "name: Deep Caves").replace(
      "epoch: AS",
      "epoch: AR",
    );
    const rebuilt = after.replace("name: Overview", "name: Renamed Overview");
    expect(describeWorldYamlConflict({ before: BEFORE, after, rebuilt })).toEqual({
      changedOutside: ["calendar.epoch", "maps.caves.name"],
      overwritten: [],
    });
  });

  it("marks an outside edit the rebuild would replace as overwritten", () => {
    const after = BEFORE.replace("name: Overview", "name: Obsidian Name");
    const rebuilt = BEFORE.replace("name: Overview", "name: Renamed Overview");
    expect(describeWorldYamlConflict({ before: BEFORE, after, rebuilt })).toEqual({
      changedOutside: ["maps.overview.name"],
      overwritten: ["maps.overview.name"],
    });
  });

  it("treats added and removed keys and maps as changes, and a missing file as empty", () => {
    const after = `${BEFORE}credits:\n  badges: false\n`.replace(
      "  - id: caves\n    name: Caves\n",
      "",
    );
    expect(
      describeWorldYamlConflict({ before: BEFORE, after, rebuilt: after }).changedOutside,
    ).toEqual(["credits", "maps.caves"]);
    expect(
      describeWorldYamlConflict({ before: BEFORE, after: null, rebuilt: BEFORE }).changedOutside,
    ).toEqual(["(the whole file was deleted)"]);
  });
});

describe("worldYamlConflictNotice", () => {
  it("names the outside changes and says the drafts are kept", () => {
    const n = worldYamlConflictNotice({ changedOutside: ["maps.caves.name"], overwritten: [] });
    expect(n).toMatch(/changed on disk/);
    expect(n).toMatch(/maps\.caves\.name/);
    expect(n).toMatch(/your changes are kept/i);
    expect(n).not.toMatch(/overwrite/i);
  });

  it("warns plainly when Try again would overwrite outside edits", () => {
    const n = worldYamlConflictNotice({
      changedOutside: ["maps.overview.name"],
      overwritten: ["maps.overview.name"],
    });
    expect(n).toMatch(/Try again will overwrite these outside edits: maps\.overview\.name/);
  });

  it("says so when only comments or formatting changed", () => {
    expect(worldYamlConflictNotice({ changedOutside: [], overwritten: [] })).toMatch(
      /only comments or formatting/,
    );
  });
});
