/**
 * Stage: one player store per campaign (R-17, ADR-0004 question 7).
 *
 * A v2 player build writes each campaign to `<outputRoot>/<id>/atlas/`: its
 * `atlas.json`, `search-index.json` and an `assets/` dir holding a copy of
 * every image and audio file that `atlas.json` references, under
 * content-hashed names so no DM file name ships. No asset dir is shared
 * between campaigns, and a store's `assets/` is replaced on each write, so a
 * file a campaign stops showing never lingers in it.
 *
 * The campaign's must-not-ship set (the resolver's, R-11a) is written beside
 * the store, `<outputRoot>/<id>/must-not-ship.json`, never inside it: the
 * scans read it, the site never serves it.
 *
 * This module plans the copies (`planMapImages`, `storeAudioFiles`) and
 * writes a finished store (`writeCampaignStore`); the build core decides what
 * ships.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AtlasCampaign, MapDocument } from "../../../src/atlas/content/schema";
import type { MustNotShip } from "../../../src/atlas/content/resolveCampaign";

/** The store's dir name under a campaign's dir. */
export const STORE_DIR = "atlas";
/** The must-not-ship file's name, in the campaign's dir beside the store. */
export const MUST_NOT_SHIP_FILE = "must-not-ship.json";
/** Where copied map images go, relative to the store (and `atlas/` on the site). */
const MAPS_DIR = "assets/maps";

/** `<outputRoot>/<campaign>/atlas`. */
export function campaignStoreDir(outputRoot: string, campaign: string): string {
  return path.join(outputRoot, campaign, STORE_DIR);
}

/** The must-not-ship file of the store at `storeDir`: beside it, never in it. */
export function mustNotShipPath(storeDir: string): string {
  return path.join(path.dirname(storeDir), MUST_NOT_SHIP_FILE);
}

/** What `must-not-ship.json` holds: the resolver's set, and the campaigns this output must not name. */
export interface MustNotShipFile extends MustNotShip {
  campaign: string;
  /** Every other campaign of the content: none of them may be named in this output. */
  otherCampaigns: AtlasCampaign[];
}

/** Read a store's must-not-ship file. Throws when it is missing or malformed (fail closed). */
export function readMustNotShip(file: string): MustNotShipFile {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<MustNotShipFile>;
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (
    !parsed ||
    typeof parsed.campaign !== "string" ||
    !strings(parsed.ids) ||
    !strings(parsed.names) ||
    !strings(parsed.paths) ||
    !Array.isArray(parsed.pinLocations) ||
    !Array.isArray(parsed.otherCampaigns)
  ) {
    throw new Error(`${file}: not a must-not-ship file`);
  }
  return parsed as MustNotShipFile;
}

/** A file in the store: its path relative to the store (posix) and its bytes. */
export type StoreFiles = Map<string, Buffer>;

/**
 * `rel` resolved against `dir`, or null when it escapes `dir` (`..`, an
 * absolute path): a store copies only files inside the world's `_atlas/`.
 */
export function fileInside(dir: string, rel: string): string | null {
  if (path.isAbsolute(rel) || /^[a-z][a-z0-9+.-]*:/i.test(rel)) return null;
  const abs = path.resolve(dir, rel);
  const back = path.relative(path.resolve(dir), abs);
  if (back === "" || back.startsWith("..") || path.isAbsolute(back)) return null;
  return abs;
}

const isExternal = (src: string) => /^(https?:|data:|blob:)/i.test(src);

/**
 * Map layers with their images copied into the store: each local `src`
 * (relative to its world's `_atlas/`) becomes `atlas/assets/maps/<sha256>.<ext>`,
 * the bytes copied as they are (maps stay lossless). A layer whose image is
 * outside `_atlas/`, unreadable, or tiled (`tileSrc`, not published per
 * campaign yet) is an error: the store must hold every file its atlas names.
 * External URLs are left as written.
 */
export function planMapImages(
  maps: MapDocument[],
  assetDirOf: (worldId: string) => string | undefined,
  files: StoreFiles,
  errors: string[],
): MapDocument[] {
  return maps.map((m) => {
    if (!m.layers?.length) return m;
    const dir = assetDirOf(m.worldId);
    const layers = m.layers.map((layer) => {
      if (layer.tileSrc) {
        errors.push(
          `map "${m.id}" layer "${layer.id}": tiled layers aren't published per campaign yet`,
        );
        return layer;
      }
      if (!layer.src || isExternal(layer.src)) return layer;
      const abs = dir ? fileInside(dir, layer.src) : null;
      if (!abs) {
        errors.push(
          `map "${m.id}" layer "${layer.id}": image "${layer.src}" is not inside its world's _atlas folder`,
        );
        return layer;
      }
      let bytes: Buffer;
      try {
        bytes = fs.readFileSync(abs);
      } catch {
        errors.push(`map "${m.id}" layer "${layer.id}": image "${layer.src}" can't be read`);
        return layer;
      }
      const rel = `${MAPS_DIR}/${hashName(bytes, layer.src, 16)}`;
      files.set(rel, bytes);
      return { ...layer, src: `${STORE_DIR}/${rel}` };
    });
    return { ...m, layers };
  });
}

/** `<sha256 prefix><ext>`, the extension lower-cased. */
function hashName(bytes: Buffer, src: string, length: number): string {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, length);
  return `${hash}${path.extname(src).toLowerCase()}`;
}

/**
 * Put a planned audio copy (`<anything>/atlas/assets/audio/<hash>.<ext>`) in
 * the store as `assets/audio/<hash>.<ext>`.
 */
export function storeAudioFile(files: StoreFiles, copyPath: string, bytes: Buffer): void {
  files.set(`assets/audio/${path.basename(copyPath)}`, bytes);
}

export interface CampaignStore {
  atlasJson: string;
  searchIndexJson: string;
  files: StoreFiles;
  mustNotShip: MustNotShipFile;
}

/**
 * Write a campaign's store at `storeDir` and its must-not-ship file beside it.
 * The store's `assets/` is removed and rewritten whole. Refuses a store inside
 * `publicDir` (v1's committed, served `public/`): a campaign's output never
 * goes where another output is served from.
 */
export function writeCampaignStore(
  storeDir: string,
  publicDir: string,
  store: CampaignStore,
): void {
  const back = path.relative(path.resolve(publicDir), path.resolve(storeDir));
  if (back === "" || (!back.startsWith("..") && !path.isAbsolute(back))) {
    throw new Error(`refusing to write a campaign store inside ${publicDir}: ${storeDir}`);
  }
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(mustNotShipPath(storeDir), JSON.stringify(store.mustNotShip, null, 2) + "\n");
  const assetsDir = path.join(storeDir, "assets");
  fs.rmSync(assetsDir, { recursive: true, force: true });
  for (const [rel, bytes] of store.files) {
    const file = path.join(storeDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  fs.writeFileSync(path.join(storeDir, "atlas.json"), store.atlasJson);
  fs.writeFileSync(path.join(storeDir, "search-index.json"), store.searchIndexJson);
}
