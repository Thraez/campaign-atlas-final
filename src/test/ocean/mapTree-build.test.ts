// @vitest-environment node
/**
 * R-30: the map tree over the real test world. Builds `content-next/` once
 * (both campaigns' player stores, as campaign-stores.test.ts does) and checks
 * the tree and the guard on each campaign's atlas.json, and R-32's zoom
 * handoff along the tree.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runBuild } from "../../../scripts/build-atlas";
import { parseAtlasProject } from "@/atlas/content/atlasGuard";
import {
  breadcrumb,
  buildMapTree,
  childToParent,
  mapToOcean,
  type MapTree,
  type MapTreeNode,
} from "@/atlas/ocean/mapTree";
import type { Viewport } from "@/atlas/ocean/zoomHandoff";
import { rotatedFixture } from "@/atlas/canvas-harness/rotatedFixture";
import { label, start, zoomBy, zoomUntil } from "../helpers/zoomDriver";
import type { AtlasProject, Point } from "@/atlas/content/schema";

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
    const before = structuredClone(raw);
    projects[c] = parseAtlasProject(raw, file); // each real v2 output loads
    expect(raw, `${c}: the guard changes nothing on real output`).toEqual(before);
    expect(projects[c].ocean, `${c} has an ocean`).toBeDefined();
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

/**
 * R-32: zoom in from the ocean through the tree and back out, in settled
 * quarter-level steps about the centre, as a wheel would. At each handoff the
 * zoom wiggles a quarter level both ways: that must not hand off again.
 */
describe("zoom handoff over content-next (R-32)", () => {
  const VIEWPORTS: Viewport[] = [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ];

  /** A point in `mapId`, carried up to the ocean through every frame. */
  function toOcean(t: MapTree, mapId: string, p: Point): Point {
    let node = t.byId.get(mapId)!;
    let q = p;
    while (node.parentId !== null) {
      q = childToParent(node.map.frame!, node.map, q);
      node = t.byId.get(node.parentId)!;
    }
    return mapToOcean(node.placement!, node.map, q);
  }

  function roundTrip(t: MapTree, deepest: string, ground: Point, vp: Viewport) {
    const oceanPoint = toOcean(t, deepest, ground);
    let s = start({ kind: "ocean" }, { center: oceanPoint, zoom: -4 });
    const wiggle = () => {
      const n = s.handoffs;
      for (const dz of [-0.25, 0.25, 0.25, -0.25, -0.25, 0.25]) s = zoomBy(t, s, dz, vp);
      expect(s.handoffs, `wiggle at ${s.trail.at(-1)}`).toBe(n);
    };
    while (label(s.view) !== deepest) {
      const n = s.handoffs;
      s = zoomUntil(t, s, 0.25, vp, (d) => d.handoffs > n);
      wiggle();
    }
    const deepZoom = s.camera.zoom;
    // Further in: nothing deeper under this point.
    for (let i = 0; i < 8; i++) s = zoomBy(t, s, 0.25, vp);
    expect(label(s.view)).toBe(deepest);
    s = { ...s, camera: { ...s.camera, zoom: deepZoom } };
    while (s.view.kind !== "ocean") {
      const n = s.handoffs;
      s = zoomUntil(t, s, -0.25, vp, (d) => d.handoffs > n);
      wiggle();
    }
    // Same spot: under one screen pixel at the landing zoom.
    const err = Math.hypot(s.camera.center[0] - oceanPoint[0], s.camera.center[1] - oceanPoint[1]);
    expect(err * 2 ** s.camera.zoom).toBeLessThan(1);
    return s;
  }

  const MAIN_PATH = ["ocean", "quessaly-world", "oskmark", "brindlecross"];
  const backOut = (p: string[]) => [...p, ...p.slice(0, -1).reverse()];

  for (const vp of VIEWPORTS) {
    const at = `${vp.width}x${vp.height}`;
    it(`main ${at}: ocean > quessaly-world > oskmark > brindlecross and back`, () => {
      const t = buildMapTree(projects.main);
      const s = roundTrip(t, "brindlecross", [200, 150], vp);
      expect(s.trail).toEqual(backOut(MAIN_PATH));
      expect(s.handoffs).toBe(6);
    });

    it(`main rotated ${at}: the same path through the turned placement and frame`, () => {
      const rotated = rotatedFixture(projects.main);
      const t = buildMapTree(rotated);
      expect(t.byId.get("quessaly-world")!.placement!.rotation).toBe(15);
      expect(t.byId.get("oskmark")!.map.frame!.rotation).toBe(30);
      const s = roundTrip(t, "brindlecross", [200, 150], vp);
      expect(s.trail).toEqual(backOut(MAIN_PATH));
    });

    it(`sandbox ${at}: ocean > quessaly-world > oskmark and back (no brindlecross)`, () => {
      const t = buildMapTree(projects.sandbox);
      expect(t.byId.has("brindlecross")).toBe(false);
      const s = roundTrip(t, "oskmark", [130, 97.5], vp); // where brindlecross is on main
      expect(s.trail).toEqual(backOut(MAIN_PATH.slice(0, 3)));
    });
  }
});
