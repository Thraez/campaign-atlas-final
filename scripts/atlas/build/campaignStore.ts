/**
 * Stage: one player store per campaign (R-17, ADR-0004 question 7).
 *
 * A v2 player build writes each campaign to `<outputRoot>/<id>/atlas/`: its
 * `atlas.json`, `search-index.json` and an `assets/` dir holding a copy of
 * every image and audio file that `atlas.json` references, under
 * content-hashed names so no DM file name ships. No asset dir is shared
 * between campaigns, and each campaign's dir is replaced whole on each write
 * (built in a temp sibling, then renamed over), so no file of an earlier
 * build lingers in it.
 *
 * The campaign's must-not-ship set (the resolver's, R-11a) is written beside
 * the store, `<outputRoot>/<id>/must-not-ship.json`, never inside it: the
 * scans read it, the site never serves it.
 *
 * This module plans the copies (`planMapImages`, which bakes each fogged
 * map's fog into its images, R-18; `storeAudioFile`) and
 * writes finished stores (`writeCampaignStores`, which first checks the
 * stores root: `checkStoresRoot`); the build core decides what ships.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AtlasCampaign,
  FogOverlay,
  MapDocument,
  MapLayer,
} from "../../../src/atlas/content/schema";
import { redactLayer } from "../redactFogMap";
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
 *
 * R-18: a map fogged in the campaign (`fog.enabled`, with the campaign's
 * reveals, conceals and feather) never ships its original. Each layer is
 * baked with `redactLayer` into `assets/maps/<sha256>.fog.png` (lossless
 * PNG) and the map keeps only the `{ mapId, enabled }` marker. A fogged
 * layer that can't be baked (external, tiled, rotated, unreadable) is an
 * error, and so is any store file whose bytes are a fogged layer's original
 * (an open map sharing the image would ship it): fail closed.
 */
export async function planMapImages(
  maps: MapDocument[],
  assetDirOf: (worldId: string) => string | undefined,
  files: StoreFiles,
  errors: string[],
): Promise<MapDocument[]> {
  const fogged: { map: string; bytes: Buffer }[] = [];
  const out: MapDocument[] = [];
  for (const m of maps) {
    const fog = m.fog?.enabled ? m.fog : undefined;
    const dir = assetDirOf(m.worldId);
    const layers: MapLayer[] = [];
    for (const layer of m.layers ?? []) {
      const where = `map "${m.id}" layer "${layer.id}"`;
      if (layer.tileSrc) {
        errors.push(`${where}: tiled layers aren't published per campaign yet`);
        layers.push(layer);
        continue;
      }
      if (!layer.src || isExternal(layer.src)) {
        if (fog) errors.push(`${where}: a fogged map's image must be a local file to be redacted`);
        layers.push(layer);
        continue;
      }
      const abs = dir ? fileInside(dir, layer.src) : null;
      if (!abs) {
        errors.push(`${where}: image "${layer.src}" is not inside its world's _atlas folder`);
        layers.push(layer);
        continue;
      }
      let bytes: Buffer;
      try {
        bytes = fs.readFileSync(abs);
      } catch {
        errors.push(`${where}: image "${layer.src}" can't be read`);
        layers.push(layer);
        continue;
      }
      if (!fog) {
        const rel = `${MAPS_DIR}/${hashName(bytes, layer.src, 16)}`;
        files.set(rel, bytes);
        layers.push({ ...layer, src: `${STORE_DIR}/${rel}` });
        continue;
      }
      fogged.push({ map: m.id, bytes });
      let baked: Buffer;
      try {
        baked = await redactLayer(bytes, { width: m.width, height: m.height }, fog, layer);
      } catch (e) {
        errors.push(`${where}: fog can't be baked into "${layer.src}": ${(e as Error).message}`);
        layers.push(layer);
        continue;
      }
      const rel = `${MAPS_DIR}/${hashName(baked, ".fog.png", 16)}`;
      files.set(rel, baked);
      layers.push({ ...layer, src: `${STORE_DIR}/${rel}` });
    }
    const next = m.layers ? { ...m, layers } : { ...m };
    if (fog) next.fog = { mapId: m.id, enabled: true } as FogOverlay;
    out.push(next);
  }
  for (const { map, bytes } of fogged) {
    for (const [rel, held] of files) {
      if (held.equals(bytes)) {
        errors.push(
          `map "${map}": its unfogged image would ship as "${rel}" (fogged in this campaign)`,
        );
      }
    }
  }
  return out;
}

