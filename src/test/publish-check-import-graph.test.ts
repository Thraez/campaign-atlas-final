// @vitest-environment node
/**
 * R-11c: the old Publish Check runs in the editor bundle, so its new imports
 * (the v1 adapter and the resolver) must be browser-safe. Walks the static
 * value-import graph from `validateProject.ts` (type-only imports are erased)
 * and fails on any Node built-in.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");
const ENTRY = path.join(SRC, "atlas/yaml/validateProject.ts");
const NODE = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

/** Value imports and re-exports of one file (`import type` / `export type` skipped). */
function specifiers(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  const fromRe = /^\s*(?:import|export)\s+(?!type\s)[^;]*?\bfrom\s+["']([^"']+)["']/gms;
  const bareRe = /^\s*import\s+["']([^"']+)["']/gm;
  const dynRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const re of [fromRe, bareRe, dynRe]) for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  throw new Error(`can't resolve "${spec}" from ${path.relative(SRC, from)}`);
}

function walk(entry: string) {
  const files = new Set<string>();
  const external = new Map<string, string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of specifiers(file)) {
      const local = resolveLocal(file, spec);
      if (local) todo.push(local);
      else external.set(spec, path.relative(SRC, file));
    }
  }
  return { files: [...files].map((f) => path.relative(SRC, f)), external };
}

describe("Publish Check import chain is browser-safe (R-11c)", () => {
  const { files, external } = walk(ENTRY);

  it("reaches the v1 adapter and the resolver", () => {
    expect(files).toContain("atlas/content/v1Model.ts");
    expect(files).toContain("atlas/content/resolveCampaign.ts");
  });

  it("imports no Node built-in and nothing from scripts/", () => {
    const node = [...external].filter(([spec]) => NODE.has(spec));
    expect(node).toEqual([]);
    expect(files.filter((f) => f.startsWith("../"))).toEqual([]);
  });
});
