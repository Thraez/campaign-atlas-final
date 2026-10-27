/**
 * Every list of visibility values lives in src/atlas/content/visibility.ts
 * (code-retro 06). A file that writes its own `["player", "rumor"]` can drift
 * from the real set, and the visibility set decides what ships to players.
 *
 * Flags any array or Set literal in src/ or scripts/ (tests aside) holding two
 * or more visibility values. Import ALL_VISIBILITY, VISIBILITY_MENU_ORDER,
 * PLAYER_VISIBLE_VISIBILITY or the helpers from visibility.ts instead.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["src", "scripts"];
const HOME = path.join("src", "atlas", "content", "visibility.ts");
const VALUE = /["'](player|rumor|dm|hidden)["']/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "test" || e.name === "node_modules") continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx|mts|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Bracketed literals holding at least two distinct visibility values and no
 * other strings (an "all" filter option aside). A word list that merely
 * contains "dm" among English words isn't a visibility list.
 */
function visibilityLists(src: string): string[] {
  const hits: string[] = [];
  for (const m of stripComments(src).matchAll(/\[[^[\]]*\]/g)) {
    const strings = [...m[0].matchAll(/["']([^"'\n]*)["']/g)].map((s) => s[1]);
    const values = new Set([...m[0].matchAll(VALUE)].map((v) => v[1]));
    const onlyVisibility = strings.every(
      (s) => s === "all" || /^(player|rumor|dm|hidden)$/.test(s),
    );
    if (values.size >= 2 && onlyVisibility) hits.push(m[0].replace(/\s+/g, " "));
  }
  return hits;
}

describe("visibility lists come only from visibility.ts", () => {
  it("the detector catches the shapes it guards against", () => {
    expect(visibilityLists(`const S = new Set(["player", "rumor"]);`)).toHaveLength(1);
    expect(visibilityLists(`{["all", 'player', 'dm'].map((v) => v)}`)).toHaveLength(1);
    expect(visibilityLists(`type V = "player" | "dm";`)).toHaveLength(0);
    expect(visibilityLists(`// ["player", "dm"]`)).toHaveLength(0);
    expect(visibilityLists(`const GENERIC = ["door", "dm", "hidden"];`)).toHaveLength(0);
  });

  it("no source file outside visibility.ts writes its own list", () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const rel of sourceFiles(dir)) {
        if (rel === HOME) continue;
        for (const hit of visibilityLists(fs.readFileSync(path.join(ROOT, rel), "utf8"))) {
          offenders.push(`${rel}: ${hit}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
