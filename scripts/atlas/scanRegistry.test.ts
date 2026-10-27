/**
 * eval-2026-10/01: one list of safety scans. CI (the orchestrator), the
 * editor's Publish check and the integrity smoke all read SCANS, so a scan
 * can't be dropped from one of them without a test failing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCANS, scanTasks, runAll, type ScanTask } from "./scanRegistry";
import { runPublishScans } from "./publishScan";

const SCRIPTS_DIR = path.resolve(__dirname, "..");
const FIXTURE_CONTENT = path.resolve(__dirname, "../../src/test/fixtures/atlas-build/content");

describe("SCANS", () => {
  it("lists every scanner script under scripts/", () => {
    const scanners = fs
      .readdirSync(SCRIPTS_DIR)
      .filter((n) => /^check-.*\.ts$/.test(n) && !n.endsWith(".test.ts"))
      .concat("atlas/audit-assets.ts")
      .sort();
    expect(SCANS.map((s) => s.script).sort()).toEqual(scanners);
  });

  it("every scan has an integrity-smoke variant, or a reason it has none", () => {
    const smoke = fs.readFileSync(path.join(__dirname, "publish-integrity-smoke.ts"), "utf8");
    for (const s of SCANS) {
      const hasVariant = smoke.includes(`runScan("${s.script}"`);
      if (s.smokeSkip !== undefined) {
        expect(hasVariant, `${s.id} has a variant and a skip reason`).toBe(false);
        expect(s.smokeSkip.length, `${s.id} skip reason`).toBeGreaterThan(10);
      } else {
        expect(hasVariant, `${s.id} has no integrity-smoke variant`).toBe(true);
      }
    }
  });

  it("each leak scan runs on both the built site and the source store", () => {
    const ctx = { root: "/repo", configPath: "/repo/atlas.config.json", contentDir: "/c" };
    const labels = scanTasks(ctx).map((t) => t.label);
    for (const id of [
      "check-no-secrets",
      "check-derived-secrets",
      "check-image-privacy",
      "check-fog-safety",
      "check-player-secrets",
    ]) {
      expect(labels).toContain(`${id} dist`);
      expect(labels).toContain(`${id} public/atlas`);
    }
  });
});

describe("runAll", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const task = (label: string, code: number, ran: string[]): ScanTask => ({
    scan: "check-no-secrets",
    label,
    run: async () => {
      ran.push(label);
      return code;
    },
  });

  it("runs every task and exits 0 when all are clean", async () => {
    const ran: string[] = [];
    expect(await runAll([task("a", 0, ran), task("b", 0, ran)])).toBe(0);
    expect(ran.sort()).toEqual(["a", "b"]);
  });

  it("exits 1 when one scan fails, after running the rest", async () => {
    const ran: string[] = [];
    expect(await runAll([task("a", 13, ran), task("b", 0, ran)])).toBe(1);
    expect(ran.sort()).toEqual(["a", "b"]);
  });

  it("exits 1 when a scan throws", async () => {
    const boom: ScanTask = {
      scan: "check-no-secrets",
      label: "boom",
      run: () => {
        throw new Error("x");
      },
    };
    expect(await runAll([boom])).toBe(1);
  });
});

describe("runPublishScans (the editor's Publish check)", () => {
  let root: string;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-scans-"));
    fs.writeFileSync(
      path.join(root, "atlas.config.json"),
      JSON.stringify({ contentRoot: FIXTURE_CONTENT, include: ["**/*.md"], exclude: [] }),
    );
    fs.mkdirSync(path.join(root, "public", "atlas", "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "public", "atlas", "atlas.json"),
      JSON.stringify({ version: "1", schemaVersion: 1, worlds: [], entities: [], maps: [] }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks on an unstripped {{secret:}} marker, as CI does", async () => {
    fs.writeFileSync(path.join(root, "public", "atlas", "notes.txt"), "{{secret:vault-key}}");
    const reasons = await runPublishScans(root);
    expect(reasons.map((r) => r.scan)).toContain("check-player-secrets");
    expect(JSON.stringify(reasons)).not.toContain("vault-key");
  });
});
