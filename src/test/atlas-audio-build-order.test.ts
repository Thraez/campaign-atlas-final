/**
 * Build-order regression guard for published soundscape audio.
 *
 * `hashAudioAssets` copies each referenced bed to
 * `public/atlas/assets/audio/<sha256[0..8]><ext>` and then prunes every
 * hashed file the current call did not re-emit. That prune is only safe
 * while the build that runs it is also the build that owns the atlas the
 * hashed names are written into — today that is the player build, and the
 * DM build never hashes at all (it writes to `.local-atlas`).
 *
 * What actually bit (2026-07-30): NOT the DM build. The prune target is
 * hardcoded to `<cwd>/public`, but `--out` redirects only the atlas. Suites
 * that spawn `build-atlas --player --strict --out <tmp>` from the repo root
 * against soundscape-free fixtures produced an empty keep-set and deleted
 * every real hashed file — so *running the test suite* deleted published
 * player audio while `public/atlas/atlas.json` still referenced it.
 *
 * Read the describe blocks accordingly. Only the `--out` block below is
 * discriminating: verified by mutation check, the DM-build cases pass even
 * with the bug present (a DM build never hashes at all), so they guard a
 * real invariant but would not have caught this. Do not treat them as the
 * regression test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runBuild } from "../../scripts/build-atlas";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface Bed {
  src: string;
  srcFallback?: string;
}
interface Area {
  id: string;
  bed: Bed;
}
interface AtlasMap {
  soundscape?: { areas?: Area[] };
}
interface Atlas {
  maps?: AtlasMap[];
}

const AUDIO_REL = path.join("public", "atlas", "assets", "audio");

let originalCwd: string;
let tmpRoot: string;
let playerAtlasPath: string;
let audioDir: string;

function writeVaultWithSoundscape(root: string) {
  fs.mkdirSync(path.join(root, "content/test-world/_atlas"), { recursive: true });
  fs.mkdirSync(path.join(root, "content/test-world/notes"), { recursive: true });
  fs.mkdirSync(path.join(root, AUDIO_REL), { recursive: true });

  // Two distinct source beds, so the build emits two distinct hashed copies.
  fs.writeFileSync(path.join(root, AUDIO_REL, "cavern.ogg"), "fake-ogg-bytes");
  fs.writeFileSync(path.join(root, AUDIO_REL, "cavern.m4a"), "fake-m4a-bytes");
  // A bed the DM switches to *after* publishing — its bytes differ, so it
  // hashes to a name the published atlas does not reference.
  fs.writeFileSync(path.join(root, AUDIO_REL, "wind.ogg"), "fake-wind-bytes");

  fs.writeFileSync(
    path.join(root, "atlas.config.json"),
    JSON.stringify(
      {
        contentRoot: "content",
        outputDir: "out",
        defaultWorld: "test-world",
        include: ["**/*.md"],
        exclude: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(root, "content/test-world/_atlas/world.yaml"),
    [
      "schemaVersion: 1",
      "maps:",
      "  - id: m1",
      "    name: Test Map",
      "    width: 1000",
      "    height: 1000",
      "    layers: []",
      "    soundscape:",
      "      areas:",
      "        - id: deep-hum",
      "          name: Deep hum",
      "          visibility: player",
      "          points:",
      "            - [0, 0]",
      "            - [1000, 0]",
      "            - [1000, 1000]",
      "            - [0, 1000]",
      "          bed:",
      "            src: atlas/assets/audio/cavern.ogg",
      "            srcFallback: atlas/assets/audio/cavern.m4a",
      "            gain: 0.5",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(
    path.join(root, "content/test-world/notes/sample.md"),
    "---\ntype: place\ntitle: Sample\nvisibility: player\n---\nBody.\n",
    "utf8",
  );
}

function readAtlas(p: string): Atlas {
  return JSON.parse(fs.readFileSync(p, "utf8")) as Atlas;
}