/** `<sha256 prefix><ext>`, the extension lower-cased (`.fog.png` kept whole). */
function hashName(bytes: Buffer, src: string, length: number): string {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, length);
  const ext = src.toLowerCase().endsWith(".fog.png") ? ".fog.png" : path.extname(src).toLowerCase();
  return `${hash}${ext}`;
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
 * The marker file the build puts in a stores root it made. The build deletes
 * only inside a root that has it (or that is new or empty), so `--out` can't
 * point it at a folder of other files.
 */
export const STORES_ROOT_MARKER = ".atlas-campaigns-root";

/** Where a stores root may not be: the repo, its served `public/`, and source folders. */
export interface StoresRootGuard {
  /** The repo root: refused, with every folder above it. */
  repoRoot: string;
  /** `public/`: refused, with everything under it (v1's committed, served output). */
  publicDir: string;
  /** Source folders (`src/`, `scripts/`, the content root): refused, under and above. */
  protectedDirs: string[];
}

/** A campaign id as a dir name: the loader's own rule, checked again where it becomes a path. */
const SAFE_CAMPAIGN_DIR = /^[a-z0-9][a-z0-9_-]*$/i;

/** Case-folded where the disk usually is (macOS, Windows). */
const fold = (p: string) =>
  process.platform === "darwin" || process.platform === "win32" ? p.toLowerCase() : p;

/**
 * `p` with every symlink resolved: the real path of its nearest existing
 * ancestor, plus the parts that don't exist yet.
 */
export function realPathNearest(p: string): string {
  let existing = path.resolve(p);
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(existing), ...rest.reverse());
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return path.resolve(p);
      rest.push(path.basename(existing));
      existing = parent;
    }
  }
}

