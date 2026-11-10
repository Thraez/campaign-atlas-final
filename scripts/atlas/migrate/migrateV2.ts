/**
 * The schema v1 -> v2 migration and its down-migration (R-20, ADR-0003).
 *
 * Both directions plan a whole content tree in memory (`MigrationPlan`); only
 * `writeMigration` writes, and only to a fresh folder that is not the content
 * root, inside it or around it. Nothing here writes to the content root.
 *
 * Up (v1 -> v2) starts from the one v1 adapter (`v1Model`, through
 * `loadAtlasModel`), so the migrated files say what the build already reads:
 *   - `_atlas/atlas.yaml`: the ocean (sized to hold every map side by side),
 *     the world, campaign `main`, one `onOcean` entry per map;
 *   - `<world>/_atlas/world.yaml` at v2: maps top-level with their layers
 *     unchanged, regions, routes, pins and sound under their map, world-level
 *     settings, the world name written out;
 *   - `_atlas/campaigns/main.yaml`: every map open, or fogged with its v1 fog;
 *     `notes: vault` (ADR-0004 question 5);
 *   - notes: `atlas.placements` (and legacy `atlas.x`/`y`) removed as text;
 *   - map images and audio the world names under `public/` copied to
 *     `<world>/_atlas/<same path>`, so the v2 build finds them with every src
 *     unchanged (ADR-0003 question 3 moves them for real at cutover).
 * Visibility (`upVisibility`): a value that ships (`player`, `rumor`) becomes
 * `{ main: <value> }`; `hidden` stays `hidden`; anything else (`dm`, missing,
 * invalid) becomes `dm`. Maps get `{ main: player }` (v1 maps always ship).
 *
 * Down (v2 -> v1) refuses anything v1 can't say (more than one campaign or
 * world, a campaign other than `main`, a child map, a `notes:` block, a
 * campaign that reads notes `hidden`, a map that doesn't ship to `main`)
 * and otherwise writes the inverse, pins back into their notes.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type {
  AtlasModel,
  MapModel,
  ModelNote,
  WorldModel,
} from "../../../src/atlas/content/atlasModel";
import type {
  AtlasFileV2,
  CampaignFileV2,
  MapV2,
  PinV2,
  RegionV2,
  RouteV2,
  SoundAreaV2,
  VisibilityValue,
  WorldFileV2,
} from "../../../src/atlas/content/schemaV2";
import {
  validateAtlasFileV2,
  validateCampaignFileV2,
  validateWorldFileV2,
} from "../../../src/atlas/content/schemaV2";
import { V1_CAMPAIGN_ID, V1_CAMPAIGN_NAME, V1_ZOOM } from "../../../src/atlas/content/v1Model";
import { v1PinVisibility } from "../../../src/atlas/content/pinVisibility";
import {
  isValidVisibility,
  PLAYER_VISIBLE_VISIBILITY,
} from "../../../src/atlas/content/visibility";
import { AtlasModelError, loadAtlasModel, type LoadAtlasModelConfig } from "../loadAtlasModel";
import { DEFAULT_FOG_COLOR } from "../loadWorldConfig";
import { parseNoteFields } from "../parseFrontmatter";
import { addPlacements, hasPinFields, stripPinFields, type PlacementText } from "./notePins";

/** The campaign v1 content is (ADR-0003 "Versions"). */
export const MIGRATED_CAMPAIGN = V1_CAMPAIGN_ID;
/** The campaign's note default the migration writes (ADR-0004 question 5). */
export const MIGRATED_NOTES_MODE = "vault" as const;
/** The ocean's sea style for migrated content. */
export const MIGRATED_SEA = "default";

/** The migration can't go on; every reason is listed. Nothing was written. */
export class MigrationRefused extends Error {
  constructor(readonly reasons: string[]) {
    super(`migration refused:\n${reasons.map((r) => `  - ${r}`).join("\n")}\nNothing was written.`);
    this.name = "MigrationRefused";
  }
}

export interface MigrationPlan {
  direction: "up" | "down";
  /** The input is already the target version: the plan is empty, nothing to write. */
  alreadyDone: boolean;
  /** Every file of the migrated tree, by posix path relative to its root. */
  files: Map<string, Buffer>;
  /** Files new or different from the input (the rest are copied as they are). */
  changed: string[];
  warnings: string[];
  /** What the plan did, one line each, for the report. */
  summary: string[];
  /**
   * Items the v1 build reads and the migration leaves out on purpose (the
   * ticket's conversions), `kind:map/id`, and, with `allowDropPinStyle`, the
   * shipping pins whose label or style is dropped, `pinStyle:<note>@<map>:<x>,<y>`.
   * The comparisons allow exactly these.
   */
  dropped: string[];
  /**
   * Down only: the map images and audio the v1 tree reads from `public/`, by
   * src, each checked equal to the v2 copy under `<world>/_atlas/`.
   */
  publicAssets: Map<string, Buffer>;
}

