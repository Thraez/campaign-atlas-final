/**
 * Asset auditor tests.
 *
 * Plants tiny fixture trees in a temp dir and asserts the auditor catches the
 * four failure modes:
 *   - small file → no findings
 *   - > 1 MB file → oversize warning
 *   - asset on disk with no content reference → orphan
 *   - content reference to a missing file → broken ref
 *
 * Also exercises the CLI to verify exit code shape (0 vs 13, --strict).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditAssets,
  SIZE_WARN_BYTES,
  SIZE_ERROR_BYTES,
  normalizeRefPath,
  extractMarkdownImageRefs,
  extractFrontmatterImageRefs,
  extractWorldYamlLayerSrcs,
} from "../../scripts/atlas/audit-assets";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.resolve(ROOT, "scripts/atlas/audit-assets.ts");
const IS_WIN = process.platform === "win32";

interface RunResult { status: number; stdout: string; stderr: string; }

function run(args: string[], opts: ExecFileSyncOptions = {}): RunResult {
  try {
    const stdout = execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      ...opts,
    });
    return { status: 0, stdout: String(stdout), stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

let tmp: string;
let publicDir: string;
let assetsDir: string;
let contentDir: string;

function writeAsset(rel: string, bytes = 16) {
  const abs = path.join(publicDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.alloc(bytes, 0));
  return abs;
}

function writeContent(rel: string, contents: string) {
  const abs = path.join(contentDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asset-audit-"));
  publicDir = path.join(tmp, "public");
  assetsDir = path.join(publicDir, "atlas/assets");
  contentDir = path.join(tmp, "content");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(contentDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("auditAssets — clean path", () => {
  it("a small file referenced by content produces no findings", () => {
    writeAsset("atlas/assets/maps/main.jpg", 1024);
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/maps/main.jpg\n---\nbody",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.totals.assetCount).toBe(1);
    expect(report.oversize).toEqual([]);
    expect(report.orphans).toEqual([]);
    expect(report.brokenRefs).toEqual([]);
  });
});

describe("auditAssets — size budget", () => {
  it("warns when a single asset exceeds the 1 MB soft threshold", () => {
    writeAsset("atlas/assets/maps/big.jpg", SIZE_WARN_BYTES + 1024);
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/maps/big.jpg\n---\n",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.oversize).toHaveLength(1);
    expect(report.oversize[0].severity).toBe("warning");
    expect(report.oversize[0].refPath).toBe("atlas/assets/maps/big.jpg");
  });

  it("errors when a single asset exceeds the 4 MB hard threshold", () => {
    writeAsset("atlas/assets/maps/huge.jpg", SIZE_ERROR_BYTES + 1024);
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/maps/huge.jpg\n---\n",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.oversize).toHaveLength(1);
    expect(report.oversize[0].severity).toBe("error");
  });
});

describe("auditAssets — orphans", () => {
  it("flags an asset on disk with no content reference", () => {
    writeAsset("atlas/assets/maps/abandoned.jpg", 512);
    writeContent("world/note.md", "no images here");
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.orphans).toHaveLength(1);
    expect(report.orphans[0].refPath).toBe("atlas/assets/maps/abandoned.jpg");
  });

  it("does not flag an asset that is referenced via a markdown image", () => {
    writeAsset("atlas/assets/portraits/elf.png", 512);
    writeContent(
      "world/note.md",
      "Look at this elf: ![elf](atlas/assets/portraits/elf.png)",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.orphans).toEqual([]);
  });

  it("does not flag an asset that is referenced from world.yaml layers", () => {
    writeAsset("atlas/assets/maps/main.jpg", 512);
    fs.mkdirSync(path.join(contentDir, "world/_atlas"), { recursive: true });
    fs.writeFileSync(
      path.join(contentDir, "world/_atlas/world.yaml"),
      "maps:\n  - id: m\n    layers:\n      - id: base\n        src: atlas/assets/maps/main.jpg\n",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.orphans).toEqual([]);
  });
});

describe("auditAssets — broken references", () => {
  it("reports a content reference that points at a missing file", () => {
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/portraits/missing.png\n---\n",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.brokenRefs).toHaveLength(1);
    expect(report.brokenRefs[0].refPath).toBe("atlas/assets/portraits/missing.png");
    expect(report.brokenRefs[0].source).toContain("note.md");
  });

  it("ignores external URLs entirely (not our problem)", () => {
    writeContent(
      "world/note.md",
      "![remote](https://example.com/image.png)\ndata: ![inline](data:image/png;base64,abc)",
    );
    const report = auditAssets({ assetsDir, publicDir, contentDir });
    expect(report.brokenRefs).toEqual([]);
    expect(report.references).toEqual([]);
  });
});

describe("extractor helpers", () => {
  it("normalizeRefPath strips leading slash + skips external URLs", () => {
    expect(normalizeRefPath("/atlas/assets/x.png")).toBe("atlas/assets/x.png");
    expect(normalizeRefPath("atlas/assets/x.png")).toBe("atlas/assets/x.png");
    expect(normalizeRefPath("https://example.com/x.png")).toBeNull();
    expect(normalizeRefPath("data:image/png;base64,abc")).toBeNull();
    expect(normalizeRefPath("")).toBeNull();
  });

  it("extractMarkdownImageRefs pulls every ![alt](path) match", () => {
    const md = "a ![x](one.png) b ![y](sub/two.jpg) c";
    expect(extractMarkdownImageRefs(md)).toEqual(["one.png", "sub/two.jpg"]);
  });

  it("extractFrontmatterImageRefs reads atlas.images from frontmatter", () => {
    const md = "---\natlas:\n  images:\n    - a.png\n    - b.jpg\n---\nbody";
    expect(extractFrontmatterImageRefs(md)).toEqual(["a.png", "b.jpg"]);
  });

  it("extractWorldYamlLayerSrcs walks every map > layers > src", () => {
    const doc = {
      maps: [
        { id: "m1", layers: [{ id: "a", src: "one.jpg" }, { id: "b", src: "two.jpg" }] },
        { id: "m2", layers: [{ id: "c", src: "three.jpg" }] },
      ],
    };
    expect(extractWorldYamlLayerSrcs(doc)).toEqual(["one.jpg", "two.jpg", "three.jpg"]);
  });
});

describe.sequential("audit-assets CLI", () => {
  it("exits 0 on a clean tree", () => {
    writeAsset("atlas/assets/maps/main.jpg", 1024);
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/maps/main.jpg\n---\n",
    );
    const r = run([
      "--assets-dir", assetsDir,
      "--content-dir", contentDir,
    ]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain("atlas:audit-assets: clean");
  });

  it("exits 13 when a >4 MB file is present", () => {
    writeAsset("atlas/assets/maps/huge.jpg", SIZE_ERROR_BYTES + 1024);
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/maps/huge.jpg\n---\n",
    );
    const r = run([
      "--assets-dir", assetsDir,
      "--content-dir", contentDir,
    ]);
    expect(r.status).toBe(13);
  });

  it("exits 0 by default but 13 under --strict when only warnings exist", () => {
    writeAsset("atlas/assets/maps/big.jpg", SIZE_WARN_BYTES + 1024);
    writeContent(
      "world/note.md",
      "---\natlas:\n  images:\n    - atlas/assets/maps/big.jpg\n---\n",
    );
    const lax = run([
      "--assets-dir", assetsDir,
      "--content-dir", contentDir,
    ]);
    expect(lax.status, lax.stderr + lax.stdout).toBe(0);
    const strict = run([
      "--assets-dir", assetsDir,
      "--content-dir", contentDir,
      "--strict",
    ]);
    expect(strict.status).toBe(13);
  });

  it("bad invocation exits 1", () => {
    const r = run(["--nonsense"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown argument");
  });
});
