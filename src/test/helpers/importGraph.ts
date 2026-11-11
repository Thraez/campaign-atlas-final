/**
 * The runtime import graph of `src/` files, for guard tests: the player import
 * graph (player-import-graph.test.ts) and the shared canvas's import fence
 * (canvas/canvas-imports.test.ts).
 *
 * What the walk skips:
 * - any `import()` in the true branch of an `__INCLUDE_EDITOR__ ? … : …` conditional, in any
 *   file. vite.config.ts defines `__INCLUDE_EDITOR__` as `false` in player builds, so that
 *   branch is dead code.
 * - `import type` / `export type` statements: the compiler erases them.
 * Every other import, static or dynamic, counts.
 *
 * The walk fails closed: an `@/` or relative specifier that resolves to no file fails
 * (it could be hiding an edge), unless it names a known asset (`.css`, images, `?url`, `?raw`).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const SRC = path.resolve(__dirname, "../..");

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const ASSET_SPECIFIER = /(\.(css|svg|png|jpe?g|webp|gif|avif|ico)|\?(url|raw))$/;

type Resolution = { kind: "source"; file: string } | { kind: "asset" } | { kind: "external" };

/** Resolves `@/` and relative specifiers to a source file under src; throws if none matches. */
export function resolveSrcImport(spec: string, from: string): Resolution {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return { kind: "external" };
  if (ASSET_SPECIFIER.test(spec)) return { kind: "asset" };
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = base + ext;
    if (/\.tsx?$/.test(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { kind: "source", file: candidate };
    }
  }
  throw new Error(`unresolved import "${spec}" in ${srcRelative(from)}`);
}

/** True when `node` sits in the true branch of a `__INCLUDE_EDITOR__ ? … : …` conditional. */
export function isEditorGated(node: ts.Node): boolean {
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

/** Module specifiers a source text pulls in at runtime. */
export function runtimeImports(fileName: string, text: string): string[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
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

/** Every src file reachable from `entries`, mapped to the file that first imported it. */
export function importGraph(...entries: string[]): Map<string, string | null> {
  const parents = new Map<string, string | null>(entries.map((e) => [e, null]));
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of runtimeImports(file, fs.readFileSync(file, "utf8"))) {
      const target = resolveSrcImport(spec, file);
      if (target.kind !== "source" || parents.has(target.file)) continue;
      parents.set(target.file, file);
      queue.push(target.file);
    }
  }
  return parents;
}

export const srcRelative = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

export function importChain(file: string, parents: Map<string, string | null>): string {
  const steps: string[] = [];
  for (let f: string | null | undefined = file; f; f = parents.get(f)) {
    steps.unshift(srcRelative(f));
  }
  return steps.join(" -> ");
}
