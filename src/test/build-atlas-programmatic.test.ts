/**
 * A10 programmatic-entry contract. Confirms that `runBuild()` exported
 * from `scripts/build-atlas.ts` returns a structured `BuildResult` (never
 * calling process.exit) and that validation failures surface their CLI
 * exit code via the result rather than killing the host process.
 *
 * The existing `atlas-build.test.ts` covers the CLI surface via spawn;
 * this complements it by exercising the in-process path the dev save
 * plugin uses.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runBuild, BuildError, deriveTitle } from "../../scripts/build-atlas";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let originalCwd: string;
let tmpRoot: string;

function writeMinimalVault(root: string) {
  fs.mkdirSync(path.join(root, "content/test-world/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(root, "content/test-world/notes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: [],
    }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "content/test-world/_atlas/world.yaml"),
    [
      "schemaVersion: 1",
      "maps:",
      "  - id: m1",
      "    name: Test Map",
      "    width: 1000",
      "    height: 1000",
      "    layers: []",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "content/test-world/notes/sample.md"),
    "---\ntype: place\ntitle: Sample\n---\nBody.\n",
    "utf8",
  );
}

beforeAll(() => {
  originalCwd = process.cwd();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-prog-"));
  writeMinimalVault(tmpRoot);
  process.chdir(tmpRoot);
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("scripts/build-atlas runBuild() programmatic entry", () => {
  it("runs to completion on a minimal valid vault and returns ok=true", async () => {
    const result = await runBuild({ player: false, strict: false });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(typeof result.durationMs).toBe("number");
    expect(result.error).toBeUndefined();
  });

  it("does not throw on validation failure — returns ok=false with exitCode + error", async () => {
    // Wrap the world.yaml in a markdown code fence — the build pipeline
    // rejects this explicitly (it's a common Obsidian-copy-paste mistake).
    // Whichever exit code it would have used, the programmatic entry must
    // surface it as a structured result instead of crashing the host process.
    const worldPath = path.join(tmpRoot, "content/test-world/_atlas/world.yaml");
    const goodYaml = fs.readFileSync(worldPath, "utf8");
    fs.writeFileSync(
      worldPath,
      "```yaml\nschemaVersion: 1\nmaps:\n  - id: m1\n    name: T\n    width: 100\n    height: 100\n    layers: []\n```\n",
      "utf8",
    );
    try {
      const result = await runBuild({ player: false, strict: false });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(typeof result.error).toBe("string");
    } finally {
      fs.writeFileSync(worldPath, goodYaml, "utf8");
    }
  });

  it("BuildError carries the same exit code the CLI would have used", () => {
    const err = new BuildError(6, "test message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(6);
    expect(err.message).toBe("test message");
    expect(err.name).toBe("BuildError");
  });
});

describe("deriveTitle", () => {
  it("title-cases a single-word slug when no fmTitle provided", () => {
    expect(deriveTitle("/notes/corven.md")).toBe("Corven");
  });

  it("title-cases each word of a hyphenated slug", () => {
    expect(deriveTitle("/notes/great-hall.md")).toBe("Great Hall");
  });

  it("title-cases each word of an underscore slug", () => {
    expect(deriveTitle("/notes/lost_city.md")).toBe("Lost City");
  });

  it("returns explicit fmTitle trimmed and unchanged (no forced case change)", () => {
    expect(deriveTitle("/notes/corven.md", "  corven the Bold  ")).toBe("corven the Bold");
  });

  it("falls back to slug-derived title when fmTitle is empty string", () => {
    expect(deriveTitle("/notes/edric.md", "")).toBe("Edric");
  });

  it("falls back to slug-derived title when fmTitle is whitespace-only", () => {
    expect(deriveTitle("/notes/edric.md", "   ")).toBe("Edric");
  });
});
