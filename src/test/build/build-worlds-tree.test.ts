// @vitest-environment node
/**
 * R-13: the build assembles every world and the map tree from the model.
 * Built in process from a temp copy of the v2 test world (`content-next/`):
 * quessaly (quessaly-world > oskmark > brindlecross, tallowford) and skerrow
 * (skerrow-isles > hookhaven), campaigns `main` and `sandbox`.
 *
 * - main ships both worlds, the tree (parent, frame, enterZoom), the ocean,
 *   and every map's pins and regions on the right map id.
 * - sandbox hides skerrow (rule 5): absent from worlds, ocean, maps,
 *   entities and the search index, and named in must-not-ship.
 * - A rule-8 collision fails a strict v2 build (exit 10), naming both items.
 * - A note that says `player` but ships to no campaign warns, DM-side only.
 * - An `atlas.world` that disagrees with the note's folder warns; the folder wins.
 * - R-11c: sound-area ids are checked on every world's maps.
 * - Character keys are per world; v2 world.yaml, model and hidden worlds'
 *   key-file warnings stay out of the player report.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAtlas } from "../../../scripts/build-atlas";
import { decryptSecret, type SecretBlob } from "@/atlas/secrets/secretCrypto";

const ROOT = path.resolve(__dirname, "../../..");
const tmps: string[] = [];
afterEach(() => {
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});

/** A temp root holding `content-next/` and its config as `atlas.config.json`. */
function testWorld(): { root: string; edit: (rel: string, from: string, to: string) => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r13-"));
  tmps.push(root);
  fs.cpSync(path.join(ROOT, "content-next"), path.join(root, "content-next"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "atlas.next.config.json"), path.join(root, "atlas.config.json"));
  const edit = (rel: string, from: string, to: string) => {
    const file = path.join(root, "content-next", rel);
    const text = fs.readFileSync(file, "utf8");
    expect(text, `${rel} holds ${JSON.stringify(from)}`).toContain(from);
    fs.writeFileSync(file, text.replace(from, to));
  };
  return { root, edit };
}

