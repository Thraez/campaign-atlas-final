/**
 * The build reads character-keys.yaml with the same parser as the editor
 * (eval-2026-10/36): a hand-edited numeric key is used as the text typed, and
 * an entry that isn't a name and a key is skipped with the missing-key
 * warning, without its value ever reaching the output.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptSecret, type SecretBlob } from "@/atlas/secrets/secretCrypto";

const ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const IS_WIN = process.platform === "win32";

function runBuild(args: string[]): { status: number; output: string } {
  try {
    const stdout = execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    } as ExecFileSyncOptions);
    return { status: 0, output: String(stdout) };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return { status: err.status ?? 1, output: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
}

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "build-character-keys-"));
  const content = path.join(root, "content", "test-world");
  fs.mkdirSync(path.join(content, "_atlas"), { recursive: true });
  // The build reads <contentRoot>/_dm/character-keys.yaml (not the world's
  // own _dm folder, where the editor panel writes it).
  fs.mkdirSync(path.join(root, "content", "_dm"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: path.join(root, "out"),
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  fs.writeFileSync(
    path.join(content, "_atlas", "world.yaml"),
    [
      "schemaVersion: 1",
      "maps:",
      "  - id: test-map",
      "    name: Test Map",
      "    width: 1000",
      "    height: 500",
      "    oceanColor: '#18313f'",
      "    wrapX: false",
      "    layers: []",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "content", "_dm", "character-keys.yaml"),
    "Bob: 12345\nCara:\n  nested: cara-hidden-value\n",
  );
  fs.writeFileSync(
    path.join(content, "corven.md"),
    [
      "---",
      "atlas:",
      "  publish: true",
      "  visibility: player",
      "  secrets:",
      "    - id: for-bob",
      "      for: Bob",
      "      reveal: bob learns the truth",
      "    - id: for-cara",
      "      for: Cara",
      "      reveal: cara learns the truth",
      "---",
      "Ledgers. {{secret:for-bob}} {{secret:for-cara}}",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("build reads character-keys.yaml like the editor", () => {
  let result: { status: number; output: string };
  let secrets: Array<SecretBlob & { id: string }>;

  beforeAll(() => {
    const out = path.join(root, "out");
    result = runBuild(["--player", "--config", path.join(root, "atlas.config.json"), "--out", out]);
    const atlas = JSON.parse(fs.readFileSync(path.join(out, "atlas.json"), "utf8")) as {
      entities: Array<{ id: string; secrets?: Array<SecretBlob & { id: string }> }>;
    };
    secrets = atlas.entities.find((e) => e.id === "corven")?.secrets ?? [];
  }, 120_000);

  it("a numeric key is used as the text typed, so the player decrypts with it", async () => {
    expect(result.status, result.output).toBe(0);
    const bob = secrets.find((s) => s.id === "for-bob");
    expect(bob, `${JSON.stringify(secrets.map((s) => s.id))}\n${result.output}`).toBeDefined();
    expect(await decryptSecret(bob!, "12345")).toBe("bob learns the truth");
  });

  it("a nested entry is skipped with the missing-key warning and its value never printed", () => {
    expect(secrets.find((s) => s.id === "for-cara")).toBeUndefined();
    expect(result.output).toContain('no character key for "Cara"');
    expect(result.output).not.toContain("cara-hidden-value");
    const outDir = path.join(root, "out");
    for (const f of fs.readdirSync(outDir, { recursive: true }) as string[]) {
      const p = path.join(outDir, f);
      if (fs.statSync(p).isFile()) {
        expect(fs.readFileSync(p, "utf8").includes("cara-hidden-value"), f).toBe(false);
      }
    }
  });
});
