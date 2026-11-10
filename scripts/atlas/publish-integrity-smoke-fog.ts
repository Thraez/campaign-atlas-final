/**
 * Publish integrity smoke, R-18 variants: the fog scan reads a campaign's fog
 * from its campaign file (`check-fog-safety --campaign <id> --publish`), so it
 * catches a v2 store that lost its fog even when the store itself looks clean.
 *
 * A throwaway v2 content root, written here: world `w` with map `m1` (west
 * half revealed in campaign `a`, open in `b`) and child map `city`, whose
 * frame on m1 is under a's fog (ADR-0004 rule 4). The clean half is a
 * hand-made store for `a`; each dirty half must exit with the variant's own
 * code (any other code means a different check caught something):
 *
 *   - m1's fog marker dropped                     -> 26 FOG-MARKER-MISSING
 *   - b's unfogged m1 image in a's store           -> 13 IMAGE-LEAK
 *   - the city's map entry planted back into a     -> 15 IN-FOG-CONTENT
 *   - a fog file keeping m1's colour at alpha 0     -> 27 COLOUR-UNDER-FOG
 *
 * Kept apart from `publish-integrity-smoke.ts`, which runs these through its
 * own harness (passed in, so the scan runs the same way as every variant).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Outcome = "PASS" | "FAIL" | "SKIP" | "ERROR";
interface VariantResult {
  name: string;
  scan: string;
  outcome: Outcome;
  detail: string;
}
type ScanRun = { code: number; stderr: string };

/** The smoke's own helpers. */
export interface SmokeHarness {
  runScan: (scriptRel: string, args: string[]) => ScanRun;
  assertCleanThenDirty: (
    name: string,
    scan: string,
    clean: () => ScanRun,
    dirty: () => ScanRun,
  ) => VariantResult;
  freshDir: (label: string) => string;
}

const SCAN = "check-fog-safety.ts";

const ATLAS_YAML = `schemaVersion: 2
ocean: { width: 1000, height: 1000, sea: default }
worlds: [w]
campaigns: [a, b]
onOcean:
  - { map: m1, x: 0, y: 0, scale: 1, rotation: 0 }
`;

const WORLD_YAML = `schemaVersion: 2
world: { id: w, name: Smoke }
maps:
  - id: m1
    name: Smoke Map
    width: 100
    height: 100
    visibility: player
    scale: { unitsPerPixel: 1, unitLabel: mi }
    zoom: { min: -1, max: 2 }
    layers:
      - { id: base, src: images/m1.png, x: 0, y: 0, width: 100, height: 100 }
  - id: city
    name: Smoke City
    width: 100
    height: 100
    visibility: player
    parent: m1
    frame: { x: 70, y: 10, width: 20, height: 20, rotation: 0 }
    enterZoom: 1
    scale: { unitsPerPixel: 0.1, unitLabel: mi }
    zoom: { min: 0, max: 2 }
    layers: []
`;

const CAMPAIGN_A = `id: a
name: Campaign A
notes: vault
maps:
  m1:
    state: fogged
    reveals:
      - [[0, 0], [50, 0], [50, 100], [0, 100]]
  city:
    state: open
`;

const CAMPAIGN_B = `id: b
name: Campaign B
notes: vault
maps:
  m1: { state: open }
  city: { state: open }
`;

const FOG_FILE = "assets/maps/0123456789abcdef.fog.png";

/** Write the content root and config; returns the config path and m1's original image. */
async function writeContent(root: string): Promise<{ config: string; original: string }> {
  const content = path.join(root, "content");
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(content, rel)), { recursive: true });
    fs.writeFileSync(path.join(content, rel), text);
  };
  write("_atlas/atlas.yaml", ATLAS_YAML);
  write("_atlas/campaigns/a.yaml", CAMPAIGN_A);
  write("_atlas/campaigns/b.yaml", CAMPAIGN_B);
  write("w/_atlas/world.yaml", WORLD_YAML);
  const original = path.join(content, "w", "_atlas", "images", "m1.png");
  fs.mkdirSync(path.dirname(original), { recursive: true });
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 200, g: 40, b: 40, alpha: 1 },
    },
  })
    .png()
    .toFile(original);
  const config = path.join(root, "atlas.config.json");
  fs.writeFileSync(
    config,
    JSON.stringify({ contentRoot: "content", include: ["**/*.md"], exclude: [] }),
  );
  return { config, original };
}

