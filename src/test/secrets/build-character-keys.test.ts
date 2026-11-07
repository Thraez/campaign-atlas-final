// @vitest-environment node
/**
 * The build reads the character keys the editor writes (eval-2026-10/41):
 * `<contentRoot>/<world>/_dm/character-keys.yaml`, parsed with the editor's
 * `parseCharacterKeys`. A key saved there encrypts that character's secret
 * and the player decrypts it with the key; a hand-edited numeric key is the
 * text typed; an entry that isn't a name and a key is skipped with the
 * missing-key warning, its value never printed or shipped. A keys file at the
 * old `<contentRoot>/_dm/` path is ignored with a warning, never read.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptSecret, type SecretBlob } from "@/atlas/secrets/secretCrypto";
import { characterKeysPath, serializeCharacterKeys } from "@/atlas/secrets/characterKeysFile";
import { runBuildCli, type InProcessRun } from "../helpers/buildInProcess";

const ROOT = path.resolve(__dirname, "../../..");

let root: string;

function writeFile(p: string, text: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

function filesUnder(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .map((f) => path.join(dir, f))
    .filter((p) => fs.statSync(p).isFile());
}

/** A one-world vault in `root` whose editor-saved keys file holds `keysText`. */
function writeVault(root: string, keysText: string) {
  const contentRoot = path.join(root, "content");
  const world = path.join(contentRoot, "test-world");
  writeFile(
    path.join(root, "atlas.config.json"),
    JSON.stringify({
      contentRoot: "content",
      outputDir: path.join(root, "out"),
      defaultWorld: "test-world",
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  writeFile(
    path.join(world, "_atlas", "world.yaml"),
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
  // Where the editor saves: the Character Keys panel writes this file.
  writeFile(characterKeysPath(contentRoot, "test-world"), keysText);
  writeFile(
    path.join(world, "corven.md"),
    [
      "---",
      "atlas:",
      "  publish: true",
      "  visibility: player",
      "  secrets:",
      "    - id: for-ada",
      "      for: Ada",
      "      reveal: ada learns the truth",
      "    - id: for-bob",
      "      for: Bob",
      "      reveal: bob learns the truth",
      "    - id: for-cara",
      "      for: Cara",
      "      reveal: cara learns the truth",
      "    - id: for-dan",
      "      for: Dan",
      "      reveal: dan learns the truth",
      "    - id: for-eve",
      "      for: Eve",
      "      reveal: eve learns the truth",
      "---",
      "Ledgers. {{secret:for-ada}} {{secret:for-bob}} {{secret:for-cara}} {{secret:for-dan}} {{secret:for-eve}}",
    ].join("\n"),
  );
}

function filesText(dir: string): Array<[string, string]> {
  return filesUnder(dir).map((p) => [p, fs.readFileSync(p, "utf8")]);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "build-character-keys-"));
  writeVault(
    root,
    serializeCharacterKeys([{ name: "Ada", key: "ada-editor-key" }]) +
      "Bob: 12345\nCara:\n  nested: cara-hidden-value\nDan:\n",
  );
  // The old content-root path: ignored, and its key must not be used.
  writeFile(path.join(root, "content", "_dm", "character-keys.yaml"), "Eve: eve-legacy-key\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("player build reads the character keys where the editor saves them", () => {
  let result: InProcessRun;
  let output: string;
  let secrets: Array<SecretBlob & { id: string }>;
  const out = () => path.join(root, "out");

  beforeAll(async () => {
    result = await runBuildCli(
      ["--player", "--config", path.join(root, "atlas.config.json"), "--out", out()],
      ROOT,
    );
    output = `${result.stdout}\n${result.stderr}`;
    const atlas = JSON.parse(fs.readFileSync(path.join(out(), "atlas.json"), "utf8")) as {
      entities: Array<{ id: string; secrets?: Array<SecretBlob & { id: string }> }>;
    };
    secrets = atlas.entities.find((e) => e.id === "corven")?.secrets ?? [];
  }, 120_000);

  it("encrypts a secret with the key saved in the editor, and the player decrypts it", async () => {
    expect(result.status, output).toBe(0);
    const ada = secrets.find((s) => s.id === "for-ada");
    expect(ada, `${JSON.stringify(secrets.map((s) => s.id))}\n${output}`).toBeDefined();
    expect(await decryptSecret(ada!, "ada-editor-key")).toBe("ada learns the truth");
  });

  it("uses a hand-edited numeric key as the text typed", async () => {
    const bob = secrets.find((s) => s.id === "for-bob");
    expect(bob, output).toBeDefined();
    expect(await decryptSecret(bob!, "12345")).toBe("bob learns the truth");
  });

  it("skips nested and empty entries with the missing-key warning naming the entry only", () => {
    expect(secrets.find((s) => s.id === "for-cara")).toBeUndefined();
    expect(secrets.find((s) => s.id === "for-dan")).toBeUndefined();
    expect(output).toContain('no character key for "Cara"');
    expect(output).toContain('no character key for "Dan"');
    expect(output).not.toContain("cara-hidden-value");
  });

  it("ignores a keys file at the old content-root path, with a warning", () => {
    expect(secrets.find((s) => s.id === "for-eve")).toBeUndefined();
    expect(output).toContain('no character key for "Eve"');
    expect(output).toMatch(/content\/_dm\/character-keys\.yaml.*ignored/);
    expect(output).not.toContain("eve-legacy-key");
  });

  it("ships no key and no plaintext secret in any output file", () => {
    const banned = [
      "ada-editor-key",
      "12345",
      "cara-hidden-value",
      "eve-legacy-key",
      "learns the truth",
    ];
    for (const p of filesUnder(out())) {
      const text = fs.readFileSync(p, "utf8");
      for (const b of banned) expect(text.includes(b), `${b} in ${p}`).toBe(false);
    }
  });
});

// js-yaml's error reason can quote the file: an alias or tag typed where a key
// goes would put the key in the warning, and warnings ship in the player
// build report (atlas.json). The build says only that the file is invalid.
describe.each([
  ["an alias", "Ada: *aliased-key-text\n"],
  ["a tag", "Ada: !tagged-key-text x\n"],
])("a keys file that isn't valid YAML because of %s", (_label, keysText) => {
  let vault: string;
  let result: InProcessRun;
  const keyText = keysText.includes("aliased") ? "aliased-key-text" : "tagged-key-text";

  beforeAll(async () => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), "build-character-keys-bad-"));
    writeVault(vault, keysText);
    result = await runBuildCli(
      [
        "--player",
        "--config",
        path.join(vault, "atlas.config.json"),
        "--out",
        path.join(vault, "out"),
      ],
      ROOT,
    );
  }, 120_000);

  afterAll(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("warns that the file isn't valid YAML without quoting it", () => {
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toMatch(/character-keys\.yaml: it isn't valid YAML/);
    expect(output).not.toContain(keyText);
  });

  it("puts the key text in no player output file, atlas.json included", () => {
    const files = filesText(path.join(vault, "out"));
    expect(files.some(([p]) => p.endsWith("atlas.json"))).toBe(true);
    for (const [p, text] of files) expect(text.includes(keyText), p).toBe(false);
  });
});
