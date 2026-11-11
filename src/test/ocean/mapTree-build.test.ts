// @vitest-environment node
/**
 * R-30: the map tree over the real test world. Builds `content-next/` once
 * (both campaigns' player stores, as campaign-stores.test.ts does) and checks
 * the tree and the guard on each campaign's atlas.json.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runBuild } from "../../../scripts/build-atlas";
import { parseAtlasProject } from "@/atlas/content/atlasGuard";
import { breadcrumb, buildMapTree, type MapTree, type MapTreeNode } from "@/atlas/ocean/mapTree";
import type { AtlasProject } from "@/atlas/content/schema";

const ROOT = path.resolve(__dirname, "../../..");
let root: string;
const projects = {} as Record<"main" | "sandbox", AtlasProject>;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r30-"));
  fs.cpSync(path.join(ROOT, "content-next"), path.join(root, "content-next"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "atlas.next.config.json"), path.join(root, "atlas.config.json"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const r = await runBuild({ player: true, strict: true }, root);
  vi.restoreAllMocks();
  expect(r, r.error).toMatchObject({ ok: true });
  for (const c of ["main", "sandbox"] as const) {
    const file = path.join(root, ".atlas-campaigns", c, "atlas", "atlas.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    expect(raw.schemaVersion).toBe(2);
    projects[c] = parseAtlasProject(raw, file); // each real v2 output loads
  }
}, 120_000);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** "a > b, c" style outline: each node followed by its children in brackets. */
const outline = (nodes: MapTreeNode[]): unknown[] =>
  nodes.map((n) => (n.children.length ? { [n.map.id]: outline(n.children) } : n.map.id));

const crumbs = (t: MapTree, id: string) =>
  breadcrumb(t, id).map((i) => (i.kind === "ocean" ? "ocean" : i.map.id));

describe("map tree over content-next", () => {
  it("main: ocean > quessaly-world > oskmark > brindlecross, tallowford; skerrow-isles > hookhaven", () => {
    const tree = buildMapTree(projects.main);
    expect(tree.ocean).toMatchObject({ width: 3000, height: 2000 });
    expect(outline(tree.roots)).toEqual([
      { "quessaly-world": [{ oskmark: ["brindlecross", "tallowford"] }] },
      { "skerrow-isles": ["hookhaven"] },
    ]);
    expect(tree.byId.has("mirefold")).toBe(false);
    expect(tree.dropped).toEqual([]);
    expect(tree.warnings).toEqual([]);
    expect(crumbs(tree, "tallowford")).toEqual([
      "ocean",
      "quessaly-world",
      "oskmark",
      "tallowford",
    ]);
    expect(tree.roots[0].placement).toMatchObject({ map: "quessaly-world", scale: 2 });
  });

  it("sandbox: quessaly-world > oskmark only", () => {
    const tree = buildMapTree(projects.sandbox);
    expect(outline(tree.roots)).toEqual([{ "quessaly-world": ["oskmark"] }]);
    for (const id of ["skerrow-isles", "tallowford", "brindlecross", "mirefold"]) {
      expect(tree.byId.has(id), id).toBe(false);
    }
    expect(tree.dropped).toEqual([]);
    expect(tree.byId.has("hookhaven")).toBe(false);
  });
});
