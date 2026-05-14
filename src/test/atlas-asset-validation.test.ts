/**
 * Tests for scripts/atlas/validateAsset.ts
 *
 * Covers the full validation contract:
 *   - relative paths to existing files pass clean
 *   - absolute root paths produce an actionable warning
 *   - missing files produce an error with a public/ suggestion
 *   - unsupported extensions are errors
 *   - oversize files warn
 *   - SVG policy switches between allow/warn/block
 *   - external URLs warn but don't error
 *   - githubPagesBasePath helper handles repo subpaths
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateAsset,
  githubPagesBasePath,
  ASSET_SIZE_BUDGET_BYTES,
} from "../../scripts/atlas/validateAsset";

let tmp: string;
let publicDir: string;

function writeAsset(rel: string, bytes = 16) {
  const abs = path.join(publicDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.alloc(bytes, 0));
  return abs;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asset-validate-"));
  publicDir = path.join(tmp, "public");
  fs.mkdirSync(publicDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("validateAsset — happy path", () => {
  it("relative path to an existing file produces no findings", () => {
    writeAsset("atlas/assets/maps/main.jpg");
    const out = validateAsset("atlas/assets/maps/main.jpg", "map m1 layer base", { publicDir });
    expect(out).toEqual([]);
  });
});

describe("validateAsset — path safety", () => {
  it("warns on absolute root paths and suggests the relative form", () => {
    writeAsset("atlas/assets/maps/main.jpg");
    const out = validateAsset("/atlas/assets/maps/main.jpg", "map m1 layer base", { publicDir });
    const abs = out.find((f) => f.category === "absolute-path");
    expect(abs).toBeDefined();
    expect(abs!.severity).toBe("warning");
    expect(abs!.suggestion).toContain("atlas/assets/maps/main.jpg");
    expect(abs!.owner).toBe("map m1 layer base");
  });
});

describe("validateAsset — existence", () => {
  it("errors on a missing local file with a public/ suggestion", () => {
    const out = validateAsset("atlas/assets/maps/missing.jpg", "map m1 layer base", { publicDir });
    const miss = out.find((f) => f.category === "missing");
    expect(miss).toBeDefined();
    expect(miss!.severity).toBe("error");
    expect(miss!.suggestion).toContain("public/atlas/assets/maps/missing.jpg");
  });
});

describe("validateAsset — extensions", () => {
  it("errors on an unsupported extension", () => {
    writeAsset("atlas/assets/maps/main.bmp");
    const out = validateAsset("atlas/assets/maps/main.bmp", "map m1 layer base", { publicDir });
    const ext = out.find((f) => f.category === "bad-extension");
    expect(ext).toBeDefined();
    expect(ext!.severity).toBe("error");
    expect(ext!.message).toContain(".bmp");
  });

  it("errors when there is no extension", () => {
    writeAsset("atlas/assets/maps/main");
    const out = validateAsset("atlas/assets/maps/main", "owner", { publicDir });
    expect(out.some((f) => f.category === "bad-extension" && f.severity === "error")).toBe(true);
  });
});

describe("validateAsset — SVG policy", () => {
  it("warns on SVG by default", () => {
    writeAsset("atlas/assets/icons/x.svg");
    const out = validateAsset("atlas/assets/icons/x.svg", "entity x", { publicDir });
    const svg = out.find((f) => f.category === "svg-policy");
    expect(svg).toBeDefined();
    expect(svg!.severity).toBe("warning");
  });

  it("blocks SVG when policy is block", () => {
    writeAsset("atlas/assets/icons/x.svg");
    const out = validateAsset("atlas/assets/icons/x.svg", "entity x", {
      publicDir,
      svgPolicy: "block",
    });
    const svg = out.find((f) => f.category === "svg-policy");
    expect(svg!.severity).toBe("error");
  });

  it("allows SVG when policy is allow", () => {
    writeAsset("atlas/assets/icons/x.svg");
    const out = validateAsset("atlas/assets/icons/x.svg", "entity x", {
      publicDir,
      svgPolicy: "allow",
    });
    expect(out.some((f) => f.category === "svg-policy")).toBe(false);
  });
});

describe("validateAsset — size budget", () => {
  it("warns when file exceeds the size budget", () => {
    writeAsset("atlas/assets/maps/big.jpg", 64);
    const out = validateAsset("atlas/assets/maps/big.jpg", "map m1 layer base", {
      publicDir,
      sizeBudgetBytes: 32,
    });
    const big = out.find((f) => f.category === "oversize");
    expect(big).toBeDefined();
    expect(big!.severity).toBe("warning");
    expect(big!.suggestion).toMatch(/WEBP|ASSET_SIZE_BUDGET_BYTES/);
  });

  it("does not warn for files under the default budget", () => {
    writeAsset("atlas/assets/maps/small.jpg", 1024);
    const out = validateAsset("atlas/assets/maps/small.jpg", "owner", { publicDir });
    expect(out.some((f) => f.category === "oversize")).toBe(false);
    expect(ASSET_SIZE_BUDGET_BYTES).toBeGreaterThan(1024);
  });
});

describe("validateAsset — external URLs", () => {
  it("warns on http(s) URLs", () => {
    const out = validateAsset("https://example.com/x.jpg", "entity x", { publicDir });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("external");
    expect(out[0].severity).toBe("warning");
  });
});

describe("githubPagesBasePath", () => {
  it("returns / for user/org root site", () => {
    expect(githubPagesBasePath(undefined)).toBe("/");
    expect(githubPagesBasePath("")).toBe("/");
  });
  it("wraps a repo subpath in slashes", () => {
    expect(githubPagesBasePath("my-repo")).toBe("/my-repo/");
    expect(githubPagesBasePath("/my-repo/")).toBe("/my-repo/");
  });
});