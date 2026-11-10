// @vitest-environment node
/**
 * R-13: the build picks no world. Non-test files under `scripts/` may say
 * `defaultWorld` or `worlds[0]` (or another way to take the first world)
 * only as often as
 * `scripts/atlas/default-world-allowlist.json` allows, and that list only
 * shrinks: a new hit fails, and so does a listed count above today's hits.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const ALLOWLIST = "scripts/atlas/default-world-allowlist.json";
// A tripwire, not a parser: `defaultWorld`, `worlds[0]` (spaces allowed),
// `worlds.at(0)`, and destructuring the first world (`const [w] = x.worlds`).
const PATTERN =
  /defaultWorld|worlds\s*\[\s*0\s*\]|worlds\s*\.\s*at\s*\(\s*0\s*\)|\[\s*[\w$]+\s*(?:,[^\]=]*)?\]\s*=\s*[\w$.?]*worlds\b/g;

function nonTestFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return nonTestFiles(rel);
    if (rel === ALLOWLIST || /\.test\.[cm]?[jt]sx?$/.test(e.name)) return [];
    return [rel];
  });
}

function hits(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rel of nonTestFiles("scripts")) {
    const n = fs.readFileSync(path.join(ROOT, rel), "utf8").match(PATTERN)?.length ?? 0;
    if (n > 0) out[rel] = n;
  }
  return out;
}

describe("defaultWorld / worlds[0] in scripts/ (R-13)", () => {
  it("the pattern catches the usual ways to take the first world", () => {
    const n = (src: string) => src.match(PATTERN)?.length ?? 0;
    for (const src of [
      "cfg.defaultWorld",
      "model.worlds[0]",
      "worlds[ 0 ]",
      "model.worlds.at(0)",
      "const [w] = model.worlds",
      "const [first, ...rest] = worlds",
    ]) {
      expect(n(src), src).toBe(1);
    }
    expect(n("for (const w of model.worlds)")).toBe(0);
    expect(n("worlds[i]")).toBe(0);
  });

  const allowed = (
    JSON.parse(fs.readFileSync(path.join(ROOT, ALLOWLIST), "utf8")) as {
      files: Record<string, number>;
    }
  ).files;
  const found = hits();

  it("no file has more hits than the allowlist gives it", () => {
    const over = Object.entries(found)
      .filter(([f, n]) => n > (allowed[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} hit(s), allowed ${allowed[f] ?? 0}`);
    expect(over, "pick the world from the model, not the config or the first world").toEqual([]);
  });

  it("the allowlist only shrinks: no listed count above today's hits", () => {
    const stale = Object.entries(allowed)
      .filter(([f, n]) => (found[f] ?? 0) < n)
      .map(([f, n]) => `${f}: allowed ${n}, has ${found[f] ?? 0} — lower or remove it`);
    expect(stale).toEqual([]);
  });
});
