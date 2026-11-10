/**
 * Campaign isolation scan (R-17b, ADR-0004 "The isolation check is structural").
 *
 * Proves a v2 campaign's player output holds nothing that campaign hides and
 * nothing of another campaign. It reads the campaign's must-not-ship file
 * (`<outputDir>/<id>/must-not-ship.json`, beside the store) and the loaded
 * model's campaign list, then:
 *
 * Structural (exit 23), on the parsed `atlas.json` and `search-index.json`,
 * exact matches of any length (any letter case):
 *   - `campaign` is exactly `{id, name}` of this campaign; there is no
 *     top-level `campaigns`; no campaign field (`campaign`, `campaigns`,
 *     `campaignId`, `campaignIds`) anywhere holds another campaign's id or
 *     name, and no per-campaign map (under a key naming visibility or
 *     campaigns) is keyed by one (`foreignCampaignRefs`);
 *   - no id field (`id`, `ids`, `map`, `world`, `worlds`, `parent`,
 *     `backlinks`, any `…Id`/`…Ids`: worlds, ocean, maps and their parents,
 *     pins, regions, routes, sound areas, notes, links) holds a must-not-ship
 *     id, whole or as a part of a `note@map` pin id;
 *   - no name field (`name`, `title`, `label`, `aliases`, `target`, `alt`,
 *     `caption`) is a must-not-ship name;
 *   - no single-token value is a hidden image path, ends in one, or has a
 *     hidden image's file name (percent-decoded, through `normalizePath`);
 *   - every note's `world` and every map's `worldId` is a world in `worlds`
 *     (ADR-0004 rule 5), and every map a map's `parent`, a world's
 *     `defaultMapId`, an ocean placement or a pin names is in `maps`;
 *   - the must-not-ship file's campaigns are the content's (a stale file
 *     can't vouch for the output), and both JSON files parse.
 *
 * Text (exit 24), over every text file of the output (`listTextFiles`: the
 * store, or the whole built site with Vite's bundle): the must-not-ship ids
 * and names and the other campaigns' names that pass `isReportableName`, and
 * the hidden image paths and file names, as `check-derived-secrets` matches
 * them (`mustNotShipSecrets`, `findSecretsInText`: whole words, any case).
 * Each file is searched as written and decoded (`decodeForSearch`: JSON and
 * JS escapes, HTML entities, percent-encoding, inline markup and invisible
 * characters removed, so `Hook<em>haven</em>`, `Hook&shy;haven` and
 * `Gloomharbour%20Vault` are hits). Shorter or common names (and other
 * campaigns' ids: `main` is in every bundle) are checked by structure only;
 * the report gives both counts.
 *
 * Assets (exit 25):
 *   - a store (`.atlas-campaigns/<id>/atlas/`): holds `atlas.json`,
 *     `search-index.json` and exactly the files its JSON references
 *     (`readPlayerImageRefs`), each a regular file: nothing unreferenced, no
 *     reference without its file, no link;
 *   - a built site (`dist-campaigns/<id>/`): its `atlas/` dir holds exactly
 *     the files of its store (R-19 runs this). Vite's own `assets/` bundle is
 *     judged by the text search only.
 *
 * v2 per-campaign outputs only: v1 content has no must-not-ship file.
 *
 * Usage:
 *   tsx scripts/check-campaign-isolation.ts <dir> --must-not-ship <file>
 *     [--config atlas.config.json] [--layout store|built-site]
 *
 * Exit codes (the first that applies, in this order; every finding is printed):
 *   0   clean
 *   1   bad invocation, or input that can't be read: the config, the content
 *       (or v1 content), a malformed must-not-ship file, a campaign the
 *       content doesn't list
 *   20  output missing (R-03): the dir, its atlas.json or search-index.json,
 *       the must-not-ship file, or (built site) its store's atlas.json
 *   23  structural isolation failure
 *   24  text isolation failure
 *   25  assets: an unreferenced, missing or linked file, or a built site's
 *       atlas dir that isn't its store's file list
 */
import fs from "node:fs";
import path from "node:path";
import { loadAtlasModel } from "./atlas/loadAtlasModel";
import { listTextFiles, type ArtifactLayout } from "./atlas/playerArtifact";
import { readPlayerImageRefs } from "./atlas/playerImageRefs";
import { STORE_DIR, readMustNotShip, type MustNotShipFile } from "./atlas/build/campaignStore";
import {
  findSecretsInText,
  foreignCampaignRefs,
  isReportableName,
  mustNotShipSecrets,
  type SecretEntry,
} from "./check-derived-secrets";
import { normalizePath } from "../src/atlas/content/resolveCampaign";
import type { AtlasCampaign } from "../src/atlas/content/schema";