export interface MigrateOptions {
  /** The content root to read (never written). */
  contentRoot: string;
  /** `atlas.config.json`'s fields the loader needs. */
  config: LoadAtlasModelConfig;
  /** Paths in messages are relative to this. */
  root: string;
  /** v1's `public/` folder, where v1 map images and audio live (up: read; down: checked). */
  publicDir?: string;
  /**
   * Up: drop a shipping pin's label and pin style (a change players see)
   * instead of refusing. Off unless asked (`--allow-drop-pin-style`).
   */
  allowDropPinStyle?: boolean;
}

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------

const SHIPS = PLAYER_VISIBLE_VISIBILITY as ReadonlySet<string>;

function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/** Every regular file under `dir`, by posix path relative to it. Symlinks are refused. */
function readTree(dir: string, refuse: string[], rel = ""): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isSymbolicLink()) refuse.push(`${r} is a symlink; the migration copies real files only`);
    else if (d.isDirectory()) for (const [k, v] of readTree(dir, refuse, r)) out.set(k, v);
    else if (d.isFile()) out.set(r, fs.readFileSync(path.join(dir, r)));
  }
  return out;
}

function dumpYaml(header: string, value: unknown): Buffer {
  const body = yaml.dump(value, { lineWidth: -1, noRefs: true, sortKeys: false });
  return Buffer.from(`${header}${body}`, "utf8");
}

function load(opts: MigrateOptions) {
  try {
    return loadAtlasModel(opts.contentRoot, opts.config, { root: opts.root });
  } catch (e) {
    if (e instanceof AtlasModelError) {
      throw new MigrationRefused([`the content doesn't load: ${e.message}`]);
    }
    throw e;
  }
}

function hasAtlasFile(contentRoot: string): boolean {
  return fs.existsSync(path.join(contentRoot, "_atlas", "atlas.yaml"));
}

// ---------------------------------------------------------------------------
// up: v1 -> v2
// ---------------------------------------------------------------------------

/** A v1 value as v2 writes it for campaign `main` (see the file comment). */
export function upVisibility(v: VisibilityValue | undefined): VisibilityValue {
  if (typeof v === "string" && SHIPS.has(v)) return { [MIGRATED_CAMPAIGN]: v };
  if (v === "hidden") return "hidden";
  return "dm";
}

const isFinitePoint = (p: unknown) =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n));

function validPolygon(points: unknown): boolean {
  return Array.isArray(points) && points.length >= 3 && points.every(isFinitePoint);
}

/** An asset path v1 reads from `public/` (not a URL, not absolute, no `..`). */
function localAsset(src: string | undefined): string | null {
  if (
    !src ||
    /^[a-z][a-z0-9+.-]*:/i.test(src) ||
    src.startsWith("/") ||
    src.split("/").includes("..")
  ) {
    return null;
  }
  return src;
}

