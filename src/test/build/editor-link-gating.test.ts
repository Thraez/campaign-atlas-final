import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guardrail: every player-reachable source file that hard-codes the `/atlas/edit`
 * URL must gate it behind the `__INCLUDE_EDITOR__` build-time define.
 *
 * Why this exists: `isDmToolsEnabled()` is a *runtime* check. It correctly hides
 * DM affordances from players, but the URL string still ships inside the player
 * bundle — and `/atlas/edit` is an EDITOR_CODE_FINGERPRINT in
 * scripts/check-no-secrets.ts, so `npm run atlas:scan` fails the publish with an
 * EDITOR LEAK. `__INCLUDE_EDITOR__` is replaced with `false` at build time, which
 * lets the minifier drop the whole branch including the literal.
 *
 * Regression: the Timeline's "Name your months" nudge shipped gated on
 * isDmToolsEnabled() alone and leaked `/atlas/edit` into AtlasTimeline's chunk.
 *
 * Editor-only modules are exempt — they are excluded from player builds wholesale.
 */

const SRC = path.resolve(__dirname, "../..");

/** Excluded from player builds entirely, so the literal can never reach one. */
const EDITOR_ONLY = [path.join("atlas", "editor"), path.join("pages", "AtlasPlacementEditor.tsx")];

/** Matches the URL inside a string or template literal. */
const QUOTED_EDITOR_ROUTE = /["'`]\/atlas\/edit/;

/**
 * Comments never reach the bundle — the minifier drops them — and several
 * modules legitimately describe the route in JSDoc, sometimes in `backticks`.
 * Strip comments first so only real code counts. The `[^:]` guard keeps `//`
 * inside a `https://` URL from being mistaken for a line comment.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("player-reachable editor links are build-gated", () => {
  it("gates every hard-coded /atlas/edit URL behind __INCLUDE_EDITOR__", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(SRC, file);
      if (EDITOR_ONLY.some((p) => rel.startsWith(p))) continue;

      const text = fs.readFileSync(file, "utf8");
      if (!QUOTED_EDITOR_ROUTE.test(stripComments(text))) continue;
      if (text.includes("__INCLUDE_EDITOR__")) continue;

      offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  it("actually detects the leak shape it is meant to catch", () => {
    // Guards the guard: prove the matcher fires on a runtime-only gate and
    // stays quiet on a comment, so a passing suite means something.
    const leaky = `const show = isDmToolsEnabled();\n<Link to="/atlas/edit?panel=calendar" />`;
    const lineComment = `// the /atlas/edit route is excluded from player builds`;
    const blockComment = `/**\n * Held in localStorage in \`/atlas/edit\`.\n */`;

    expect(QUOTED_EDITOR_ROUTE.test(stripComments(leaky))).toBe(true);
    expect(leaky.includes("__INCLUDE_EDITOR__")).toBe(false);
    // Prose about the route is not a leak, in either comment style.
    expect(QUOTED_EDITOR_ROUTE.test(stripComments(lineComment))).toBe(false);
    expect(QUOTED_EDITOR_ROUTE.test(stripComments(blockComment))).toBe(false);
    // Stripping must not eat a real URL that merely contains "//".
    expect(stripComments(`const u = "https://example.com";`)).toContain("example.com");
  });
});