const SCAN = "check-campaign-isolation";

export const EXIT = {
  ok: 0,
  input: 1,
  missing: 20,
  structural: 23,
  text: 24,
  assets: 25,
} as const;

const PLAYER_JSON = ["atlas.json", "search-index.json"] as const;

// ---------------------------------------------------------------------------
// The must-not-ship set, split by how it is checked
// ---------------------------------------------------------------------------

const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const stem = (file: string) => file.replace(/\.[^.]*$/, "");

/**
 * What the text search looks for (`text`) and what only the structural checks
 * cover (`structuralOnly`: names and ids too short or common to search for,
 * and every other campaign's id).
 */
export function isolationSecrets(m: MustNotShipFile): {
  text: SecretEntry[];
  structuralOnly: string[];
} {
  const source = "must-not-ship.json";
  const text = mustNotShipSecrets(m, source);
  const seen = new Set(
    text.map((s) => `${s.field === "path" ? "p" : "n"}:${s.name.toLowerCase()}`),
  );
  // A hidden image's file name, wherever it sits (R-17 leftover).
  for (const p of m.paths.map(normalizePath)) {
    const file = basename(p);
    if (file && file !== p && isReportableName(stem(file)) && !seen.has(`p:${file}`)) {
      seen.add(`p:${file}`);
      text.push({ name: file, source, field: "path" });
    }
  }
  const all = [...m.ids, ...m.names, ...m.otherCampaigns.flatMap((c) => [c.id, c.name])];
  const searched = new Set(text.filter((s) => s.field !== "path").map((s) => s.name.toLowerCase()));
  const structuralOnly = [...new Set(all.filter((n) => !searched.has(n.toLowerCase())))];
  return { text, structuralOnly };
}

// ---------------------------------------------------------------------------
// Structural
// ---------------------------------------------------------------------------

const ID_KEY = /^(id|ids|map|world|worlds|parent|backlinks)$|[a-z]Ids?$/;
const NAME_KEY = /^(name|title|label|aliases|target|alt|caption)$/;

interface Isolation {
  campaign: AtlasCampaign;
  others: AtlasCampaign[];
  m: MustNotShipFile;
}

const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

const lower = (xs: readonly string[]) => new Set(xs.map((x) => x.trim().toLowerCase()));

