/**
 * Source-tree DM detector tests.
 *
 * These cover both the pure scanner (no IO with the build script) and the
 * end-to-end "player build refuses to run without ATLAS_ACK_DM_IN_SOURCE"
 * gate. Network is never used.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scanDmContent, hasDmInSource, reportDmInSource } from "../../scripts/atlas/detectDmInSource";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-dm-warn-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(p: string, body: string) {
  const full = path.join(tmp, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

describe("scanDmContent()", () => {
  it("returns nothing for a clean vault", () => {
    write("content/world/notes/Plain.md", "---\ntitle: Plain\natlas:\n  visibility: player\n---\nbody\n");
    const r = scanDmContent(path.join(tmp, "content"));
    expect(hasDmInSource(r)).toBe(false);
  });

  it("flags _dm folders that contain real files (ignores .gitkeep)", () => {
    write("content/world/_dm/.gitkeep", "");
    let r = scanDmContent(path.join(tmp, "content"));
    expect(r.dmFolders).toEqual([]); // .gitkeep alone doesn't count
    write("content/world/_dm/Plot.md", "---\ntitle: Plot\n---\nsecret\n");
    r = scanDmContent(path.join(tmp, "content"));
    expect(r.dmFolders.length).toBe(1);
    expect(hasDmInSource(r)).toBe(true);
  });

  it("flags visibility: dm and visibility: hidden frontmatter", () => {
    write("content/world/a.md", "---\ntitle: A\natlas:\n  visibility: dm\n---\n");
    write("content/world/b.md", "---\ntitle: B\natlas:\n  visibility: hidden\n---\n");
    write("content/world/c.md", "---\ntitle: C\natlas:\n  visibility: player\n---\n");
    const r = scanDmContent(path.join(tmp, "content"));
    expect(r.dmFiles.length).toBe(1);
    expect(r.hiddenFiles.length).toBe(1);
  });
});

describe("reportDmInSource()", () => {
  it("returns true (no-op) when the scan is clean", () => {
    expect(reportDmInSource({ dmFolders: [], dmFiles: [], hiddenFiles: [] }, {
      enforceAck: true, repoRoot: tmp,
    })).toBe(true);
  });

  it("warns but allows when DM content exists and enforceAck=false", () => {
    const ok = reportDmInSource(
      { dmFolders: [path.join(tmp, "content/_dm")], dmFiles: [], hiddenFiles: [] },
      { enforceAck: false, repoRoot: tmp }
    );
    expect(ok).toBe(true);
  });

  it("REFUSES to proceed when enforceAck=true and ack=false", () => {
    const ok = reportDmInSource(
      { dmFolders: [path.join(tmp, "content/_dm")], dmFiles: [], hiddenFiles: [] },
      { enforceAck: true, repoRoot: tmp, ack: false }
    );
    expect(ok).toBe(false);
  });

  it("allows when ack=true even with enforcement", () => {
    const ok = reportDmInSource(
      { dmFolders: [], dmFiles: [path.join(tmp, "x.md")], hiddenFiles: [] },
      { enforceAck: true, repoRoot: tmp, ack: true }
    );
    expect(ok).toBe(true);
  });
});

/**
 * End-to-end: the build script itself must refuse a player build that
 * sees DM content with no acknowledgement, and accept it once the env
 * variable is set. We use the shared fixture vault, which contains both a
 * `visibility: dm` file and a `visibility: hidden` file.
 */
describe("build-atlas player gate", () => {
  const FIXTURE = path.resolve(__dirname, "fixtures/atlas-build");

  function runPlayer(ack: boolean): { status: number; combined: string } {
    try {
      const stdout = execFileSync(
        "npx",
        [
          "tsx",
          SCRIPT,
          "--player",
          "--strict",
          "--config",
          path.join(FIXTURE, "atlas.config.json"),
          "--out",
          path.join(tmp, "out"),
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: ack
            ? { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" }
            : { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "" },
        }
      );
      return { status: 0, combined: String(stdout) };
    } catch (e) {
      const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
      return {
        status: err.status ?? 1,
        combined: String(err.stdout ?? "") + String(err.stderr ?? ""),
      };
    }
  }

  it("FAILS player build without ATLAS_ACK_DM_IN_SOURCE=true", () => {
    const r = runPlayer(false);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/SOURCE-REPO WARNING/);
    expect(r.combined).toMatch(/ATLAS_ACK_DM_IN_SOURCE/);
  });

  it("PASSES player build with ATLAS_ACK_DM_IN_SOURCE=true", () => {
    const r = runPlayer(true);
    expect(r.status, r.combined).toBe(0);
    expect(r.combined).toMatch(/SOURCE-REPO WARNING/); // still printed as warning
  });
});