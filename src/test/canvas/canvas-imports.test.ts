/**
 * R-31: the shared canvas imports nothing from `src/pages/`, the editor, or
 * viewer-only modules, so the viewer (R-33) and the editor (phase 4) can both
 * mount it. Walks the real runtime import graph from every file in
 * `src/atlas/canvas/` (see src/test/helpers/importGraph.ts for what counts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isEditorOnlyPath } from "@/test/helpers/editorOnlyPaths";
import { SRC, importChain, importGraph, srcRelative } from "@/test/helpers/importGraph";

const CANVAS = path.join(SRC, "atlas", "canvas");

/** Folders only the viewer uses: its search palette, entity panel and sound. (The harness,
 *  `atlas/canvas-harness/`, is caught as editor-only.) */
const VIEWER_ONLY = ["atlas/search/", "atlas/entity/", "atlas/sound/"];

describe("shared canvas import fence", () => {
  const entries = fs
    .readdirSync(CANVAS)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => path.join(CANVAS, f));
  const graph = importGraph(...entries);

  it("walks the canvas and what it uses", () => {
    expect(entries.map((e) => path.basename(e))).toContain("AtlasCanvas.tsx");
    expect(graph.has(path.join(SRC, "atlas", "map", "flatCRS.ts"))).toBe(true);
    expect(graph.has(path.join(SRC, "atlas", "ocean", "OceanBackground.tsx"))).toBe(true);
  });

  it("reaches no page, editor-only or viewer-only module", () => {
    const bad = [...graph.keys()]
      .map((f) => ({ f, rel: srcRelative(f) }))
      .filter(
        ({ rel }) =>
          rel.startsWith("pages/") ||
          isEditorOnlyPath(rel) ||
          VIEWER_ONLY.some((p) => rel.startsWith(p)),
      )
      .map(({ f }) => importChain(f, graph));
    expect(bad).toEqual([]);
  });
});
