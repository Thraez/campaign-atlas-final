// @vitest-environment node
/**
 * code-retro 06 acceptance: the build, Staging, the merge (through
 * `buildImportChanges`) and the derived-secrets scan agree on every note's
 * id, type and visibility, because all four read it with `readNote`.
 *
 * Fixtures cover an untitled note, flat top-level `type:`, a note with no
 * visibility (ADR-0001: dm), an invalid tag beside `publish: true`, an untyped
 * note, and a `_dm/` note the build never reads.
 *
 * Three differences are intended and pinned here (ticket Comments):
 *   - title of a note with no frontmatter title and a hand-typed filename:
 *     Staging keeps "Isle de Marque", the build title-cases it. Commit writes
 *     Staging's title into the note, so the build then reads the same one.
 *   - type of an untyped note: the build says "note", Staging guesses (tags,
 *     folder, then "lore") and commit writes its guess.
 *   - an untagged note from a public vault folder (01_Lore): Staging shows
 *     the folder default `player` and commit writes it; until then the build
 *     says dm.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBuild } from "../../scripts/build-atlas";
import { deriveSecretsFromVault } from "../../scripts/check-derived-secrets";
import {
  buildStagingRows,
  type RawImportFile,
  type StagingContext,
} from "@/atlas/import/stagingState";
import { buildImportChanges } from "@/atlas/import/buildImportChanges";
import { readNote } from "@/atlas/content/readNote";
import type { Entity, ImportFolderConfig } from "@/atlas/content/schema";

interface Fixture {
  path: string;
  raw: string;
  title: string;
  /** Staging's title, where it intentionally differs from the build's. */
  stagingTitle?: string;
  id: string;
  type: string;
  /** Staging's type, where it intentionally differs (untyped notes). */
  stagingType?: string;
  visibility: string;
  secret: boolean;
}

const FIXTURES: Fixture[] = [
  {
    // untitled, flat type:, no visibility at all
    path: "w/npcs/corven.md",
    raw: "---\ntype: npc\nrace: human\n---\nA smuggler.\n",
    title: "Corven",
    id: "corven",
    type: "npc",
    visibility: "dm",
    secret: true,
  },
  {
    // untitled, hand-typed Obsidian filename, flat type:, player tag
    path: "w/places/Isle de Marque.md",
    raw: "---\ntype: location\natlas:\n  visibility: player\n---\nAn island.\n",
    title: "Isle De Marque",
    stagingTitle: "Isle de Marque",
    id: "isle-de-marque",
    type: "location",
    visibility: "player",
    secret: false,
  },
  {
    path: "w/events/sundering.md",
    raw: "---\ntitle: The Sundering\natlas:\n  type: event\n  visibility: rumor\n---\nThe sky cracked.\n",
    title: "The Sundering",
    id: "the-sundering",
    type: "event",
    visibility: "rumor",
    secret: false,
  },
  {
    // an invalid tag is dm even beside publish: true
    path: "w/npcs/mirelle-vash.md",
    raw: "---\ntype: npc\natlas:\n  visibility: plyer\n  publish: true\n---\nA spy.\n",
    title: "Mirelle Vash",
    id: "mirelle-vash",
    type: "npc",
    visibility: "dm",
    secret: true,
  },
  {
    // untyped: the build's fallback against Staging's guess
    path: "w/imports/old-song.md",
    raw: "---\ntitle: The Old Song\natlas:\n  visibility: player\n---\nA ballad.\n",
    title: "The Old Song",
    id: "the-old-song",
    type: "note",
    stagingType: "lore",
    visibility: "player",
    secret: false,
  },
];

/** In `_dm/`: the build never reads it, so it is secret whatever its tag. */
const DM_FOLDER_NOTE = {
  path: "w/_dm/villain-lair.md",
  raw: "---\ntitle: Villain Lair\natlas:\n  type: dungeon\n  visibility: player\n---\nPlans.\n",
  title: "Villain Lair",
  id: "villain-lair",
  type: "dungeon",
};

const IMPORT_CONFIG: ImportFolderConfig = {
  folders: { npc: "npcs", location: "places", event: "events", dungeon: "ruins" },
  defaultFolder: "imports",
};
const ctx = (existingById = new Map<string, string>()): StagingContext => ({
  worldId: "w",
  importConfig: IMPORT_CONFIG,
  allowedFolders: new Set(["npcs", "places", "events", "ruins", "imports"]),
  existingById,
  existingPaths: new Set(existingById.values()),
});

/** Reads atlas files from a map of repo paths. */
function readFrom(files: Record<string, string>) {
  return {
    readFile: async (p: string) => {
      if (!(p in files)) throw new Error(`Source file not found: ${p}`);
      return files[p];
    },
  };
}