/** The comment and blank lines a YAML file starts with (its header), kept as written. */
function leadingComments(text: string): string {
  const lines = text.replace(/^\uFEFF/, "").split(/(?<=\n)/);
  let out = "";
  for (const l of lines) {
    if (!/^\s*(#.*)?\r?\n?$/.test(l) || l === "") break;
    out += l.endsWith("\n") ? l : `${l}\n`;
  }
  return out.replace(/\s+$/, "") === "" ? "" : out;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Paths of keys in `src` that `dst` has no key for (null values and empty lists carry nothing). */
function missingKeys(src: unknown, dst: unknown, at: string, out: string[]): void {
  const empty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && !v.length);
  if (empty(src)) return;
  if (Array.isArray(src)) {
    if (!Array.isArray(dst)) {
      out.push(at);
      return;
    }
    src.forEach((s, i) => {
      // Items with an id are matched by it; one the migration left out is warned about already.
      if (isRecord(s) && typeof s.id === "string") {
        const d = dst.find((x) => isRecord(x) && x.id === s.id);
        if (d !== undefined) missingKeys(s, d, `${at}[${s.id}]`, out);
      } else if (i < dst.length) {
        missingKeys(s, dst[i], `${at}[${i}]`, out);
      }
    });
    return;
  }
  if (isRecord(src)) {
    if (!isRecord(dst)) {
      out.push(at);
      return;
    }
    for (const [k, v] of Object.entries(src)) {
      if (empty(v)) continue;
      const p = at ? `${at}.${k}` : k;
      if (!(k in dst)) out.push(p);
      else missingKeys(v, dst[k], p, out);
    }
  }
}

/**
 * Every key of the v1 world.yaml (`rawText`) the migrated files don't carry:
 * the v1 file is moved into v2's places (regions and routes under their map,
 * sound areas to `sound`, water to the world, fog to the campaign) and then
 * compared key by key, at every depth, with what was written.
 */
function uncarriedKeys(
  rawText: string,
  worldFile: WorldFileV2,
  campaign: CampaignFileV2,
): string[] {
  let raw: unknown;
  try {
    raw = yaml.load(rawText);
  } catch {
    return ["(the file)"];
  }
  if (!isRecord(raw)) return [];
  const out: string[] = [];
  const written = JSON.parse(JSON.stringify(worldFile)) as Record<string, unknown>;
  const states = JSON.parse(JSON.stringify(campaign.maps)) as Record<string, unknown>;
  const {
    schemaVersion: _v,
    name,
    id,
    maps,
    regions,
    routes,
    ...rest
  } = raw as Record<string, unknown>;
  const byMap = (list: unknown, mapId: unknown) =>
    (Array.isArray(list) ? list : [])
      .filter((x) => isRecord(x) && x.mapId === mapId)
      .map((x) => {
        const { mapId: _m, ...r } = x as Record<string, unknown>;
        return r;
      });
  const movedMaps = (Array.isArray(maps) ? maps : []).map((m) => {
    if (!isRecord(m)) return m;
    const { water, fog, soundscape, ...mm } = m;
    const moved: Record<string, unknown> = { ...mm };
    if (isRecord(soundscape)) {
      const { areas, ...ss } = soundscape;
      if (Object.keys(ss).length > 0) moved.soundscape = ss;
      moved.sound = areas;
    }
    moved.regions = byMap(regions, m.id);
    moved.routes = byMap(routes, m.id);
    const where = `maps[${String(m.id)}]`;
    missingKeys(water, written.water, `${where}.water`, out);
    if (isRecord(fog)) {
      // `enabled` is the state; `color` is warned about on its own.
      const { enabled: _e, color: _c, ...f } = fog;
      missingKeys(f, states[String(m.id)], `${where}.fog`, out);
    }
    return moved;
  });
  missingKeys({ name, id }, written.world, "", out);
  missingKeys({ ...rest, maps: movedMaps }, written, "", out);
  // Regions and routes naming no map that exists are not carried either.
  const mapIds = new Set<unknown>(
    (Array.isArray(maps) ? maps : []).map((m) => isRecord(m) && m.id),
  );
  for (const [k, list] of [
    ["regions", regions],
    ["routes", routes],
  ] as const) {
    for (const x of Array.isArray(list) ? list : []) {
      if (isRecord(x) && !mapIds.has(x.mapId as string)) out.push(`${k}[${String(x.id)}]`);
    }
  }
  return out;
}

/** Plan the v1 -> v2 migration of `opts.contentRoot`. Throws `MigrationRefused`. */
export function planMigrateUp(opts: MigrateOptions): MigrationPlan {
  const plan: MigrationPlan = {
    direction: "up",
    alreadyDone: false,
    files: new Map(),
    changed: [],
    warnings: [],
    summary: [],
    dropped: [],
    publicAssets: new Map(),
  };
  if (hasAtlasFile(opts.contentRoot)) {
    plan.alreadyDone = true;
    plan.summary.push("the content root has _atlas/atlas.yaml: already schema v2, nothing to do");
    return plan;
  }
  const refuse: string[] = [];
  const loaded = load(opts);
  const { model, notes, v1Source } = loaded;
  if (model.schemaVersion !== 1) throw new MigrationRefused(["the content is not schema v1"]);
  plan.warnings.push(...loaded.warnings);

  // Regions the v1 loader dropped: v1 fails the player build on one not marked
  // player (ADR-0004 rule 9), so there is no output to keep; refuse.
  for (const d of v1Source?.droppedRegions ?? []) {
    if (d.visibility === "player") {
      plan.warnings.push(
        `region "${d.id}" on map "${d.mapId}" (${d.why}) is dropped, as v1 drops it`,
      );
      plan.dropped.push(`region:${d.mapId}/${d.id}`);
    } else {
      refuse.push(
        `region "${d.id}" on map "${d.mapId}" (${d.why}) is not marked player: v1's player build ` +
          `fails on it (ADR-0004 rule 9); fix it in world.yaml first`,
      );
    }
  }
  for (const f of v1Source?.fogs ?? []) {
    if (f.color !== undefined && f.color !== DEFAULT_FOG_COLOR) {
      plan.warnings.push(
        `map "${f.mapId}": fog color "${f.color}" is dropped (v2 has no fog colour)`,
      );
    }
  }

  const tree = readTree(opts.contentRoot, refuse);
  const worldIds: string[] = [];
  const onOcean: AtlasFileV2["onOcean"] = [];
  let oceanWidth = 0;
  let oceanHeight = 0;
  const campaign: CampaignFileV2 = {
    id: MIGRATED_CAMPAIGN,
    name: V1_CAMPAIGN_NAME,
    notes: MIGRATED_NOTES_MODE,
    maps: {},
  };
  const v1Campaign = model.campaigns.find((c) => c.id === MIGRATED_CAMPAIGN);
  const counts = { maps: 0, layers: 0, regions: 0, routes: 0, pins: 0, sound: 0, assets: 0 };

  for (const world of model.worlds) {
    worldIds.push(world.world.id);
    const maps: MapV2[] = [];
    for (const m of world.maps) {
      if (!m.scale) {
        refuse.push(`map "${m.id}" has no scale; v2 requires one, so add one to world.yaml first`);
        continue;
      }
      const regions: RegionV2[] = [];
      for (const r of m.regions ?? []) {
        if (!validPolygon(r.points)) {
          if (r.visibility === "player") {
            plan.warnings.push(
              `region "${r.id}" needs at least 3 valid points; dropped, as v1 draws nothing`,
            );
            plan.dropped.push(`region:${m.id}/${r.id}`);
          } else {
            refuse.push(
              `region "${r.id}" needs at least 3 valid points and is not marked player: ` +
                `v1's player build fails on it (ADR-0004 rule 9)`,
            );
          }
          continue;
        }
        regions.push({ ...r, visibility: upVisibility(r.visibility) });
      }
      const routes: RouteV2[] = (m.routes ?? []).map((r) => ({
        ...r,
        visibility: upVisibility(r.visibility),
      }));
      const pins: PinV2[] = (m.pins ?? []).map((p) => ({
        ...p,
        visibility: upVisibility(p.visibility),
      }));
      // Sound areas the adapter dropped (no id, no bed, a sound-only one with
      // fewer than 3 points): v1's loader warned about each.
      const kept = new Set((m.sound ?? []).map((a) => a.id));
      const raw = v1Source?.maps.find((x) => x.id === m.id)?.soundscape?.areas ?? [];
      for (const a of raw) {
        if (!kept.has(a.id)) plan.dropped.push(`sound:${m.id}/${a.id ?? "?"}`);
      }
      // A ride-on area takes its region's verdict; one with no value keeps none.
      const sound: SoundAreaV2[] = (m.sound ?? []).map((a) =>
        a.regionId !== undefined && a.visibility === undefined
          ? { ...a }
          : { ...a, visibility: upVisibility(a.visibility) },
      );
      maps.push(
        compact<MapV2>({
          id: m.id,
          name: m.name,
          width: m.width,
          height: m.height,
          visibility: { [MIGRATED_CAMPAIGN]: "player" },
          layers: m.layers,
          scale: m.scale,
          zoom: m.zoom ?? { ...V1_ZOOM },
          grid: m.grid,
          oceanColor: m.oceanColor,
          wrapX: m.wrapX,
          soundscape: m.soundscape,
          regions: regions.length > 0 ? regions : undefined,
          routes: routes.length > 0 ? routes : undefined,
          pins: pins.length > 0 ? pins : undefined,
          sound: sound.length > 0 ? sound : undefined,
        }),
      );
      onOcean.push({ map: m.id, x: oceanWidth, y: 0, scale: 1, rotation: 0 });
      oceanWidth += m.width;
      oceanHeight = Math.max(oceanHeight, m.height);
      const state = v1Campaign?.maps[m.id];
      if (state) campaign.maps[m.id] = state;
      else
        refuse.push(`map "${m.id}" has no state in v1's campaign "main"; nothing to migrate it to`);
      counts.maps++;
      counts.layers += m.layers.length;
      counts.regions += regions.length;
      counts.routes += routes.length;
      counts.pins += pins.length;
      counts.sound += sound.length;

      // Images and audio v1 reads from public/, copied beside world.yaml.
      const srcs = [
        ...m.layers.flatMap((l) => [l.src, l.tileSrc]),
        ...(m.sound ?? []).flatMap((a) => [a.bed.src, a.bed.srcFallback]),
      ];
      for (const src of new Set(srcs.map(localAsset))) {
        if (!src) continue;
        const from = opts.publicDir ? path.join(opts.publicDir, src) : null;
        if (!from || !fs.existsSync(from) || !fs.statSync(from).isFile()) {
          plan.warnings.push(`map "${m.id}": "${src}" is not in public/; not copied`);
          continue;
        }
        const to = `${world.world.id}/_atlas/${src}`;
        const bytes = fs.readFileSync(from);
        const existing = tree.get(to);
        if (existing?.equals(bytes)) continue;
        if (existing) {
          refuse.push(`${to} already exists in the content root; the migration won't overwrite it`);
          continue;
        }
        plan.files.set(to, bytes);
        plan.changed.push(to);
        counts.assets++;
      }
    }

    const worldFile: WorldFileV2 = compact<WorldFileV2>({
      schemaVersion: 2,
      world: { id: world.world.id, name: world.world.name },
      calendar: world.calendar,
      credits: world.credits,
      assetCredits: world.assetCredits,
      import: world.import,
      water: world.water,
      maps,
    });
    const checked = validateWorldFileV2(JSON.parse(JSON.stringify(worldFile)));
    if (!checked.ok) {
      for (const e of checked.errors)
        refuse.push(`world "${world.world.id}" ${e.path}: ${e.message}`);
    }
    const rel = `${world.world.id}/_atlas/world.yaml`;
    const rawText = tree.get(rel)?.toString("utf8");
    if (rawText === undefined) {
      plan.warnings.push(`${rel} not found as a file; its keys and comments weren't checked`);
    } else {
      for (const k of uncarriedKeys(rawText, worldFile, campaign)) {
        plan.warnings.push(`${rel}: ${k} is not carried over (the loader doesn't model it)`);
      }
    }
    plan.files.set(
      rel,
      dumpYaml(
        `${leadingComments(rawText ?? "")}# Schema v2 (ADR-0003), written by atlas:migrate-v2 from the v1 world.yaml.\n`,
        worldFile,
      ),
    );
    plan.changed.push(rel);
  }

  const atlasFile: AtlasFileV2 = {
    schemaVersion: 2,
    ocean: { width: Math.max(oceanWidth, 1), height: Math.max(oceanHeight, 1), sea: MIGRATED_SEA },
    worlds: worldIds,
    campaigns: [MIGRATED_CAMPAIGN],
    onOcean,
  };
  const atlasChecked = validateAtlasFileV2(JSON.parse(JSON.stringify(atlasFile)));
  if (!atlasChecked.ok)
    for (const e of atlasChecked.errors) refuse.push(`atlas.yaml ${e.path}: ${e.message}`);
  const campaignChecked = validateCampaignFileV2(JSON.parse(JSON.stringify(campaign)));
  if (!campaignChecked.ok) {
    for (const e of campaignChecked.errors)
      refuse.push(`campaigns/main.yaml ${e.path}: ${e.message}`);
  }
  plan.files.set(
    "_atlas/atlas.yaml",
    dumpYaml("# Schema v2 (ADR-0003), written by atlas:migrate-v2.\n", atlasFile),
  );
  plan.files.set(
    `_atlas/campaigns/${MIGRATED_CAMPAIGN}.yaml`,
    dumpYaml(
      "# Campaign main (ADR-0004), written by atlas:migrate-v2: v1's one campaign.\n",
      campaign,
    ),
  );
  plan.changed.push("_atlas/atlas.yaml", `_atlas/campaigns/${MIGRATED_CAMPAIGN}.yaml`);

  // Notes: pins now live in world.yaml. Every note loses its pin fields, the
  // ones the build doesn't read too (v2 refuses a pin field on any note).
  const read = new Map(notes.map((n) => [n.file, n]));
  let notesChanged = 0;
  const contentRel = path.relative(opts.root, opts.contentRoot).replace(/\\/g, "/");
  for (const [rel, bytes] of tree) {
    if (plan.files.has(rel)) continue;
    if (!rel.endsWith(".md")) {
      plan.files.set(rel, bytes);
      continue;
    }
    const raw = bytes.toString("utf8");
    if (!hasPinFields(raw)) {
      plan.files.set(rel, bytes);
      continue;
    }
    const noteFile = contentRel ? `${contentRel}/${rel}` : rel;
    const note = read.get(noteFile);
    if (!note) {
      plan.warnings.push(
        `${rel}: pin fields removed; the build doesn't read this note, so its pins never shipped`,
      );
    } else {
      pinFieldsDropped(note, rel, plan, refuse, !!opts.allowDropPinStyle);
    }
    const edit = stripPinFields(raw);
    if (!edit.ok) {
      refuse.push(`${rel}: ${edit.reason}`);
      continue;
    }
    if (edit.droppedComments) {
      plan.warnings.push(
        `${rel}: ${edit.droppedComments} comment line(s) inside the removed pin fields are dropped`,
      );
    }
    plan.files.set(rel, Buffer.from(edit.raw, "utf8"));
    plan.changed.push(rel);
    notesChanged++;
  }
  if (refuse.length > 0) throw new MigrationRefused(refuse);

  plan.changed.sort();
  plan.summary.push(
    `worlds: ${worldIds.join(", ")}; campaign: ${MIGRATED_CAMPAIGN} (notes: ${MIGRATED_NOTES_MODE})`,
    `maps: ${counts.maps} (layers ${counts.layers}), regions ${counts.regions}, routes ${counts.routes}, ` +
      `pins ${counts.pins}, sound areas ${counts.sound}`,
    `fogged maps: ${Object.values(campaign.maps).filter((m) => m.state === "fogged").length}`,
    `notes with pins moved out: ${notesChanged}; assets copied from public/: ${counts.assets}`,
    `files: ${plan.files.size} (${plan.changed.length} new or changed)`,
  );
  return plan;
}

/**
 * What a placement carries that a v2 pin can't (the adapter drops it too). On
 * a pin that ships, a dropped label or style is a change players see: refused
 * unless `allow`, then warned and declared in `plan.dropped`.
 */
function pinFieldsDropped(
  note: ModelNote,
  rel: string,
  plan: MigrationPlan,
  refuse: string[],
  allow: boolean,
): void {
  const placements = parseNoteFields(note.note).atlas.placements ?? [];
  placements.forEach((p, i) => {
    const lost = [p.label !== undefined && "label", p.pin !== undefined && "pin style"].filter(
      Boolean,
    );
    const ships = SHIPS.has(v1PinVisibility(note.note.isSecret, note.note.visibility, p.secretId));
    if (lost.length > 0 && ships && !allow) {
      refuse.push(
        `${rel}: atlas.placements[${i}] ships with a ${lost.join(" and ")} v2 pins can't carry; ` +
          `players would see it change (remove it, or pass --allow-drop-pin-style)`,
      );
    } else if (lost.length > 0) {
      plan.warnings.push(
        `${rel}: atlas.placements[${i}] ${lost.join(" and ")} dropped (v2 pins have none)`,
      );
      if (ships) plan.dropped.push(`pinStyle:${note.note.id}@${p.mapId}:${p.x},${p.y}`);
    }
    if (p.secretId !== undefined) {
      plan.warnings.push(
        `${rel}: atlas.placements[${i}] is behind secret "${p.secretId}"; its pin is written as dm, as the v1 adapter loads it`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// down: v2 -> v1
// ---------------------------------------------------------------------------

/** A v2 value as v1 writes it, or a reason it can't be. */
function downVisibility(v: VisibilityValue | undefined, where: string, refuse: string[]): string {
  if (v === undefined) return "dm";
  if (typeof v === "string") return v;
  const keys = Object.keys(v);
  const other = keys.filter((k) => k !== MIGRATED_CAMPAIGN);
  if (other.length > 0) {
    refuse.push(
      `${where} names campaign(s) ${other.map((k) => `"${k}"`).join(", ")}; v1 has only "main"`,
    );
    return "dm";
  }
  return v[MIGRATED_CAMPAIGN] ?? "dm";
}

/** Plan the v2 -> v1 down-migration of `opts.contentRoot`. Throws `MigrationRefused`. */
export function planMigrateDown(opts: MigrateOptions): MigrationPlan {
  const plan: MigrationPlan = {
    direction: "down",
    alreadyDone: false,
    files: new Map(),
    changed: [],
    warnings: [],
    summary: [],
    dropped: [],
    publicAssets: new Map(),
  };
  if (!hasAtlasFile(opts.contentRoot)) {
    plan.alreadyDone = true;
    plan.summary.push(
      "the content root has no _atlas/atlas.yaml: already schema v1, nothing to do",
    );
    return plan;
  }
  const refuse: string[] = [];
  const { model, notes } = load(opts);
  if (model.schemaVersion !== 2) throw new MigrationRefused(["the content is not schema v2"]);

  if (model.campaigns.length !== 1 || model.campaigns.some((c) => c.id !== MIGRATED_CAMPAIGN)) {
    refuse.push(
      `the content has campaign(s) ${model.campaigns.map((c) => `"${c.id}"`).join(", ")}; v1 has exactly one, "main"`,
    );
  }
  if (model.worlds.length !== 1) {
    refuse.push(`the content has ${model.worlds.length} worlds; v1 has exactly one`);
  }
  const campaign = model.campaigns.find((c) => c.id === MIGRATED_CAMPAIGN);
  if (campaign && campaign.notes !== MIGRATED_NOTES_MODE) {
    refuse.push(
      `campaign "main" reads notes "${campaign.notes}"; v1 reads them as the vault says ("vault")`,
    );
  }
  const tree = readTree(opts.contentRoot, refuse);

  const counts = { maps: 0, regions: 0, routes: 0, pins: 0, sound: 0, notes: 0 };
  const pinsByNote = new Map<string, PlacementText[]>();
  const noteById = new Map<string, ModelNote>();
  for (const n of notes) {
    const first = noteById.get(n.note.id);
    if (first) {
      refuse.push(
        `notes ${first.file} and ${n.file} share the id "${n.note.id}"; a pin can't say which it belongs to`,
      );
    } else {
      noteById.set(n.note.id, n);
    }
  }
  if (!opts.publicDir)
    refuse.push("no public/ folder given; v1 reads map images and audio from it");

  for (const world of model.worlds) {
    if (world.notes !== undefined) {
      refuse.push(
        `world "${world.world.id}" has a notes: block; v1 has no per-campaign note entries`,
      );
    }
    const v1Maps: Record<string, unknown>[] = [];
    const v1Regions: Record<string, unknown>[] = [];
    const v1Routes: Record<string, unknown>[] = [];
    for (const m of world.maps) {
      const where = `map "${m.id}"`;
      if (m.parent !== undefined || m.frame !== undefined || m.enterZoom !== undefined) {
        refuse.push(`${where} sits inside another map (parent/frame/enterZoom); v1 maps are flat`);
      }
      if (downVisibility(m.visibility, `${where} visibility`, refuse) !== "player") {
        refuse.push(`${where} doesn't ship to "main" as player; every v1 map ships`);
      }
      const state = campaign?.maps[m.id];
      if (!state || state.state === "unknown") {
        refuse.push(`${where} is unknown to "main"; every v1 map ships`);
      }
      if (m.zoom && (m.zoom.min !== V1_ZOOM.min || m.zoom.max !== V1_ZOOM.max)) {
        plan.warnings.push(
          `${where}: zoom ${m.zoom.min}..${m.zoom.max} is dropped (v1 maps all use ${V1_ZOOM.min}..${V1_ZOOM.max})`,
        );
      }
      const areas = (m.sound ?? []).map((a) =>
        compact({
          ...a,
          visibility:
            a.visibility === undefined
              ? undefined
              : downVisibility(a.visibility, `${where} sound area "${a.id}"`, refuse),
        }),
      );
      const soundscape =
        m.soundscape || areas.length > 0
          ? compact({ ...(m.soundscape ?? {}), areas: areas.length > 0 ? areas : undefined })
          : undefined;
      const fog =
        state?.state === "fogged"
          ? compact({
              enabled: true,
              reveals: state.reveals ?? [],
              conceals: state.conceals,
              featherPx: state.featherPx,
            })
          : undefined;
      v1Maps.push(
        compact({
          id: m.id,
          name: m.name,
          width: m.width,
          height: m.height,
          layers: m.layers,
          scale: m.scale,
          grid: m.grid,
          oceanColor: m.oceanColor,
          wrapX: m.wrapX,
          water: world.water,
          soundscape,
          fog,
        }),
      );
      for (const r of m.regions ?? []) {
        v1Regions.push(
          compact({
            ...r,
            mapId: m.id,
            visibility: downVisibility(r.visibility, `region "${r.id}"`, refuse),
          }),
        );
      }
      for (const r of m.routes ?? []) {
        v1Routes.push(
          compact({
            ...r,
            mapId: m.id,
            visibility: downVisibility(r.visibility, `route "${r.id}"`, refuse),
          }),
        );
      }
      for (const p of m.pins ?? []) {
        const pinWhere = `${where} pin of note "${p.note}"`;
        const value = downVisibility(p.visibility, pinWhere, refuse);
        const n = noteById.get(p.note);
        if (!n) {
          plan.warnings.push(`${pinWhere}: no such note; dropped (it never shipped)`);
          continue;
        }
        const v1Value = v1PinVisibility(n.note.isSecret, n.note.visibility, undefined);
        if (!SHIPS.has(value) || !isValidVisibility(value)) {
          if (SHIPS.has(v1Value)) {
            plan.warnings.push(
              `${pinWhere} doesn't ship but its note does; dropped (v1 can't hide one pin)`,
            );
            continue;
          }
        } else if (value !== v1Value) {
          refuse.push(
            `${pinWhere} is "${value}" but v1 would show it as "${v1Value}" (its note's value)`,
          );
          continue;
        }
        const list = pinsByNote.get(n.file) ?? [];
        list.push({ mapId: m.id, x: p.x, y: p.y });
        pinsByNote.set(n.file, list);
        counts.pins++;
      }
      // v1 reads images and audio from public/: each must be there, the same bytes as the v2 copy.
      const srcs = [
        ...m.layers.flatMap((l) => [l.src, l.tileSrc]),
        ...(m.sound ?? []).flatMap((a) => [a.bed.src, a.bed.srcFallback]),
      ];
      for (const src of new Set(srcs.map(localAsset))) {
        if (!src || !opts.publicDir) continue;
        const inAtlas = tree.get(`${world.world.id}/_atlas/${src}`);
        const pub = path.join(opts.publicDir, src);
        const inPublic =
          fs.existsSync(pub) && fs.statSync(pub).isFile() ? fs.readFileSync(pub) : undefined;
        if (!inPublic && inAtlas) {
          refuse.push(
            `${where}: "${src}" is only under ${world.world.id}/_atlas/, not in public/; v1 reads public/`,
          );
        } else if (inPublic && inAtlas && !inPublic.equals(inAtlas)) {
          refuse.push(
            `${where}: "${src}" differs between ${world.world.id}/_atlas/ and public/; v1 would show public/'s`,
          );
        } else if (!inPublic) {
          plan.warnings.push(`${where}: "${src}" is in neither public/ nor the world's _atlas/`);
        } else {
          plan.publicAssets.set(src, inPublic);
        }
      }
      counts.maps++;
      counts.regions += (m.regions ?? []).length;
      counts.routes += (m.routes ?? []).length;
      counts.sound += areas.length;
    }
    const v1World = compact({
      schemaVersion: 1,
      name: world.world.name,
      maps: v1Maps,
      regions: v1Regions.length > 0 ? v1Regions : undefined,
      routes: v1Routes.length > 0 ? v1Routes : undefined,
      calendar: world.calendar,
      credits: world.credits,
      assetCredits: world.assetCredits,
      import: world.import,
    });
    const rel = `${world.world.id}/_atlas/world.yaml`;
    plan.files.set(rel, dumpYaml("# Schema v1, written by atlas:migrate-v2 --down.\n", v1World));
    plan.changed.push(rel);
  }

  const contentRel = path.relative(opts.root, opts.contentRoot).replace(/\\/g, "/");
  const consumed = new Set<string>();
  for (const [rel, bytes] of tree) {
    if (plan.files.has(rel)) continue;
    if (rel === "_atlas/atlas.yaml" || rel.startsWith("_atlas/campaigns/")) continue;
    const noteFile = contentRel ? `${contentRel}/${rel}` : rel;
    const pins = pinsByNote.get(noteFile);
    if (pins) consumed.add(noteFile);
    if (!pins) {
      plan.files.set(rel, bytes);
      continue;
    }
    const edit = addPlacements(bytes.toString("utf8"), pins);
    if (!edit.ok) {
      refuse.push(`${rel}: ${edit.reason}`);
      continue;
    }
    plan.files.set(rel, Buffer.from(edit.raw, "utf8"));
    plan.changed.push(rel);
    counts.notes++;
  }
  for (const file of pinsByNote.keys()) {
    if (!consumed.has(file)) refuse.push(`${file}: has pins but no file to write them back into`);
  }
  if (refuse.length > 0) throw new MigrationRefused(refuse);

  plan.changed.sort();
  plan.summary.push(
    `world: ${model.worlds.map((w) => w.world.id).join(", ")} (set the config's world to it)`,
    `maps: ${counts.maps}, regions ${counts.regions}, routes ${counts.routes}, pins ${counts.pins}, sound areas ${counts.sound}`,
    `notes with pins written back: ${counts.notes}`,
    `files: ${plan.files.size} (${plan.changed.length} changed); v1 reads map images and audio from public/, not the world's _atlas/`,
  );
  return plan;
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

/** `a` is `b` or inside it. */
function atOrUnder(a: string, b: string): boolean {
  const rel = path.relative(b, a);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** The real path of `p`, or of its nearest existing ancestor plus the rest. */
function realNearest(p: string): string {
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

/**
 * The DM's vault, when this machine knows it (`.local-atlas/editor-settings.json`
 * `vaultPath`, as the editor's Sync panel saves it): `--out` stays out of it too.
 */
export function vaultPathOf(root: string): string | null {
  try {
    const s = JSON.parse(
      fs.readFileSync(path.join(root, ".local-atlas", "editor-settings.json"), "utf8"),
    ) as { vaultPath?: unknown };
    return typeof s.vaultPath === "string" && s.vaultPath.trim() ? s.vaultPath.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Refuse an output folder that is the content root (or another folder that
 * must never be written, such as the vault: `guarded`), inside one, holds one
 * (any ancestor), or already has files: the migration only writes a fresh copy.
 */
export function checkOutDir(outDir: string, contentRoot: string, guarded: string[] = []): void {
  const fold = (p: string) =>
    process.platform === "darwin" || process.platform === "win32" ? p.toLowerCase() : p;
  const out = fold(realNearest(outDir));
  const reasons: string[] = [];
  for (const [what, dir] of [
    ["the content root", contentRoot],
    ...guarded.map((g) => ["the vault", g] as const),
  ] as const) {
    const g = fold(realNearest(dir));
    if (atOrUnder(out, g)) reasons.push(`--out ${outDir} is ${what} or inside it (${dir})`);
    else if (atOrUnder(g, out)) reasons.push(`--out ${outDir} holds ${what} (${dir})`);
  }
  if (reasons.length > 0) throw new MigrationRefused([...reasons, "write the copy elsewhere"]);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    throw new MigrationRefused([`--out ${outDir} is not empty; give an empty or new folder`]);
  }
}

/**
 * Write a plan's tree to `outDir` (checked by `checkOutDir` first): into a
 * sibling temp folder, renamed into place once every file is written, so a
 * failure never leaves half a tree at `outDir`.
 */
export function writeMigration(
  plan: MigrationPlan,
  outDir: string,
  contentRoot: string,
  guarded: string[] = [],
): void {
  checkOutDir(outDir, contentRoot, guarded);
  const target = path.resolve(outDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `.${path.basename(target)}-`));
  try {
    for (const [rel, bytes] of plan.files) {
      const to = path.join(staging, ...rel.split("/"));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, bytes);
    }
    if (fs.existsSync(target)) fs.rmdirSync(target); // empty, as checked
    fs.renameSync(staging, target);
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}

export type { AtlasModel, MapModel, WorldModel };