/** a's clean store: m1 redacted (east half transparent), stripped to its marker. */
function cleanAtlas(): Record<string, unknown> & { maps: Record<string, unknown>[] } {
  return {
    campaign: { id: "a", name: "Campaign A" },
    maps: [
      {
        id: "m1",
        width: 100,
        height: 100,
        layers: [{ id: "base", src: `atlas/${FOG_FILE}`, x: 0, y: 0, width: 100, height: 100 }],
        fog: { mapId: "m1", enabled: true },
      },
    ],
    placements: [],
  };
}

export async function variantsCampaignFog(h: SmokeHarness): Promise<VariantResult[]> {
  const root = h.freshDir("campaign-fog");
  const { config, original } = await writeContent(root);
  const redacted = await sharp({
    create: { width: 50, height: 100, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } },
  })
    .extend({ right: 50, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // m1's colour kept everywhere, alpha 0 in the fogged east half: looks
  // redacted, but stripping alpha shows the fogged image.
  const raw = Buffer.alloc(100 * 100 * 4);
  for (let i = 0; i < 100 * 100; i++) raw.set([200, 40, 40, i % 100 < 50 ? 255 : 0], i * 4);
  const hidden = await sharp(raw, { raw: { width: 100, height: 100, channels: 4 } })
    .png()
    .toBuffer();

  let n = 0;
  const plant = (
    atlas: Record<string, unknown>,
    extra: Record<string, string | Buffer> = {},
  ): string => {
    const dir = path.join(root, `store-${n++}`, "atlas");
    fs.mkdirSync(path.join(dir, "assets", "maps"), { recursive: true });
    fs.writeFileSync(path.join(dir, "atlas.json"), JSON.stringify(atlas));
    fs.writeFileSync(path.join(dir, FOG_FILE), redacted);
    for (const [rel, bytes] of Object.entries(extra)) fs.writeFileSync(path.join(dir, rel), bytes);
    return dir;
  };
  const scan = (dir: string) =>
    h.runScan(SCAN, [dir, "--config", config, "--campaign", "a", "--publish"]);
  /** The dirty half passes only on its own code. */
  const expect = (code: number, r: ScanRun): ScanRun =>
    r.code === code || r.code < 0
      ? r
      : { code: 0, stderr: `exit ${r.code}, not ${code}\n${r.stderr}` };

  return [
    h.assertCleanThenDirty(
      "Campaign fog: marker dropped (26)",
      SCAN,
      () => scan(plant(cleanAtlas())),
      () => {
        const atlas = cleanAtlas();
        delete atlas.maps[0].fog;
        return expect(26, scan(plant(atlas)));
      },
    ),
    h.assertCleanThenDirty(
      "Campaign fog: other campaign's unfogged image (13)",
      SCAN,
      () => scan(plant(cleanAtlas())),
      () =>
        expect(
          13,
          scan(
            plant(cleanAtlas(), { "assets/maps/fedcba9876543210.png": fs.readFileSync(original) }),
          ),
        ),
    ),
    h.assertCleanThenDirty(
      "Campaign fog: frame-fogged city planted back (15)",
      SCAN,
      () => scan(plant(cleanAtlas())),
      () => {
        const atlas = cleanAtlas();
        atlas.maps.push({ id: "city", parent: "m1", width: 100, height: 100, layers: [] });
        return expect(15, scan(plant(atlas)));
      },
    ),
    h.assertCleanThenDirty(
      "Campaign fog: colour kept under alpha 0 (27)",
      SCAN,
      () => scan(plant(cleanAtlas())),
      () => {
        return expect(27, scan(plant(cleanAtlas(), { [FOG_FILE]: hidden })));
      },
    ),
  ];
}
