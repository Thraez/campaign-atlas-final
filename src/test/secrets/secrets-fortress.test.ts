/**
 * Secrets fortress — end-to-end build + leak-scan self-test.
 *
 * Plants real secrets in a fixture vault, runs the player build, then asserts:
 * 1. The clean build passes check-player-secrets (no plaintext in artifacts).
 * 2. A deliberately-broken artifact (plaintext reveal planted) is caught.
 *
 * Mirrors src/test/safety-fortress.test.ts pattern.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run as checkPlayerSecrets } from "../../../scripts/check-player-secrets";

const ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.resolve(ROOT, "scripts/build-atlas.ts");
const IS_WIN = process.platform === "win32";

function runBuild(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: IS_WIN,
      env: { ...process.env, ATLAS_ACK_DM_IN_SOURCE: "true" },
    } as ExecFileSyncOptions);
    return { status: 0, stdout: String(stdout), stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

let root: string;

function writeVault(dir: string) {
  const content = path.join(dir, "content", "test-world");
  const atlasDir = path.join(content, "_atlas");
  const dmDir = path.join(content, "_dm");
  fs.mkdirSync(atlasDir, { recursive: true });
  fs.mkdirSync(dmDir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: path.join(dir, "out"),
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );

  fs.writeFileSync(
    path.join(atlasDir, "world.yaml"),
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

  // Character keys file — only used at build time, never shipped.
  fs.writeFileSync(path.join(dmDir, "character-keys.yaml"), "vesper: vesper-secret-key-abc\n");

  // Entity with both a password secret and a character secret.
  fs.writeFileSync(
    path.join(content, "corven.md"),
    [
      "---",
      "atlas:",
      "  publish: true",
      "  visibility: player",
      "  secrets:",
      "    - id: ward",
      "      password: the tide",
      "      teaser: a sealed box",
      "      reveal: the ward answers",
      "    - id: signet",
      "      for: vesper",
      "      reveal: you know the ring",
      "---",
      "He keeps ledgers. {{secret:ward}} {{secret:signet}}",
    ].join("\n"),
  );
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-fortress-"));
  writeVault(root);
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("secrets fortress", () => {
  it("clean player build of a secret vault passes the leak scan", () => {
    const out = path.join(root, "out");
    const result = runBuild(
      ["--player", "--config", path.join(root, "atlas.config.json"), "--out", out],
      root,
    );
    expect(result.status, `Build failed:\n${result.stderr}\n${result.stdout}`).toBe(0);
    // Scan passes — no plaintext or markers in entity bodies / search index.
    expect(checkPlayerSecrets({ dir: out })).toBe(0);

    // Entity body must not contain plaintext reveal text or secret keys.
    const atlas = JSON.parse(fs.readFileSync(path.join(out, "atlas.json"), "utf8"));
    const corven = (
      atlas.entities as Array<{ id: string; body?: string; secrets?: unknown[] }>
    ).find((e) => e.id === "corven");
    expect(corven?.body?.includes("the ward answers")).toBe(false);
    expect(corven?.body?.includes("you know the ring")).toBe(false);
    expect(corven?.body?.includes("the tide")).toBe(false);
    expect(corven?.body?.includes("vesper-secret-key-abc")).toBe(false);
    expect(corven?.body?.includes("{{secret:")).toBe(false);

    // Secrets array must contain ciphertext blobs only.
    const secrets = corven?.secrets as Array<Record<string, unknown>> | undefined;
    expect(secrets).toBeDefined();
    expect(secrets!.some((s) => "reveal" in s)).toBe(false);
    expect(secrets!.some((s) => "password" in s)).toBe(false);

    // Search index must not contain unstripped markers.
    const searchText = fs.readFileSync(path.join(out, "search-index.json"), "utf8");
    expect(searchText.includes("{{secret:")).toBe(false);
  });

  it("scan catches a planted plaintext reveal field", () => {
    const bad = path.join(root, "bad");
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(
      path.join(bad, "atlas.json"),
      JSON.stringify({
        entities: [
          {
            id: "x",
            body: "x",
            secrets: [
              {
                id: "s",
                lockType: "password",
                reveal: "the ward answers",
                salt: "Q",
                iv: "Q",
                ciphertext: "Q",
              },
            ],
          },
        ],
        placements: [],
      }),
    );
    fs.writeFileSync(path.join(bad, "search-index.json"), JSON.stringify([]));
    expect(checkPlayerSecrets({ dir: bad })).toBe(13);
  });

  it("scan catches an unstripped {{secret:}} marker in the body", () => {
    const bad2 = path.join(root, "bad2");
    fs.mkdirSync(bad2, { recursive: true });
    fs.writeFileSync(
      path.join(bad2, "atlas.json"),
      JSON.stringify({
        entities: [{ id: "y", body: "He keeps ledgers {{secret:ward}}" }],
        placements: [],
      }),
    );
    fs.writeFileSync(path.join(bad2, "search-index.json"), JSON.stringify([]));
    expect(checkPlayerSecrets({ dir: bad2 })).toBe(13);
  });
});
