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

/** A throwaway vault with the real config's excludes; returns the config path. */
function tempVault(notes: Record<string, string>): { config: string; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "derived-vault-"));
  for (const [rel, text] of Object.entries(notes)) {
    const file = path.join(root, "content", rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const config = path.join(root, "atlas.config.json");
  fs.writeFileSync(
    config,
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "test",
      include: ["**/*.md"],
      exclude: ["**/_drafts/**", "**/_dm/**", "**/archive/**", "**/deprecated/**"],
    }),
  );
  return { config, root };
}

describe("derived secrets match what the build ships", () => {
  it("an untitled dm note contributes the build's title-cased title", () => {
    const v = tempVault({ "w/isle-de-marque.md": "---\natlas:\n  visibility: dm\n---\n" });
    try {
      const names = deriveSecretsFromVault(v.config).map((s) => s.name);
      expect(names).toContain("Isle De Marque");
    } finally {
      fs.rmSync(v.root, { recursive: true, force: true });
    }
  });

  it("a player note naming a dm note in any case fails the scan", () => {
    const v = tempVault({ "w/isle-de-marque.md": "---\natlas:\n  visibility: dm\n---\n" });
    const out = path.join(v.root, "out");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "atlas.json"), '{"body":"Ships sail to isle de marque."}');
    try {
      const r = scanArtifactForSecrets(out, deriveSecretsFromVault(v.config));
      expect(r.hits.map((h) => h.match.name)).toContain("Isle De Marque");
    } finally {
      fs.rmSync(v.root, { recursive: true, force: true });
    }
  });

  it("titles from _dm/ and _drafts/ are in the list", () => {
    const v = tempVault({
      "w/_dm/drowned-temple.md": "---\ntitle: Drowned Temple of Nepheth\n---\n",
      "w/_drafts/the-ninth-bell.md": "---\natlas:\n  visibility: dm\n---\n",
    });
    try {
      const names = deriveSecretsFromVault(v.config).map((s) => s.name);
      expect(names).toContain("Drowned Temple of Nepheth");
      expect(names).toContain("The Ninth Bell");
    } finally {
      fs.rmSync(v.root, { recursive: true, force: true });
    }
  });

  it("a note with no visibility is dm (ADR-0001), so its title is a secret", () => {
    const v = tempVault({ "w/corven.md": "---\ntitle: Corven Ashmere\n---\n" });
    try {
      const names = deriveSecretsFromVault(v.config).map((s) => s.name);
      expect(names).toContain("Corven Ashmere");
    } finally {
      fs.rmSync(v.root, { recursive: true, force: true });
    }
  });

  it("a legacy publish: true note is not a secret", () => {
    const v = tempVault({
      "w/harbour.md": "---\ntitle: Grey Harbour\natlas:\n  publish: true\n---\n",
    });
    try {
      expect(deriveSecretsFromVault(v.config)).toHaveLength(0);
    } finally {
      fs.rmSync(v.root, { recursive: true, force: true });
    }
  });

  it("matches whole words only, so a secret name inside a longer word is not a hit", () => {
    const v = tempVault({ "w/mira.md": "---\ntitle: Mira\natlas:\n  visibility: dm\n---\n" });
    const out = path.join(v.root, "out");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "atlas.json"), '{"body":"A miracle at Admiral Point."}');
    try {
      expect(scanArtifactForSecrets(out, deriveSecretsFromVault(v.config)).hits).toEqual([]);
    } finally {
      fs.rmSync(v.root, { recursive: true, force: true });
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
