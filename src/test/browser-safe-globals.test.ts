import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards the browser-runtime source tree against Node-only globals.
 *
 * This project has been bitten by the same bug twice:
 *   1. `gray-matter` pulled in `Buffer` and crashed real browsers with
 *      "Buffer is not defined" (see src/atlas/import/frontmatter.ts).
 *   2. `secretCrypto.ts` decoded base64 with `Buffer.from`, which meant every
 *      correct player passphrase silently read as wrong in production — the
 *      ReferenceError was swallowed by decryptSecret's `catch { return null }`.
 *
 * Both survived the unit suite because Vitest runs under Node/jsdom, where
 * these globals exist. Vite does NOT polyfill them for the browser bundle, so
 * runtime tests can never catch this class of bug. A static scan can.
 *
 * If this test fails: the flagged file runs in the browser and must not use a
 * Node global. Use the web-standard equivalent (`atob`/`btoa` for base64,
 * `TextEncoder`/`TextDecoder` for byte lengths, `import.meta.env` for env vars).
 */

// Directories shipped to the browser. `scripts/` is build-time Node and is
// deliberately excluded — Buffer is correct there.
const BROWSER_DIRS = ["src/atlas", "src/components", "src/pages", "src/hooks", "src/lib"];

const NODE_ONLY_GLOBALS = [
  { name: "Buffer", pattern: /\bBuffer\b/, use: "atob/btoa or TextEncoder" },
  { name: "__dirname", pattern: /\b__dirname\b/, use: "import.meta.url" },
  { name: "__filename", pattern: /\b__filename\b/, use: "import.meta.url" },
  { name: "process.env", pattern: /\bprocess\s*\.\s*env\b/, use: "import.meta.env" },
  { name: "require()", pattern: /\brequire\s*\(/, use: "ESM import" },
];

/** Strip line + block comments and string literals so prose can't trip the scan. */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function collectSourceFiles(dir: string): string[] {
  const abs = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(path.join(dir, entry.name)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("browser-safe globals", () => {
  const files = BROWSER_DIRS.flatMap(collectSourceFiles);

  it("finds source files to scan (guards the guard)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(NODE_ONLY_GLOBALS)("no browser-runtime file uses $name", ({ pattern, use }) => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripNonCode(fs.readFileSync(file, "utf8"));
      if (pattern.test(code)) {
        offenders.push(path.relative(process.cwd(), file).replace(/\\/g, "/"));
      }
    }
    expect(offenders, `Node-only global in browser code — use ${use} instead`).toEqual([]);
  });
});
