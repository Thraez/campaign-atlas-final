import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

const ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const IS_WIN = process.platform === "win32";

// Normalise HTML for comparison (whitespace between tags is not semantically
// meaningful and marked/sanitiser emit it differently in edge cases).
const norm = (h: string) => h.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

function runBuild(args: string[], opts: ExecFileSyncOptions = {}): void {
  execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WIN,
    env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    ...opts,
  });
}

let dm: { entities: Entity[] };
let player: { entities: Entity[] };

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b1-parity-"));
  const dmOut = path.join(tmp, "dm");
  const plOut = path.join(tmp, "player");
  // Match the flags/args used by src/test/atlas-build.test.ts.
  runBuild(["--out", dmOut]);
  runBuild(["--player", "--out", plOut]);
  dm = JSON.parse(fs.readFileSync(path.join(dmOut, "atlas.json"), "utf8"));
  player = JSON.parse(fs.readFileSync(path.join(plOut, "atlas.json"), "utf8"));
}, 120_000);

describe("projectEntityForPlayer ≡ build player output (linchpin)", () => {
  it("every player-visible entity projects identically to the player build", () => {
    const byId = new Map(dm.entities.map((e) => [e.id, e]));
    const ctx = buildProjectionContext(byId);
    const playerById = new Map(player.entities.map((e) => [e.id, e]));
    let checked = 0;
    for (const dmEntity of dm.entities) {
      const expected = playerById.get(dmEntity.id);
      if (!expected) continue; // hidden/dm — excluded from player build, no oracle
      const got = projectEntityForPlayer(dmEntity, ctx);
      expect(norm(got.bodyHtml ?? ""), `bodyHtml ${dmEntity.id}`).toEqual(norm(expected.bodyHtml ?? ""));
      expect(got.body, `body ${dmEntity.id}`).toEqual(expected.body);
      expect(got.tags, `tags ${dmEntity.id}`).toEqual(expected.tags);
      expect(got.aliases, `aliases ${dmEntity.id}`).toEqual(expected.aliases);
      expect(got.summary ?? "", `summary ${dmEntity.id}`).toEqual(expected.summary ?? "");
      expect(got.frontmatter, `frontmatter ${dmEntity.id}`).toEqual(expected.frontmatter);
      expect(got.sourcePath, `sourcePath ${dmEntity.id}`).toEqual(expected.sourcePath);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