/** A value read as one path: percent-decoded, without query or hash, through `normalizePath`. */
function asPath(value: string): string | null {
  if (value.length > 1000 || /\s/.test(value.trim())) return null;
  let v = value.replace(/[?#].*$/, "");
  try {
    v = decodeURIComponent(v);
  } catch {
    // Not valid percent-encoding: read it as written.
  }
  const p = normalizePath(v);
  return p.length > 0 ? p : null;
}

/**
 * Every structural finding in one parsed player JSON file (`atlas.json` or
 * `search-index.json`), one line each.
 */
export function structuralFindings(json: unknown, file: string, iso: Isolation): string[] {
  const out: string[] = [];
  const hiddenIds = lower(iso.m.ids);
  const hiddenNames = lower(iso.m.names);
  const hiddenPaths = new Set(iso.m.paths.map(normalizePath).filter((p) => p.length > 0));
  const hiddenFiles = new Set([...hiddenPaths].map(basename).filter((f) => f.length > 0));
  const others = iso.others.flatMap((c) => [c.id, c.name]);

  if (file === "atlas.json") {
    const top = json as Record<string, unknown> | null;
    const c = top?.campaign as Record<string, unknown> | undefined;
    const keys = c && typeof c === "object" ? Object.keys(c).sort() : [];
    if (
      !c ||
      keys.join(",") !== "id,name" ||
      c.id !== iso.campaign.id ||
      c.name !== iso.campaign.name
    ) {
      out.push(
        `campaign: is ${JSON.stringify(c ?? null)}, not exactly ${JSON.stringify({ id: iso.campaign.id, name: iso.campaign.name })}`,
      );
    }
    if (top && "campaigns" in top) out.push("campaigns: a player atlas lists no campaigns");
  }
  // Another campaign's id or name in a campaign field or as a per-campaign map key.
  out.push(...foreignCampaignRefs(json, others));

  const walk = (v: unknown, at: string) => {
    if (typeof v === "string") {
      const p = asPath(v);
      if (p && (hiddenPaths.has(p) || [...hiddenPaths].some((h) => p.endsWith(`/${h}`)))) {
        out.push(`${at}: a hidden image path`);
      } else if (p && hiddenFiles.has(basename(p))) {
        out.push(`${at}: a hidden image's file name`);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${at}[${i}]`));
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [k, child] of Object.entries(v)) {
      const here = at ? `${at}.${k}` : k;
      if (ID_KEY.test(k)) {
        for (const s of strings(child)) {
          const parts = [s, ...s.split("@")].map((x) => x.trim().toLowerCase());
          if (parts.some((x) => hiddenIds.has(x))) out.push(`${here}: a hidden id "${s}"`);
        }
      }
      if (NAME_KEY.test(k)) {
        for (const s of strings(child)) {
          if (hiddenNames.has(s.trim().toLowerCase())) out.push(`${here}: a hidden name "${s}"`);
        }
      }
      walk(child, here);
    }
  };
  walk(json, "");

  if (file === "atlas.json") out.push(...referenceFindings(json));
  return out;
}

/** References that must resolve inside the output: a note's or map's world, and every map ref. */
function referenceFindings(json: unknown): string[] {
  const out: string[] = [];
  const top = (json ?? {}) as Record<string, unknown>;
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter(
      (x): x is Record<string, unknown> => !!x && typeof x === "object",
    );
  const worlds = new Set(list(top.worlds).map((w) => w.id));
  const maps = new Set(list(top.maps).map((m) => m.id));
  const need = (set: Set<unknown>, v: unknown, what: string, at: string) => {
    if (v !== undefined && !set.has(v)) {
      out.push(`${at}: ${what} ${JSON.stringify(v)} is not in this output's ${what}s`);
    }
  };
  list(top.entities).forEach((e, i) => {
    if (typeof e.world !== "string") out.push(`entities[${i}].world: missing`);
    else need(worlds, e.world, "world", `entities[${i}].world`);
  });
  list(top.worlds).forEach((w, i) =>
    need(maps, w.defaultMapId, "map", `worlds[${i}].defaultMapId`),
  );
  list(top.maps).forEach((m, i) => {
    need(worlds, m.worldId, "world", `maps[${i}].worldId`);
    need(maps, m.parent, "map", `maps[${i}].parent`);
  });
  const ocean = top.ocean as Record<string, unknown> | undefined;
  list(ocean?.onOcean).forEach((o, i) => need(maps, o.map, "map", `ocean.onOcean[${i}].map`));
  list(top.placements).forEach((p, i) => need(maps, p.mapId, "map", `placements[${i}].mapId`));
  return out;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  zwsp: "",
  zwj: "",
  zwnj: "",
  ZeroWidthSpace: "",
};

/** Phrasing tags: removed with no gap (`Hook<em>haven</em>` reads `Hookhaven`). Any other tag is a word break. */
const INLINE_TAGS = new Set(
  "a abbr b bdi bdo cite code data del dfn em i ins kbd mark q s samp small span strong sub sup time u var wbr font".split(
    " ",
  ),
);

const fromCode = (n: number) => {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
};

function decodeOnce(text: string, stripTags: boolean): string {
  const decoded = text
    // JSON and JS escapes.
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, h: string) => fromCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => fromCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, h: string) => fromCode(parseInt(h, 16)))
    .replace(/\\[nrt]/g, " ")
    .replace(/\\\//g, "/")
    // HTML entities.
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => fromCode(parseInt(d, 10)))
    .replace(
      /&([a-z]+);/gi,
      (m, n: string) => NAMED_ENTITIES[n] ?? NAMED_ENTITIES[n.toLowerCase()] ?? m,
    )
    // Percent-encoding, a run at a time (one bad run leaves only itself).
    .replace(/(?:%[0-9a-f]{2})+/gi, (m) => {
      try {
        return decodeURIComponent(m);
      } catch {
        return m;
      }
    })
    // Invisible characters; a non-breaking space and any whitespace run as one space.
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\s\u00A0]+/g, " ");
  if (!stripTags) return decoded;
  // Markup: an inline tag goes with no gap, any other is a word break.
  return decoded.replace(/<\\?\/?([a-z][a-z0-9]*)\b[^<>]*>/gi, (_, tag: string) =>
    INLINE_TAGS.has(tag.toLowerCase()) ? "" : " ",
  );
}

/**
 * `text` as a reader sees it, for the name search: escapes, entities and
 * percent-encoding decoded (repeatedly, for double encoding), invisible
 * characters removed, whitespace runs as one space, and (unless
 * `stripTags` is false, which keeps attribute values such as a link's
 * `href`) markup removed.
 */
