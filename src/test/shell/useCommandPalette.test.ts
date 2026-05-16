// src/test/shell/useCommandPalette.test.ts
import { describe, it, expect } from "vitest";
import { buildPaletteIndex, queryPalette } from "@/atlas/shell/useCommandPalette";

const index = buildPaletteIndex({
  entities: [
    { id: "corven", title: "Corven", type: "npc" },
    { id: "thornhold", title: "Thornhold", type: "settlement" },
  ] as never,
  maps: [{ id: "overview", name: "Overview map" }],
  commands: [
    { id: "cmd.save", title: "Save", run: () => {} },
    { id: "cmd.publish", title: "Publish player site", run: () => {} },
  ],
  settings: [{ id: "set.grid", title: "Grid settings" }],
  recent: ["thornhold"],
});

describe("command palette", () => {
  it("returns recent items first when query is empty", () => {
    const r = queryPalette(index, "");
    expect(r[0].id).toBe("thornhold");
  });

  it("matches across entities, maps, commands, settings", () => {
    expect(queryPalette(index, "corv").some((r) => r.id === "corven")).toBe(true);
    expect(queryPalette(index, "overview").some((r) => r.kind === "map")).toBe(true);
    expect(queryPalette(index, "publish").some((r) => r.kind === "command")).toBe(true);
    expect(queryPalette(index, "grid").some((r) => r.kind === "setting")).toBe(true);
  });

  it("'>' prefix restricts to commands only", () => {
    const r = queryPalette(index, ">pub");
    expect(r.every((x) => x.kind === "command")).toBe(true);
    expect(r.some((x) => x.id === "cmd.publish")).toBe(true);
  });
});