/** Writes a file under the temp root's content folder. */
function put(root: string, rel: string, body: string) {
  const file = path.join(root, "content-next", rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

const player = (campaign: string) => ({ player: true, strict: true, campaign });
const shipped = (r: Awaited<ReturnType<typeof buildAtlas>>) =>
  JSON.stringify(r.project) + JSON.stringify(r.searchIndex);

describe("R-13: every world and the map tree", () => {
  it("main ships both worlds, the tree, the ocean, and pins and regions on their own maps", async () => {
    const { root } = testWorld();
    const { project, report } = await buildAtlas(root, player("main"));
    expect(report.failure).toBeUndefined();

    expect(project.worlds.map((w) => w.id)).toEqual(["quessaly", "skerrow"]);
    expect(project.worlds.find((w) => w.id === "skerrow")?.name).toBe("The Skerrow Isles");

    const map = (id: string) => project.maps.find((m) => m.id === id);
    expect(project.maps.map((m) => m.id).sort()).toEqual([
      "brindlecross",
      "hookhaven",
      "oskmark",
      "quessaly-world",
      "skerrow-isles",
      "tallowford",
    ]);
    expect(map("quessaly-world")?.parent).toBeUndefined();
    expect(map("oskmark")).toMatchObject({ parent: "quessaly-world", enterZoom: 1 });
    expect(map("oskmark")?.frame).toBeDefined();
    expect(map("brindlecross")).toMatchObject({ parent: "oskmark", enterZoom: 2 });
    expect(map("hookhaven")).toMatchObject({
      parent: "skerrow-isles",
      enterZoom: 2,
      frame: { x: 300, y: 300, width: 60, height: 60, rotation: 0 },
    });

    expect(project.ocean).toMatchObject({ width: 3000, height: 2000, sea: "default" });
    expect(project.ocean?.onOcean.map((o) => o.map)).toEqual(["quessaly-world", "skerrow-isles"]);

    const region = (id: string) => map("quessaly-world")?.regions?.find((r) => r.id === id);
    expect(region("saltmeadow")).toBeDefined();
    expect(map("skerrow-isles")?.regions?.map((r) => r.id)).toEqual(["gannet-rock"]);
    expect(map("quessaly-world")?.regions?.some((r) => r.id === "gannet-rock")).toBe(false);

    const pinMap = (entityId: string) =>
      project.placements.filter((p) => p.entityId === entityId).map((p) => p.mapId);
    expect(pinMap("the-tide-warden")).toEqual(["hookhaven"]);
    expect(pinMap("gilda-moth")).toEqual(["brindlecross"]);
    expect(pinMap("pellam-ferry")).toEqual(["tallowford"]);
    expect(pinMap("haskel-thimbleby")).toEqual(["oskmark"]);

    const world = (id: string) => project.entities.find((e) => e.id === id)?.world;
    expect(world("the-tide-warden")).toBe("skerrow");
    expect(world("gilda-moth")).toBe("quessaly");

    // The note bodies mention sandbox; the build itself must not name it.
    expect(JSON.stringify(project.buildReport)).not.toContain("sandbox");
  });

  it("sandbox: the hidden skerrow world is absent everywhere and named in must-not-ship", async () => {
    const { root, edit } = testWorld();
    // Read notes as the vault says, so only the hidden world keeps the-tide-warden out.
    edit("_atlas/campaigns/sandbox.yaml", "notes: hidden", "notes: vault");
    const r = await buildAtlas(root, player("sandbox"));
    expect(r.report.failure).toBeUndefined();

    expect(r.project.worlds.map((w) => w.id)).toEqual(["quessaly"]);
    expect(r.project.ocean?.onOcean.map((o) => o.map)).toEqual(["quessaly-world"]);
    expect(r.project.maps.map((m) => m.id)).not.toContain("hookhaven");
    expect(r.project.entities.map((e) => e.id)).not.toContain("the-tide-warden");
    expect(r.searchIndex.map((e) => e.id)).not.toContain("the-tide-warden");
    // Another note still ships, so the hidden world is what kept the warden out.
    expect(r.project.entities.map((e) => e.id)).toContain("pellam-ferry");

    const out = shipped(r);
    for (const leak of ["skerrow", "Skerrow", "Hookhaven", "hookhaven", "Gannet", "Tide Warden"]) {
      expect(out, leak).not.toContain(leak);
    }
    expect(out).not.toContain("Lantern Road");

    const mns = r.report.mustNotShip!;
    expect(mns.ids).toEqual(
      expect.arrayContaining(["skerrow", "skerrow-isles", "hookhaven", "the-tide-warden"]),
    );
    expect(mns.names).toEqual(
      expect.arrayContaining(["The Skerrow Isles", "Hookhaven", "The Tide Warden"]),
    );
  });

  it("a rule-8 collision fails a strict v2 build with exit 10, naming both items", async () => {
    const { root, edit } = testWorld();
    // saltmeadow ships to sandbox under the name of skerrow's hidden region.
    edit("quessaly/_atlas/world.yaml", "name: Saltmeadow", "name: Gannet Rock");
    const { report } = await buildAtlas(root, player("sandbox"));
    expect(report.failure?.exitCode).toBe(10);
    expect(report.failure?.message).toContain("saltmeadow");
    expect(report.failure?.message).toContain("gannet-rock");
  });

  it("a note that says player but ships to no campaign warns, hidden from players", async () => {
    const { root } = testWorld();
    const { project, report } = await buildAtlas(root, player("main"));
    const line = report.warnings.find((w) => w.includes('note "wexley-tarn"'));
    expect(line).toMatch(/ships to no campaign/);
    expect(project.buildReport?.warnings ?? []).not.toContain(line);
    expect(JSON.stringify(project)).not.toContain("ships to no campaign");
  });

  it("the folder sets a note's world; a disagreeing atlas.world warns, DM-side only", async () => {
    const { root, edit } = testWorld();
    edit("quessaly/places/pellam-ferry.md", "atlas:\n", "atlas:\n  world: skerrow\n");
    const { project, report } = await buildAtlas(root, player("main"));
    expect(report.failure).toBeUndefined();
    expect(project.entities.find((e) => e.id === "pellam-ferry")?.world).toBe("quessaly");
    const line = report.warnings.find((w) => w.includes('atlas.world "skerrow"'));
    expect(line).toContain("pellam-ferry");
    expect(project.buildReport?.warnings ?? []).not.toContain(line);
  });

  it("R-11c: sound-area ids are checked on every world's maps", async () => {
    const { root, edit } = testWorld();
    edit(
      "skerrow/_atlas/world.yaml",
      "    regions:\n      - id: gannet-rock",
      [
        "    sound:",
        "      - { id: surf, name: Surf, points: [[0, 0], [50, 0], [50, 50]], visibility: player, bed: { src: audio/surf.ogg } }",
        "      - { id: surf, name: Surf Two, points: [[60, 0], [90, 0], [90, 50]], visibility: player, bed: { src: audio/surf.ogg } }",
        "    regions:",
        "      - id: gannet-rock",
      ].join("\n"),
    );
    const { report } = await buildAtlas(root, player("main"));
    expect(report.soundAreaIdProblems.join("\n")).toContain('map "skerrow-isles"');
    expect(report.failure?.exitCode).toBe(22);
  });

  it("character keys are per world: each world's secrets use its own key", async () => {
    const { root, edit } = testWorld();
    put(root, "quessaly/_dm/character-keys.yaml", "Bob: quessaly-bob-key\n");
    put(root, "skerrow/_dm/character-keys.yaml", "Bob: skerrow-bob-key\n");
    const secret = (id: string, reveal: string) =>
      `atlas:\n  secrets:\n    - id: ${id}\n      for: Bob\n      reveal: ${reveal}\n`;
    edit("quessaly/npcs/gilda-moth.md", "atlas:\n", secret("q-bob", "quessaly reveal"));
    edit("skerrow/npcs/the-tide-warden.md", "atlas:\n", secret("s-bob", "skerrow reveal"));
    const { project, report } = await buildAtlas(root, player("main"));
    expect(report.failure).toBeUndefined();
    const blob = (entity: string, id: string) =>
      project.entities.find((e) => e.id === entity)?.secrets?.find((s) => s.id === id) as
        SecretBlob | undefined;
    const q = blob("gilda-moth", "q-bob");
    const s = blob("the-tide-warden", "s-bob");
    expect(await decryptSecret(q!, "quessaly-bob-key")).toBe("quessaly reveal");
    expect(await decryptSecret(s!, "skerrow-bob-key")).toBe("skerrow reveal");
    await expect(decryptSecret(q!, "skerrow-bob-key")).resolves.toBeNull();
    await expect(decryptSecret(s!, "quessaly-bob-key")).resolves.toBeNull();
    const line = report.warnings.find((w) => w.includes('character key "Bob"'));
    expect(line).toContain('"quessaly", "skerrow"');
    expect(project.buildReport?.warnings ?? []).not.toContain(line);
  });

  it("v2 world.yaml and model warnings stay out of the player report", async () => {
    const { root, edit } = testWorld();
    edit(
      "skerrow/_atlas/world.yaml",
      "        visibility: player\n",
      "        visibility: bogus\n",
    );
    edit("_atlas/campaigns/main.yaml", "notes: vault\n", "");
    const { project, report } = await buildAtlas(root, player("main"));
    const shippedWarnings = project.buildReport?.warnings ?? [];
    expect(report.warnings.some((w) => w.includes("skerrow/_atlas/world.yaml"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("campaigns/main.yaml"))).toBe(true);
    expect(shippedWarnings).toHaveLength(1);
    expect(shippedWarnings[0]).toMatch(/world\.yaml warnings? hidden in the player build/);
    const text = shippedWarnings.join("\n");
    for (const leak of ["world.yaml:", "main.yaml", "gannet-rock", "skerrow", "bogus"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("key-file warnings of a hidden world stay out of the player report", async () => {
    const { root } = testWorld();
    put(root, "skerrow/_dm/character-keys.yaml", "Bob: [unclosed\n");
    put(root, "_dm/character-keys.yaml", "Bob: legacy\n");
    const sandbox = await buildAtlas(root, player("sandbox"));
    expect(sandbox.report.failure).toBeUndefined();
    const dmSide = sandbox.report.warnings.join("\n");
    expect(dmSide).toContain("skerrow/_dm/character-keys.yaml: it isn't valid YAML");
    expect(dmSide).toContain("_dm/character-keys.yaml is ignored");
    expect(JSON.stringify(sandbox.project)).not.toContain("character-keys");
    expect(shipped(sandbox)).not.toContain("skerrow");
    // main ships both worlds, so its player report still names the files.
    const main = await buildAtlas(root, player("main"));
    expect((main.project.buildReport?.warnings ?? []).join("\n")).toContain(
      "skerrow/_dm/character-keys.yaml",
    );
  });
});