export function decodeForSearch(text: string, stripTags = true): string {
  let cur = text;
  for (let i = 0; i < 4; i++) {
    const next = decodeOnce(cur, stripTags);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/** The string values (and keys) of a JSON text, each decoded, kept apart. */
function jsonStrings(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(decodeForSearch(v, false), decodeForSearch(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        out.push(decodeForSearch(k));
        walk(child);
      }
    }
  };
  walk(parsed);
  return out.join("\n\u0001\n");
}

/** The text entries found in one file's text, as written and decoded. */
export function textFindings(text: string, secrets: SecretEntry[], isJson: boolean): SecretEntry[] {
  const variants = [text, decodeForSearch(text, false), decodeForSearch(text)];
  if (isJson) {
    const s = jsonStrings(text);
    if (s !== null) variants.push(s);
  }
  return [...new Set(variants.flatMap((v) => findSecretsInText(v, secrets)))];
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Every entry under `dir` (posix, relative), with what isn't a regular file or dir. */
function listFiles(dir: string): { files: string[]; odd: string[] } {
  const files: string[] = [];
  const odd: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) odd.push(`${r}: a link`);
      else if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) files.push(r);
      else odd.push(`${r}: not a regular file`);
    }
  };
  walk(dir, "");
  return { files: files.sort(), odd };
}

/** A store holds its JSON and exactly the files that JSON references, all regular files. */
export function storeAssetFindings(storeDir: string): string[] {
  const out: string[] = [];
  const { files, odd } = listFiles(storeDir);
  out.push(...odd);
  let refs: Set<string>;
  try {
    refs = readPlayerImageRefs(storeDir);
  } catch (e) {
    return [...out, (e as Error).message];
  }
  const have = new Set(files);
  for (const f of files) {
    if (!(PLAYER_JSON as readonly string[]).includes(f) && !refs.has(f)) {
      out.push(`${f}: in the store, referenced by nothing`);
    }
  }
  for (const r of [...refs].sort()) {
    if (!have.has(r)) out.push(`${r}: referenced, but not a file in the store`);
  }
  return out;
}

