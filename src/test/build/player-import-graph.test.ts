import { describe, it, expect } from "vitest";
import path from "node:path";
import { EDITOR_ONLY_PATHS, isEditorOnlyPath } from "@/test/helpers/editorOnlyPaths";
import {
  SRC,
  importChain,
  importGraph,
  resolveSrcImport,
  runtimeImports,
  srcRelative,
} from "@/test/helpers/importGraph";

/**
 * Guardrail: no file in an editor-only path is reachable from the player entry.
 *
 * AGENTS.md: "Never import editor modules from a player entry point." A text match on a few
 * file names misses transitive imports, so this walks the real import graph from `src/main.tsx`
 * and fails on any reached file under `EDITOR_ONLY_PATHS` (see src/test/helpers/editorOnlyPaths.ts
 * for what each path holds, and the known gap of editor hooks in mixed folders).
 *
 * What the walk skips:
 * - any `import()` in the true branch of an `__INCLUDE_EDITOR__ ? … : …` conditional, in any
 *   file. vite.config.ts defines `__INCLUDE_EDITOR__` as `false` in player builds, so that
 *   branch is dead code. Today the only one is the editor route in `src/App.tsx`.
 * - `import type` / `export type` statements: the compiler erases them.
 * Every other import, static or dynamic, counts.
 *
 * The walk fails closed: an `@/` or relative specifier that resolves to no file fails the test
 * (it could be hiding an edge), unless it names a known asset (`.css`, images, `?url`, `?raw`).
 */

const ENTRY = path.join(SRC, "main.tsx");

describe("player import graph", () => {
  const graph = importGraph(ENTRY);

  it("walks a real graph from src/main.tsx", () => {
    // Sanity: the walker resolves `@/` and relative imports, and follows lazy routes.
    expect(graph.has(path.join(SRC, "App.tsx"))).toBe(true);
    expect(graph.has(path.join(SRC, "pages", "AtlasViewer.tsx"))).toBe(true);
    expect(graph.size).toBeGreaterThan(50);
  });

  it("skips the __INCLUDE_EDITOR__-gated editor route", () => {
    expect(graph.has(path.join(SRC, "pages", "AtlasPlacementEditor.tsx"))).toBe(false);
    // R-31: the shared canvas's dev harness (/__canvas) is gated the same way.
    expect(graph.has(path.join(SRC, "atlas", "canvas-harness", "CanvasHarnessPage.tsx"))).toBe(
      false,
    );
    const gated = `const E = __INCLUDE_EDITOR__ ? lazy(() => import("./editor")) : null;`;
    const ungated = `const E = flag ? lazy(() => import("./editor")) : null;`;
    expect(runtimeImports("x.tsx", gated)).toEqual([]);
    expect(runtimeImports("x.tsx", ungated)).toEqual(["./editor"]);
  });

  it("fails closed on an import it cannot resolve, but allows assets", () => {
    expect(() => resolveSrcImport("@/no/such/module", ENTRY)).toThrow(/unresolved import/);
    expect(resolveSrcImport("./index.css", ENTRY)).toEqual({ kind: "asset" });
    expect(resolveSrcImport("@/assets/logo.png?url", ENTRY)).toEqual({ kind: "asset" });
    expect(resolveSrcImport("react", ENTRY)).toEqual({ kind: "external" });
  });

  it("reaches no file in an editor-only path", () => {
    expect(EDITOR_ONLY_PATHS.length).toBeGreaterThan(0);
    const leaks = [...graph.keys()]
      .filter((file) => isEditorOnlyPath(srcRelative(file)))
      .map((file) => importChain(file, graph));
    expect(leaks).toEqual([]);
  });
});