/** Every local audio path the artifact points at (src + srcFallback). */
function audioSrcs(atlas: Atlas): string[] {
  const out: string[] = [];
  for (const m of atlas.maps ?? []) {
    for (const a of m.soundscape?.areas ?? []) {
      out.push(a.bed.src);
      if (a.bed.srcFallback) out.push(a.bed.srcFallback);
    }
  }
  return out.filter((s) => !/^https?:\/\//i.test(s));
}

/** Resolve an artifact audio src the way the browser does: relative to public/. */
function onDisk(src: string): string {
  return path.join(tmpRoot, "public", src);
}

function hashedFiles(): string[] {
  return fs
    .readdirSync(audioDir)
    .filter((n) => /^[0-9a-f]{8}\.[a-z0-9]+$/i.test(n))
    .sort();
}

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-audio-order-"));
  writeVaultWithSoundscape(tmpRoot);
  process.chdir(tmpRoot);
  playerAtlasPath = path.join(tmpRoot, "out", "atlas.json");
  audioDir = path.join(tmpRoot, AUDIO_REL);

  // Step 1 of the repro: the player build publishes the atlas + hashed audio.
  const player = await runBuild({ player: true, strict: true });
  expect(player.ok).toBe(true);
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("player build audio publishing", () => {
  it("rewrites beds to hashed names and writes those files to disk", () => {
    const srcs = audioSrcs(readAtlas(playerAtlasPath));
    expect(srcs.length).toBe(2);
    srcs.forEach((s) => {
      expect(s).toMatch(/^atlas\/assets\/audio\/[0-9a-f]{8}\.[a-z0-9]+$/i);
      expect(fs.existsSync(onDisk(s))).toBe(true);
    });
  });
});

describe("DM build run after a player build", () => {
  it("leaves every audio src in the published atlas present on disk", async () => {
    const before = readAtlas(playerAtlasPath);
    const srcsBefore = audioSrcs(before);
    expect(srcsBefore.length).toBeGreaterThan(0);

    // Step 2 of the repro: the plain DM build. It must not touch the audio
    // the published player atlas depends on.
    const dm = await runBuild({ player: false, strict: false });
    expect(dm.ok).toBe(true);

    // The player atlas is untouched by a DM build (that one goes to
    // .local-atlas), so its refs must all still resolve.
    const after = readAtlas(playerAtlasPath);
    expect(audioSrcs(after)).toEqual(srcsBefore);

    const missing = audioSrcs(after).filter((s) => !fs.existsSync(onDisk(s)));
    expect(missing).toEqual([]);
  });

  it("does not delete any hashed audio file the player build emitted", async () => {
    const before = hashedFiles();
    expect(before.length).toBe(2);

    await runBuild({ player: false, strict: false });

    expect(hashedFiles()).toEqual(before);
  });

  // The discriminating case. With identical content a DM-side prune would
  // re-emit the very same hashes and delete nothing, so it would hide the
  // bug. Here the DM swaps a bed after publishing — the DM's hash set no
  // longer covers what the published atlas points at, which is exactly when
  // a prune scoped to the wrong build eats live player audio.
  it("keeps published audio alive when the DM edits beds after publishing", async () => {
    const worldPath = path.join(tmpRoot, "content/test-world/_atlas/world.yaml");
    const publishedSrcs = audioSrcs(readAtlas(playerAtlasPath));
    const goodYaml = fs.readFileSync(worldPath, "utf8");

    try {
      fs.writeFileSync(
        worldPath,
        goodYaml.replace(
          "src: atlas/assets/audio/cavern.ogg",
          "src: atlas/assets/audio/wind.ogg",
        ),
        "utf8",
      );

      const dm = await runBuild({ player: false, strict: false });
      expect(dm.ok).toBe(true);

      // The published player atlas was not rebuilt, so it still points at the
      // old hashed names. Every one of them must still be on disk.
      const missing = publishedSrcs.filter((s) => !fs.existsSync(onDisk(s)));
      expect(missing).toEqual([]);
    } finally {
      fs.writeFileSync(worldPath, goodYaml, "utf8");
    }
  });

  it("writes its own artifact to .local-atlas, not over the published atlas", async () => {
    await runBuild({ player: false, strict: false });
    expect(fs.existsSync(path.join(tmpRoot, ".local-atlas", "atlas.json"))).toBe(true);
    // Published atlas still carries hashed (anonymised) names, not DM filenames.
    audioSrcs(readAtlas(playerAtlasPath)).forEach((s) => {
      expect(s).toMatch(/^atlas\/assets\/audio\/[0-9a-f]{8}\./i);
    });
  });
});

/**
 * The trigger that actually bit: several suites spawn `build-atlas --player
 * --out <tmp>` from the repo root against a soundscape-free fixture vault.
 * Hashed audio is always written under `<cwd>/public`, so before the prune
 * was scoped those builds pruned the live published audio down to their own
 * fixture's (empty) bed set — deleting all six real files while
 * public/atlas/atlas.json still referenced them.
 */
describe("player build redirected with --out", () => {
  it("does not prune audio belonging to the atlas it is not writing", async () => {
    const worldPath = path.join(tmpRoot, "content/test-world/_atlas/world.yaml");
    const publishedSrcs = audioSrcs(readAtlas(playerAtlasPath));
    const publishedHashed = hashedFiles();
    const goodYaml = fs.readFileSync(worldPath, "utf8");
    expect(publishedHashed.length).toBe(2);

    try {
      // A fixture vault with no soundscape at all — the empty keep-set that
      // made the prune destructive.
      fs.writeFileSync(worldPath, goodYaml.split("    soundscape:")[0], "utf8");

      const redirected = await runBuild({
        player: true,
        strict: false,
        outDir: "scan-fixture-out",
      });
      expect(redirected.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpRoot, "scan-fixture-out", "atlas.json"))).toBe(true);

      // Nothing the published atlas points at may have been removed.
      expect(hashedFiles()).toEqual(publishedHashed);
      const missing = publishedSrcs.filter((s) => !fs.existsSync(onDisk(s)));
      expect(missing).toEqual([]);
    } finally {
      fs.writeFileSync(worldPath, goodYaml, "utf8");
    }
  });

  // Guards the other direction: the fix scopes the prune, it does not
  // disable it. An owner build must still clean up its own orphans.
  it("still prunes orphans when the build owns the default output location", async () => {
    const worldPath = path.join(tmpRoot, "content/test-world/_atlas/world.yaml");
    const goodYaml = fs.readFileSync(worldPath, "utf8");
    const staleHashed = hashedFiles();

    try {
      fs.writeFileSync(
        worldPath,
        goodYaml.replace("src: atlas/assets/audio/cavern.ogg", "src: atlas/assets/audio/wind.ogg"),
        "utf8",
      );

      // No outDir → this build owns public/atlas and republishes it.
      const owner = await runBuild({ player: true, strict: false });
      expect(owner.ok).toBe(true);

      const now = hashedFiles();
      // The bed that is no longer referenced was cleaned up...
      expect(now).not.toEqual(staleHashed);
      // ...and the freshly published atlas still resolves completely.
      const missing = audioSrcs(readAtlas(playerAtlasPath)).filter(
        (s) => !fs.existsSync(onDisk(s)),
      );
      expect(missing).toEqual([]);
    } finally {
      fs.writeFileSync(worldPath, goodYaml, "utf8");
      await runBuild({ player: true, strict: false });
    }
  });
});
