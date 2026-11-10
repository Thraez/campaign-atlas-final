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
import { decryptSecret, type SecretBlob } from "../../../src/atlas/secrets/secretCrypto";
import { V1_CAMPAIGN_ID, V1_CAMPAIGN_NAME } from "../../../src/atlas/content/v1Model";

/**
 * Everything a v2 build of migrated content may say differently from the v1
 * build of the original (ADR-0003 "Versions", R-20), each only in the form
 * `allowedViolations` checks. Nothing else may differ; v2's map nesting
 * (`parent`, `frame`, `enterZoom`) is compared like any key, so a migrated
 * map that has one is a difference.
 */
export const ALLOWED_DIFFERENCES = {
  /**
   * Top-level `atlas.json` keys: build stamps and the version; the ocean,
   * whose `onOcean` may place only maps the output ships; the campaign,
   * exactly `EXPECTED_CAMPAIGN`.
   */
  atlas: ["version", "publishedAt", "schemaVersion", "ocean", "campaign"],
} as const;

/** The one campaign a migrated output may name: v1's. */
export const EXPECTED_CAMPAIGN = { id: V1_CAMPAIGN_ID, name: V1_CAMPAIGN_NAME } as const;

/** Where an output uses an allowed difference in a form it may not. */
export function allowedViolations(project: unknown, label: string): string[] {
  const p = asWritten(project) as Record<string, unknown>;
  const out: string[] = [];
  if (p.campaign !== undefined && !isDeepStrictEqual(p.campaign, EXPECTED_CAMPAIGN)) {
    out.push(`${label} atlas.json campaign: ${JSON.stringify(p.campaign)} is not "main"/"Main"`);
  }
  if (p.ocean !== undefined) {
    const shipped = new Set(
      (Array.isArray(p.maps) ? p.maps : []).map((m: { id?: unknown }) => m.id),
    );
    const ocean = p.ocean as { onOcean?: { map?: unknown }[] };
    if (!Array.isArray(ocean.onOcean)) out.push(`${label} atlas.json ocean.onOcean: missing`);
    for (const o of ocean.onOcean ?? []) {
      if (!shipped.has(o.map)) {
        out.push(`${label} atlas.json ocean.onOcean: "${String(o.map)}" is not a map it ships`);
      }
    }
  }
  return out;
}

/**
 * Forms that say the same thing to a player, made equal before comparing;
 * not differences, since each side renders the same:
 * - `secrets`: an encrypted secret's salt, iv and ciphertext are random per
 *   build, so the JSON comparison masks all three; `compareSecrets` decrypts
 *   both sides with the configured keys and compares the plaintext.
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
    if ((k === "salt" || k === "iv" || k === "ciphertext") && typeof x === "string") {
      out[k] = "<encrypted>";
    } else {
      out[k] = maskSecrets(x);
    }
  }
  return out;
}

/** A placement's key in `pinStyle:` drops (`MigrationPlan.dropped`). */
const pinKey = (x: { entityId?: unknown; mapId?: unknown; x?: unknown; y?: unknown }) =>
  `pinStyle:${String(x.entityId)}@${String(x.mapId)}:${String(x.x)},${String(x.y)}`;

/** `atlas.json` as written, without the allowed differences, in its equivalent forms. */
function withoutAllowed(project: unknown, pinStyleDrops: ReadonlySet<string>): unknown {
  const p = maskSecrets(asWritten(project)) as Record<string, unknown>;
  for (const k of ALLOWED_DIFFERENCES.atlas) delete p[k];
  if (Array.isArray(p.maps)) {
    p.maps = p.maps.map((m: Record<string, unknown>) => {
      const c = { ...m };
      const fog = c.fog as { enabled?: unknown; reveals?: unknown[] } | undefined;
      if (fog && fog.enabled === false && (fog.reveals ?? []).length === 0) delete c.fog;
      return c;
    });
  }
  if (Array.isArray(p.placements)) {
    p.placements = p.placements
      .map((x: Record<string, unknown>) => {
        if (!pinStyleDrops.has(pinKey(x))) return x;
        // A declared drop (--allow-drop-pin-style): the label and style go.
        const { label: _l, pin: _p, ...rest } = x;
        return rest;
      })
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
  /** Declared `pinStyle:` drops: these placements' label and style aren't compared. */
  dropped: Iterable<string> = [],
): OutputComparison {
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const drops = new Set([...dropped].filter((d) => d.startsWith("pinStyle:")));
  const differences = [
    ...allowedViolations(original.project, "original"),
    ...allowedViolations(migrated.project, "migrated"),
  ];
  const a = normalizeAssets(withoutAllowed(original.project, drops), originalAssets, usedA);
  const b = normalizeAssets(withoutAllowed(migrated.project, drops), migratedAssets, usedB);
  differences.push(...diffPaths(a, b).map((d) => `atlas.json ${d}`));
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

/** The passphrase for a secret, by `<entity id>/<secret id>`; undefined when none is configured. */
export type SecretKeys = (entityId: string, secretId: string) => string | undefined;

/**
 * Each shipped secret, decrypted on both sides with its configured key and
 * the plaintexts compared. Reports only match or mismatch per secret, never a
 * key or a plaintext. A secret on one side only is the JSON comparison's.
 */
export async function compareSecrets(
  original: BuildAtlasResult,
  migrated: BuildAtlasResult,
  keyFor: SecretKeys,
): Promise<string[]> {
  type Ent = { id: string; secrets?: SecretBlob[] };
  const index = (b: BuildAtlasResult) => {
    const m = new Map<string, SecretBlob>();
    for (const e of (b.project as unknown as { entities?: Ent[] }).entities ?? []) {
      for (const s of e.secrets ?? []) m.set(`${e.id}/${s.id}`, s);
    }
    return m;
  };
  const a = index(original);
  const b = index(migrated);
  const out: string[] = [];
  for (const [k, sa] of a) {
    const sb = b.get(k);
    if (!sb) continue;
    const [entity, secret] = [k.slice(0, k.indexOf("/")), k.slice(k.indexOf("/") + 1)];
    const key = keyFor(entity, secret);
    if (key === undefined) {
      out.push(`secret ${k}: no configured key, can't compare (fails closed)`);
      continue;
    }
    const [pa, pb] = await Promise.all([decryptSecret(sa, key), decryptSecret(sb, key)]);
    if (pa === null) out.push(`secret ${k}: the original doesn't decrypt with its key`);
    if (pb === null) out.push(`secret ${k}: the migrated doesn't decrypt with its key`);
    if (pa !== null && pb !== null && pa !== pb) out.push(`secret ${k}: plaintext mismatch`);
  }
  return out;
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
