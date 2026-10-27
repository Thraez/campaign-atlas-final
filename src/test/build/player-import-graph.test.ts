import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Guardrail: no file in an editor-only folder is reachable from the player entry.
 *
 * AGENTS.md: "Never import editor modules from a player entry point." A text match on a few
 * file names misses transitive imports, so this walks the real static import graph from
 * `src/main.tsx` and fails on any reached file under an editor-only folder.
 *
 * The one edge it skips is the editor route in `src/App.tsx`:
 * `__INCLUDE_EDITOR__ ? lazy(() => import("./pages/AtlasPlacementEditor.tsx")) : null`.
 * vite.config.ts defines `__INCLUDE_EDITOR__` as `false` in player builds, so that branch is
 * dead code and the editor chunk never ships. Every other import, static or dynamic, counts.
 * `import type` / `export type` statements are skipped too: the compiler erases them.
 */

const SRC = path.resolve(__dirname, "../..");
const ENTRY = path.join(SRC, "main.tsx");

/**
 * Folders whose files are only used by the DM editor (`/atlas/edit`) and its dev-server endpoints.
 * Each was checked against its contents:
 * - atlas/editor: placement-editor state, draft hooks, toolbars and pickers.
 * - atlas/tabs: the editor's side tabs (entities, fog, regions, routes, soundscape, publish check).
 * - atlas/categories: entity and category edit panels.
 * - atlas/sound-editor: sound-area drawing and soundscape drafts.
 * - atlas/save: save batches and the local file-system writer behind `/__atlas/save`.
 * - atlas/sync: the "Sync from Obsidian" panel.
 * - atlas/import: Obsidian/markdown import, staging and the map import wizard.
 * - atlas/publish: build report, published diff and the publish flow.
 * - pages/AtlasPlacementEditor.tsx: the editor page itself.
 */
const EDITOR_ONLY = [
  "atlas/editor/",
  "atlas/tabs/",
  "atlas/categories/",
  "atlas/sound-editor/",
  "atlas/save/",
  "atlas/sync/",
  "atlas/import/",
  "atlas/publish/",
  "pages/AtlasPlacementEditor.tsx",
];

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Resolves `@/` and relative specifiers to a file under src; bare packages return null. */
function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** True when `node` sits in the true branch of a `__INCLUDE_EDITOR__ ? … : …` conditional. */
function isEditorGated(node: ts.Node): boolean {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (
      ts.isConditionalExpression(parent) &&
      parent.whenTrue === child &&
      ts.isIdentifier(parent.condition) &&
      parent.condition.text === "__INCLUDE_EDITOR__"
    ) {
      return true;
    }
  }
  return false;
}

/** Module specifiers a file pulls in at runtime. */
function runtimeImports(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const specs: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
        specs.push(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specs.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      !isEditorGated(node)
    ) {
      specs.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

/** Every src file reachable from `entry`, mapped to the file that first imported it. */
function playerGraph(entry: string): Map<string, string | null> {
  const parents = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of runtimeImports(file)) {
      const target = resolve(spec, file);
      if (!target || parents.has(target) || !/\.tsx?$/.test(target)) continue;
      parents.set(target, file);
      queue.push(target);
    }
  }
  return parents;
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

function chain(file: string, parents: Map<string, string | null>): string {
  const steps: string[] = [];
  for (let f: string | null | undefined = file; f; f = parents.get(f)) steps.unshift(rel(f));
  return steps.join(" -> ");
}

describe("player import graph", () => {
  const graph = playerGraph(ENTRY);

  it("walks a real graph from src/main.tsx", () => {
    // Sanity: the walker resolves `@/` and relative imports, and follows lazy routes.
    expect(graph.has(path.join(SRC, "App.tsx"))).toBe(true);
    expect(graph.has(path.join(SRC, "pages", "AtlasViewer.tsx"))).toBe(true);
    expect(graph.size).toBeGreaterThan(50);
  });

  it("skips the __INCLUDE_EDITOR__-gated editor route", () => {
    expect(graph.has(path.join(SRC, "pages", "AtlasPlacementEditor.tsx"))).toBe(false);
  });

  it("reaches no file in an editor-only folder", () => {
    const leaks = [...graph.keys()]
      .filter((file) => EDITOR_ONLY.some((prefix) => rel(file).startsWith(prefix)))
      .map((file) => chain(file, graph));
    expect(leaks).toEqual([]);
  });
});
