/**
 * Comparing two player builds of the same content (R-20 `--check`): a v1
 * build of the original and a v2 build of its migrated copy, or a v1 build of
 * the round trip. The migration must change nothing a player sees, so the
 * outputs must be equal apart from the differences listed here, in one place.
 *
 * Asset files are compared by their bytes, not their names: every string in
 * an output that names an asset file is replaced by `asset:<sha256>` of the
 * file it names (v1 reads them from `public/` and its fog masks and hashed
 * audio, v2 from the campaign's store). A name that resolves to no file is
 * kept as `asset-missing:<name>`, so it shows as a difference unless both
 * sides miss the same file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { BuildAtlasResult } from "../../build-atlas";

/**
 * Everything a v2 build of migrated content may say differently from the v1
 * build of the original (ADR-0003 "Versions", R-20). Nothing else may differ.
 */
export const ALLOWED_DIFFERENCES = {
  /** Top-level `atlas.json` keys: build stamps, the version, the ocean and the campaign's own id/name. */
  atlas: ["version", "publishedAt", "schemaVersion", "ocean", "campaign"],
  /** Keys of each map in `atlas.json.maps`: v2's map nesting. */
  map: ["parent", "frame", "enterZoom"],
} as const;

/**
 * Forms that say the same thing to a player, made equal before comparing;
 * not differences, since each side renders the same:
 * - `secrets`: an encrypted secret's salt, iv and ciphertext are random per
 *   build; compared by the ciphertext's length (the plaintext's).
 * - `disabledFog`: a map fog that is off and reveals nothing (v1 ships it,
 *   v2 says "open") is no fog.
 * - `pinOrder`: placements are a set; v2 lists them by map, v1 by note.
 */
export const EQUIVALENT_FORMS = ["secrets", "disabledFog", "pinOrder"] as const;

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/** A string in an output that names an asset file. */
const isAssetRef = (s: string) => /^(?:atlas\/)?assets\/[^\s]+$/.test(s);

/** Bytes for an asset name, from a build's planned output; undefined when none. */
export type AssetResolver = (ref: string) => Buffer | undefined;

/** v1 build: fog masks and hashed audio it plans, else the file in `public/`. */
export function v1Assets(build: BuildAtlasResult): AssetResolver {
  const pub = build.assets.publicDir;
  const planned = new Map<string, Buffer>();
  for (const f of build.assets.fog?.files ?? []) planned.set(path.resolve(f.path), f.bytes);
  for (const c of build.assets.audio?.copies ?? []) planned.set(path.resolve(c.path), c.bytes);
  return (ref) => {
    const clean = ref.replace(/[?#].*$/, "");
    const abs = path.resolve(pub, clean);
    if (path.relative(pub, abs).startsWith("..")) return undefined;
    const p = planned.get(abs);
    if (p) return p;
    return fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs) : undefined;
  };
}

/** v2 player build: the campaign store's files (`atlas/` is the store's site path). */
export function v2Assets(build: BuildAtlasResult): AssetResolver {
  const files = build.store?.files ?? new Map<string, Buffer>();
  return (ref) => {
    const clean = ref.replace(/[?#].*$/, "");
    return files.get(clean) ?? files.get(clean.replace(/^atlas\//, ""));
  };
}

/** `value` with every asset name replaced by its bytes' hash; `used` collects the hashes. */
export function normalizeAssets(
  value: unknown,
  resolve: AssetResolver,
  used: Set<string>,
): unknown {
  if (typeof value === "string") {
    if (!isAssetRef(value)) return value;
    const bytes = resolve(value);
    if (!bytes) return `asset-missing:${value}`;
    const h = sha(bytes);
    used.add(h);
    return `asset:${h}`;
  }
  if (Array.isArray(value)) return value.map((v) => normalizeAssets(v, resolve, used));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeAssets(v, resolve, used);
    return out;
  }
  return value;
}

/** As written to disk: JSON drops undefined keys. */
const asWritten = (v: unknown): unknown => JSON.parse(JSON.stringify(v)) as unknown;

/** Each secret's random fields as `<random>`, the ciphertext as its length. */
function maskSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(maskSecrets);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if ((k === "salt" || k === "iv") && typeof x === "string") out[k] = "<random>";
    else if (k === "ciphertext" && typeof x === "string") out[k] = `<random:${x.length}>`;
    else out[k] = maskSecrets(x);
  }
  return out;
}

/** `atlas.json` as written, without the allowed differences, in its equivalent forms. */
function withoutAllowed(project: unknown): unknown {
  const p = maskSecrets(asWritten(project)) as Record<string, unknown>;
  for (const k of ALLOWED_DIFFERENCES.atlas) delete p[k];
  if (Array.isArray(p.maps)) {
    p.maps = p.maps.map((m: Record<string, unknown>) => {
      const c = { ...m };
      for (const k of ALLOWED_DIFFERENCES.map) delete c[k];
      const fog = c.fog as { enabled?: unknown; reveals?: unknown[] } | undefined;
      if (fog && fog.enabled === false && (fog.reveals ?? []).length === 0) delete c.fog;
      return c;
    });
  }
  if (Array.isArray(p.placements)) {
    p.placements = p.placements
      .map((x: unknown) => [JSON.stringify(x), x] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, x]) => x);
  }
  return p;
}