/** A built site's atlas dir holds exactly its store's files. */
export function siteAssetFindings(siteAtlasDir: string, storeDir: string): string[] {
  const site = listFiles(siteAtlasDir);
  const store = listFiles(storeDir);
  const inStore = new Set(store.files);
  const inSite = new Set(site.files);
  return [
    ...site.odd.map((o) => `atlas/${o}`),
    ...site.files.filter((f) => !inStore.has(f)).map((f) => `atlas/${f}: not in its store`),
    ...store.files
      .filter((f) => !inSite.has(f))
      .map((f) => `atlas/${f}: in its store, not the site`),
  ];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

interface Config {
  contentRoot: string;
  defaultWorld: string;
  include: string[];
  exclude: string[];
}

export interface RunOpts {
  /** The campaign's store (`<outputDir>/<id>/atlas`) or built site (`dist-campaigns/<id>`). */
  dir: string;
  /** The campaign's must-not-ship file, beside its store. */
  mustNotShip: string;
  config?: string;
  /** Which `dir` is; read from the dir when unset (a store's atlas.json first). */
  layout?: ArtifactLayout;
}

const isNonEmptyFile = (p: string) => {
  try {
    const s = fs.statSync(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
};

/** The campaign list of the content the config names. Throws when it can't load or is v1. */
function loadCampaigns(configPath: string): AtlasCampaign[] {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
  const root = path.dirname(configPath);
  const loaded = loadAtlasModel(
    path.resolve(root, cfg.contentRoot),
    { defaultWorld: cfg.defaultWorld, include: cfg.include, exclude: cfg.exclude },
    { root },
  );
  if (loaded.model.schemaVersion !== 2) {
    throw new Error("the content is v1: campaign isolation is checked on v2 outputs only");
  }
  return loaded.model.campaigns.map((c) => ({ id: c.id, name: c.name }));
}

export function run(opts: RunOpts): number {
  const dir = path.resolve(process.cwd(), opts.dir);
  const mnsFile = path.resolve(process.cwd(), opts.mustNotShip);
  const configPath = path.resolve(process.cwd(), opts.config ?? "atlas.config.json");
  const fail = (code: number, lines: string[]) => {
    for (const l of lines) console.error(`${SCAN}: ${l}`);
    return code;
  };

  // Missing output (R-03).
  const layout: ArtifactLayout =
    opts.layout ??
    (!fs.existsSync(path.join(dir, "atlas.json")) &&
    fs.existsSync(path.join(dir, STORE_DIR, "atlas.json"))
      ? "built-site"
      : "store");
  const atlasDir = layout === "built-site" ? path.join(dir, STORE_DIR) : dir;
  const storeDir = path.join(path.dirname(mnsFile), STORE_DIR);
  const required = [
    ...PLAYER_JSON.map((f) => path.join(atlasDir, f)),
    mnsFile,
    ...(layout === "built-site" ? [path.join(storeDir, "atlas.json")] : []),
  ];
  const missing = required.filter((p) => !isNonEmptyFile(p));
  if (missing.length > 0) {
    return fail(
      EXIT.missing,
      missing.map((p) => `${p} is missing or empty, so there is nothing to check — failing`),
    );
  }

  // Inputs.
  let m: MustNotShipFile;
  let campaigns: AtlasCampaign[];
  try {
    m = readMustNotShip(mnsFile);
    campaigns = loadCampaigns(configPath);
  } catch (e) {
    return fail(EXIT.input, [(e as Error).message]);
  }
  const campaign = campaigns.find((c) => c.id === m.campaign);
  if (!campaign) {
    return fail(EXIT.input, [`campaign "${m.campaign}" is not in the content's campaign list`]);
  }
  const others = campaigns.filter((c) => c.id !== campaign.id);
  const iso: Isolation = { campaign, others, m };

  // Structural.
  const structural: string[] = [];
  const listed = [m.campaign, ...m.otherCampaigns.map((c) => c.id)].sort().join(",");
  const actual = campaigns
    .map((c) => c.id)
    .sort()
    .join(",");
  if (listed !== actual) {
    structural.push(
      `must-not-ship.json lists campaigns ${listed}, the content ${actual}: rebuild before scanning`,
    );
  }
  for (const f of PLAYER_JSON) {
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(path.join(atlasDir, f), "utf8"));
    } catch (e) {
      structural.push(`${f}: not valid JSON, so it can't be checked (${(e as Error).message})`);
      continue;
    }
    structural.push(...structuralFindings(json, f, iso).map((h) => `${f}: ${h}`));
  }

  // Text.
  const { text: secrets, structuralOnly } = isolationSecrets(m);
  const listing = listTextFiles(dir, SCAN);
  const textHits: string[] = listing.unreadable.map((d) => `${d}: can't be read, so not searched`);
  for (const file of listing.files) {
    const body = fs.readFileSync(file, "utf8");
    for (const s of textFindings(body, secrets, file.endsWith(".json"))) {
      textHits.push(`${path.relative(dir, file)}: "${s.name}" (${s.field})`);
    }
  }

  // Assets.
  let assets: string[];
  try {
    assets =
      layout === "built-site" ? siteAssetFindings(atlasDir, storeDir) : storeAssetFindings(dir);
  } catch (e) {
    assets = [`can't list the files: ${(e as Error).message}`];
  }

  console.log(
    `${SCAN}: ${campaign.id} (${layout}) ${opts.dir}: ${secrets.length} name(s) by text search ` +
      `over ${listing.files.length} file(s), ${structuralOnly.length} by structure only`,
  );
  for (const h of structural) console.error(`  STRUCTURE ${h}`);
  for (const h of textHits) console.error(`  TEXT ${h}`);
  for (const h of assets) console.error(`  ASSET ${h}`);
  if (structural.length > 0) return EXIT.structural;
  if (textHits.length > 0) return EXIT.text;
  if (assets.length > 0) return EXIT.assets;
  console.log(`${SCAN}: clean`);
  return EXIT.ok;
}

function parseArgs(argv: string[]): RunOpts | null {
  let dir: string | undefined;
  let mustNotShip: string | undefined;
  let config: string | undefined;
  let layout: ArtifactLayout | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith("--") ? a.split(/=(.*)/s, 2) : [a, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === "--must-not-ship") mustNotShip = value();
    else if (flag === "--config") config = value();
    else if (flag === "--layout") {
      const l = value();
      if (l !== "store" && l !== "built-site") return null;
      layout = l;
    } else if (!a.startsWith("--") && dir === undefined) dir = a;
    else return null;
  }
  if (!dir || !mustNotShip) return null;
  return { dir, mustNotShip, ...(config ? { config } : {}), ...(layout ? { layout } : {}) };
}

const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return (
    arg1.endsWith("check-campaign-isolation.ts") || arg1.endsWith("check-campaign-isolation.js")
  );
})();
if (invokedAsScript) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    console.error(
      "Usage: tsx scripts/check-campaign-isolation.ts <dir> --must-not-ship <file> [--config atlas.config.json] [--layout store|built-site]",
    );
    process.exit(EXIT.input);
  }
  process.exit(run(opts));
}