/** `a` is `b` or inside it (both real paths; case-folded on macOS and Windows). */
function atOrUnder(a: string, b: string): boolean {
  const rel = path.relative(fold(b), fold(a));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Throws unless `outputRoot` may hold campaign stores: not the repo or above
 * it, not at or under `public/`, not at, under or above a source folder (all
 * compared as real paths, so a symlink or a case variant can't get past), and
 * either new, empty or already marked as a stores root.
 */
export function checkStoresRoot(outputRoot: string, guard: StoresRootGuard): void {
  const real = realPathNearest(outputRoot);
  const refuse = (why: string) => {
    throw new Error(`refusing to write campaign stores to ${outputRoot}: ${why}`);
  };
  if (atOrUnder(realPathNearest(guard.repoRoot), real)) refuse("it is the repo or holds it");
  if (atOrUnder(real, realPathNearest(guard.publicDir))) {
    refuse(`it is inside ${guard.publicDir}, which is served`);
  }
  for (const dir of guard.protectedDirs) {
    const d = realPathNearest(dir);
    if (atOrUnder(real, d) || atOrUnder(d, real)) refuse(`it overlaps ${dir}`);
  }
  let entries: string[];
  try {
    if (!fs.statSync(real).isDirectory()) refuse("it is not a folder");
    entries = fs.readdirSync(real);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  if (entries.length > 0 && !entries.includes(STORES_ROOT_MARKER)) {
    refuse(
      `it holds files but no ${STORES_ROOT_MARKER} marker, so it isn't a stores root the build made; empty it or pick another folder`,
    );
  }
}

/**
 * Write every given campaign's store under `outputRoot`, each at
 * `<outputRoot>/<id>/atlas` with its must-not-ship file beside it.
 *
 * Each campaign dir is built whole in a temp sibling, then renamed over the
 * old one, so no file of an earlier build survives in it. A campaign dir that
 * is there but isn't a store (`looksLikeStore`) is refused, before anything
 * is written. With `prune` (a build of every campaign) every other entry of
 * the root that looks like a store, or is a leftover `.tmp-`/`.old-` dir,
 * goes too, so a removed campaign's store doesn't linger; anything else is
 * left and warned about. The root is checked first
 * (`checkStoresRoot`) and marked, and the swap starts only when every temp
 * dir is written. Not atomic across campaigns: a crash during the renames can
 * leave some campaigns new and some old (never a half-written store).
 */
export function writeCampaignStores(
  outputRoot: string,
  guard: StoresRootGuard,
  stores: { campaign: string; store: CampaignStore }[],
  { prune }: { prune: boolean },
): string[] {
  checkStoresRoot(outputRoot, guard);
  for (const { campaign } of stores) {
    if (!SAFE_CAMPAIGN_DIR.test(campaign)) {
      throw new Error(`campaign id ${JSON.stringify(campaign)} can't name a dir`);
    }
  }
  const root = realPathNearest(outputRoot);
  for (const { campaign } of stores) {
    const final = path.join(root, campaign);
    if (exists(final) && !looksLikeStore(final)) {
      throw new Error(
        `refusing to replace ${final}: it isn't a campaign store (no atlas/atlas.json in a real dir)`,
      );
    }
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, STORES_ROOT_MARKER), "");
  const tag = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const staged: { campaign: string; tmp: string }[] = [];
  try {
    for (const { campaign, store } of stores) {
      const tmp = path.join(root, `.tmp-${campaign}-${tag}`);
      staged.push({ campaign, tmp });
      writeStoreInto(campaignStoreDir(path.dirname(tmp), path.basename(tmp)), store);
    }
  } catch (e) {
    for (const { tmp } of staged) fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  for (const { campaign, tmp } of staged) {
    const final = path.join(root, campaign);
    const old = path.join(root, `.old-${campaign}-${tag}`);
    const had = fs.existsSync(final);
    if (had) fs.renameSync(final, old);
    fs.renameSync(tmp, final);
    if (had) fs.rmSync(old, { recursive: true, force: true });
  }
  if (prune) {
    const keep = new Set([STORES_ROOT_MARKER, ...stores.map((s) => s.campaign)]);
    for (const entry of fs.readdirSync(root)) {
      if (keep.has(entry)) continue;
      const full = path.join(root, entry);
      if (looksLikeStore(full) || (/^\.(tmp|old)-/.test(entry) && isRealDir(full))) {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        console.warn(`  ! left ${full} in the campaign stores root: it isn't a campaign store`);
      }
    }
  }
  return stores.map(({ campaign }) => campaignStoreDir(root, campaign));
}

function exists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function isRealDir(p: string): boolean {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** A real dir (not a link) holding `atlas/atlas.json`: what this build writes. */
function looksLikeStore(dir: string): boolean {
  if (!isRealDir(dir) || !isRealDir(path.join(dir, "atlas"))) return false;
  try {
    return fs.lstatSync(path.join(dir, "atlas", "atlas.json")).isFile();
  } catch {
    return false;
  }
}

/** A store's files, JSON and must-not-ship file, into a fresh `storeDir`. */
function writeStoreInto(storeDir: string, store: CampaignStore): void {
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(mustNotShipPath(storeDir), JSON.stringify(store.mustNotShip, null, 2) + "\n");
  for (const [rel, bytes] of store.files) {
    const file = path.join(storeDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  fs.writeFileSync(path.join(storeDir, "atlas.json"), store.atlasJson);
  fs.writeFileSync(path.join(storeDir, "search-index.json"), store.searchIndexJson);
}