/** Paths where `a` and `b` differ, at most `cap` of them. */
export function diffPaths(a: unknown, b: unknown, at = "", out: string[] = [], cap = 40): string[] {
  if (out.length >= cap || isDeepStrictEqual(a, b)) return out;
  const isObj = (v: unknown) => v !== null && typeof v === "object";
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${at || "."}: length ${a.length} -> ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++)
      diffPaths(a[i], b[i], `${at}[${i}]`, out, cap);
    return out;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      const p = at ? `${at}.${k}` : k;
      if (!(k in bo)) out.push(`${p}: only in the original`);
      else if (!(k in ao)) out.push(`${p}: only in the migrated`);
      else diffPaths(ao[k], bo[k], p, out, cap);
    }
    return out;
  }
  const show = (v: unknown) => {
    const s = JSON.stringify(v) ?? String(v);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  };
  out.push(`${at || "."}: ${show(a)} -> ${show(b)}`);
  return out;
}

export interface OutputComparison {
  /** Empty when the outputs match apart from `ALLOWED_DIFFERENCES`. */
  differences: string[];
}

/**
 * Compare two player builds: `atlas.json` (less the allowed differences),
 * `search-index.json`, and the set and bytes of the asset files each ships.
 */
export function comparePlayerOutputs(
  original: BuildAtlasResult,
  originalAssets: AssetResolver,
  migrated: BuildAtlasResult,
  migratedAssets: AssetResolver,
  /** Every asset file the migrated build ships (v2: the store); default: the ones it names. */
  migratedShipped?: Iterable<Buffer>,
): OutputComparison {
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const a = normalizeAssets(withoutAllowed(original.project), originalAssets, usedA);
  const b = normalizeAssets(withoutAllowed(migrated.project), migratedAssets, usedB);
  const differences = diffPaths(a, b).map((d) => `atlas.json ${d}`);
  const sa = normalizeAssets(asWritten(original.searchIndex), originalAssets, usedA);
  const sb = normalizeAssets(asWritten(migrated.searchIndex), migratedAssets, usedB);
  differences.push(...diffPaths(sa, sb).map((d) => `search-index.json ${d}`));
  const shipped = migratedShipped ? new Set([...migratedShipped].map(sha)) : usedB;
  const onlyA = [...usedA].filter((h) => !shipped.has(h));
  const onlyB = [...shipped].filter((h) => !usedA.has(h));
  for (const h of onlyA) differences.push(`asset ${h.slice(0, 16)}: only in the original`);
  for (const h of onlyB) differences.push(`asset ${h.slice(0, 16)}: only in the migrated`);
  return { differences };
}

/** Ids of everything a DM build holds, one `kind:id` each. */
export function dmItems(build: BuildAtlasResult): Set<string> {
  const out = new Set<string>();
  const p = build.project as unknown as {
    entities?: { id: string }[];
    maps?: {
      id: string;
      regions?: { id: string }[];
      routes?: { id: string }[];
      soundscape?: { areas?: { id?: string }[] };
    }[];
    placements?: { entityId: string; mapId: string; x: number; y: number }[];
  };
  for (const e of p.entities ?? []) out.add(`entity:${e.id}`);
  for (const m of p.maps ?? []) {
    out.add(`map:${m.id}`);
    for (const r of m.regions ?? []) out.add(`region:${m.id}/${r.id}`);
    for (const r of m.routes ?? []) out.add(`route:${m.id}/${r.id}`);
    for (const a of m.soundscape?.areas ?? []) out.add(`sound:${m.id}/${a.id ?? "?"}`);
  }
  for (const pl of p.placements ?? []) out.add(`pin:${pl.entityId}@${pl.mapId}:${pl.x},${pl.y}`);
  return out;
}
