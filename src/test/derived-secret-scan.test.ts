/**
 * Tests for the derived-secret scanner.
 *
 * Two layers covered here:
 *   1. Unit tests on the derivation rules — what names get extracted from
 *      a vault, what gets filtered out as too generic.
 *   2. End-to-end-ish test: derive secrets from the atlas-build fixture
 *      vault (which has real hidden/dm entities with non-trivial names),
 *      plant a hit and a clean control, verify the scanner reports the
 *      hit and clears the control.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deriveSecretsFromVault,
  scanArtifactForSecrets,
} from "../../scripts/check-derived-secrets";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURE_CONFIG = path.resolve(__dirname, "fixtures/atlas-build/atlas.config.json");

describe("deriveSecretsFromVault", () => {
  it("extracts non-generic titles/ids/aliases for dm and hidden entities", () => {
    const secrets = deriveSecretsFromVault(FIXTURE_CONFIG);
    const names = new Set(secrets.map((s) => s.name));
    // Both the dm-visibility and hidden-visibility fixtures should contribute.
    expect(names.has("Secret Lair")).toBe(true);
    expect(names.has("Hidden Thing")).toBe(true);
    // Slug forms also tracked, since they appear in id-shaped output too.
    expect(names.has("secret-lair")).toBe(true);
    expect(names.has("hidden-thing")).toBe(true);
  });

  it("filters out generic short names (under length threshold)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derived-generic-"));
    try {
      const contentDir = path.join(tmp, "content/test");
      fs.mkdirSync(contentDir, { recursive: true });
      // Title is exactly the kind of generic name we should skip.
      fs.writeFileSync(
        path.join(contentDir, "The.md"),
        "---\ntitle: The\natlas:\n  visibility: dm\n---\nbody\n",
      );
      fs.writeFileSync(
        path.join(tmp, "atlas.config.json"),
        JSON.stringify({
          contentRoot: "content",
          outputDir: "out",
          defaultWorld: "test",
          include: [],
          exclude: [],
        }),
      );
      const secrets = deriveSecretsFromVault(path.join(tmp, "atlas.config.json"));
      expect(secrets.find((s) => s.name === "The")).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does NOT derive secrets from public/rumor entities", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derived-public-"));
    try {
      const contentDir = path.join(tmp, "content/test");
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(
        path.join(contentDir, "Public-Name-That-Is-Long-Enough.md"),
        "---\ntitle: Visible Settlement\natlas:\n  visibility: player\n---\n",
      );
      fs.writeFileSync(
        path.join(tmp, "atlas.config.json"),
        JSON.stringify({
          contentRoot: "content",
          outputDir: "out",
          defaultWorld: "test",
          include: [],
          exclude: [],
        }),
      );
      const secrets = deriveSecretsFromVault(path.join(tmp, "atlas.config.json"));
      expect(secrets).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("treats atlas.publish: false as a derive trigger even with default visibility", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derived-unpub-"));
    try {
      const contentDir = path.join(tmp, "content/test");
      fs.mkdirSync(contentDir, { recursive: true });
      fs.writeFileSync(
        path.join(contentDir, "Quietly-Excluded.md"),
        "---\ntitle: Quietly Excluded\natlas:\n  publish: false\n---\n",
      );
      fs.writeFileSync(
        path.join(tmp, "atlas.config.json"),
        JSON.stringify({
          contentRoot: "content",
          outputDir: "out",
          defaultWorld: "test",
          include: [],
          exclude: [],
        }),
      );
      const secrets = deriveSecretsFromVault(path.join(tmp, "atlas.config.json"));
      const names = secrets.map((s) => s.name);
      expect(names).toContain("Quietly Excluded");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("scanArtifactForSecrets", () => {
  let tmpRoot: string;
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-derived-scan-"));
  });
  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("flags a planted hit in atlas.json shape, reports source field+file", () => {
    const dir = path.join(tmpRoot, "leaky");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "atlas.json"),
      JSON.stringify({
        entities: [{ id: "x", title: "x", body: "Players see: Secret Lair" }],
      }),
    );
    const secrets = deriveSecretsFromVault(FIXTURE_CONFIG);
    const r = scanArtifactForSecrets(dir, secrets);
    expect(r.hits.length).toBeGreaterThan(0);
    const hit = r.hits.find((h) => h.match.name === "Secret Lair");
    expect(hit).toBeDefined();
    expect(hit!.match.field).toBe("title");
  });

  it("clean artifact passes", () => {
    const dir = path.join(tmpRoot, "clean");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "atlas.json"),
      JSON.stringify({ entities: [{ id: "thornhold", title: "Thornhold" }] }),
    );
    const secrets = deriveSecretsFromVault(FIXTURE_CONFIG);
    const r = scanArtifactForSecrets(dir, secrets);
    expect(r.hits).toEqual([]);
  });

  it("ignores non-text file extensions", () => {
    const dir = path.join(tmpRoot, "binary");
    fs.mkdirSync(dir, { recursive: true });
    // Planting the literal string in a non-text extension should not count.
    fs.writeFileSync(path.join(dir, "leak.png"), "Secret Lair contents");
    const secrets = deriveSecretsFromVault(FIXTURE_CONFIG);
    const r = scanArtifactForSecrets(dir, secrets);
    expect(r.hits).toEqual([]);
  });
});