let tmp: string;
let configPath: string;
let built: Map<string, Entity>;
let secretNames: Set<string>;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "note-parity-"));
  configPath = path.join(tmp, "atlas.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      contentRoot: "content",
      outputDir: "out",
      defaultWorld: "w",
      include: ["**/*.md"],
      exclude: ["**/_dm/**"],
    }),
  );
  fs.mkdirSync(path.join(tmp, "content/w/_atlas"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "content/w/_atlas/world.yaml"),
    "schemaVersion: 1\nmaps:\n  - id: m1\n    name: M\n    width: 100\n    height: 100\n    layers: []\n",
  );
  for (const f of [...FIXTURES, DM_FOLDER_NOTE]) {
    const abs = path.join(tmp, "content", f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.raw);
  }
  const outDir = path.join(tmp, "dm-out");
  const result = await runBuild({ player: false, strict: false, configPath, outDir });
  expect(result.error).toBeUndefined();
  const atlas = JSON.parse(fs.readFileSync(path.join(outDir, "atlas.json"), "utf8")) as {
    entities: Entity[];
  };
  built = new Map(atlas.entities.map((e) => [e.id, e]));
  // The scan matches in any letter case and keeps one entry per name.
  secretNames = new Set(deriveSecretsFromVault(configPath).map((s) => s.name.toLowerCase()));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const stage = (file: RawImportFile, c = ctx()) => buildStagingRows([file], c)[0];

describe.each(FIXTURES)("$path", (f) => {
  it("the build reads it as the fixture says", () => {
    const e = built.get(f.id);
    expect(e).toBeDefined();
    expect([e!.title, e!.type, e!.visibility]).toEqual([f.title, f.type, f.visibility]);
  });

  it("Staging agrees on id and visibility (title and type as pinned)", () => {
    const row = stage({ filename: path.basename(f.path), raw: f.raw });
    expect([row.title, row.resolvedId, row.inferredType, row.resolvedVisibility]).toEqual([
      f.stagingTitle ?? f.title,
      f.id,
      f.stagingType ?? f.type,
      f.visibility,
    ]);
  });

  it("an update through buildImportChanges keeps the same visibility", async () => {
    const diskPath = `content/${f.path}`;
    const row = stage(
      { filename: path.basename(f.path), raw: f.raw },
      ctx(new Map([[f.id, diskPath]])),
    );
    expect(row.rowKind).toBe("update");
    const [change] = await buildImportChanges([row], readFrom({ [diskPath]: f.raw }));
    const written = readNote(change.content, diskPath);
    expect([written.visibility, written.isSecret]).toEqual([f.visibility, f.secret]);
  });

  it("the derived-secrets scan guards it exactly when it is secret", () => {
    expect(secretNames.has(f.title.toLowerCase())).toBe(f.secret);
    expect(secretNames.has(f.id.toLowerCase())).toBe(f.secret);
  });
});

describe("a _dm/ note", () => {
  it("never reaches the build output", () => {
    expect(built.has(DM_FOLDER_NOTE.id)).toBe(false);
  });

  it("is guarded by the derived-secrets scan under the title and id Staging gives it", () => {
    const row = stage({ filename: path.basename(DM_FOLDER_NOTE.path), raw: DM_FOLDER_NOTE.raw });
    expect([row.title, row.resolvedId, row.inferredType]).toEqual([
      DM_FOLDER_NOTE.title,
      DM_FOLDER_NOTE.id,
      DM_FOLDER_NOTE.type,
    ]);
    expect(secretNames.has(row.title.toLowerCase())).toBe(true);
    expect(secretNames.has(row.resolvedId.toLowerCase())).toBe(true);
  });
});

describe("Staging's vault folder rule (intended difference from the build)", () => {
  const corven = FIXTURES[0];
  const fromLore = (raw: string) =>
    stage({ filename: "corven.md", raw, vaultRelPath: "01_Lore/corven.md" });

  it("an untagged note from 01_Lore shows player in Staging, and commit writes it", async () => {
    // The build reads the same uncommitted note as dm (ADR-0001).
    expect(built.get(corven.id)!.visibility).toBe("dm");
    const row = fromLore(corven.raw);
    expect(row.resolvedVisibility).toBe("player");
    const [change] = await buildImportChanges([row], readFrom({}));
    expect(readNote(change.content, change.path).visibility).toBe("player");
  });

  it("an invalid tag is dm, not the folder's player", () => {
    expect(fromLore("---\natlas:\n  visibility: plyer\n---\nA spy.\n").resolvedVisibility).toBe(
      "dm",
    );
  });

  it("malformed frontmatter is dm, not the folder's player", () => {
    expect(fromLore("---\natlas: [oops\n---\nA spy.\n").resolvedVisibility).toBe("dm");
  });
});
