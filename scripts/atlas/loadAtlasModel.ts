/**
 * The one entry point that loads a content root into the in-memory atlas
 * model (ADR-0003, R-12), whichever schema version it is written in.
 *
 *   - v1: no `_atlas/atlas.yaml`, and `<defaultWorld>/_atlas/world.yaml` with no
 *     `schemaVersion` or `1`. Read by `loadWorldConfig` (unchanged, still used by
 *     its other callers) and presented through the one v1 adapter
 *     (`src/atlas/content/v1Model.ts`): one world, one campaign `main`.
 *   - v2: `_atlas/atlas.yaml` plus every listed world's `_atlas/world.yaml` and
 *     every listed campaign's `_atlas/campaigns/<id>.yaml`, all validated
 *     (`schemaV2.ts`), then checked across files (`v2Model.ts`).
 *   - A mix fails: an `atlas.yaml` next to a v1 `world.yaml`, a v2 `world.yaml`
 *     or campaign files with no `atlas.yaml`. So does any version above 2.
 *
 * Every note is read as the build reads it (`scanContentFolder` with the
 * config's `include`/`exclude`); symlinked notes and folders are refused. v1
 * pins come from the notes' `atlas.placements`; a v2 note may carry none.
 *
 * Returns the model, its warnings and the notes the build reads (each with its
 * world, for the resolver), or throws `AtlasModelError` naming every
 * problem's file and path. Warnings are DM-only: a caller must keep them out of
 * player artifacts (R-06: they go in the build's hidden-from-player set).
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  AtlasModelError,
  WHOLE_FILE,
  type LoadedAtlasContent,
  type ModelIssue,
  type ModelNote,
} from "../../src/atlas/content/atlasModel";
import { readNote, type Note } from "../../src/atlas/content/readNote";
import { scanContentFolder, type ContentFile } from "../../src/atlas/content/scanContentFolder";
import {
  validateAtlasFileV2,
  validateCampaignFileV2,
  validateWorldFileV2,
  type SchemaV2Error,
} from "../../src/atlas/content/schemaV2";
import { v1Model, V1ModelError, type V1Pin } from "../../src/atlas/content/v1Model";
import {
  assembleV2Model,
  type V2CampaignSource,
  type V2WorldSource,
} from "../../src/atlas/content/v2Model";
import { loadWorldConfig, WorldConfigError, type WorldConfig } from "./loadWorldConfig";
import { parseNoteFields } from "./parseFrontmatter";
import { readSchemaVersion, SchemaVersionError, type AtlasSchemaVersion } from "./schemaVersion";

export { AtlasModelError } from "../../src/atlas/content/atlasModel";
export type {
  AtlasModel,
  LoadedAtlasContent,
  LoadedAtlasModel,
  ModelIssue,
  ModelNote,
} from "../../src/atlas/content/atlasModel";

export interface LoadAtlasModelConfig {
  /** `atlas.config.json` `defaultWorld`: the v1 world. Not used for v2. */
  defaultWorld: string;
  /**
   * `atlas.config.json` `include`/`exclude`: which notes the build reads
   * (`scanContentFolder`). Required, and checked at run time: a caller that
   * forgot them would read `_dm/` notes as shipping ones.
   */
  include: readonly string[];
  exclude: readonly string[];
}

/**
 * What the loader returns to `scripts/`: the model, its warnings and notes, and
 * for v1 content the world file as `loadWorldConfig` read it (`v1Source`).
 *
 * The build assembles v1 maps, regions, routes and fog from `v1Source`, not
 * from the model: the model is lossy for v1 (fog colour, per-map water, items
 * v1 never drew but its DM build still lists), and the v1 player and DM
 * `atlas.json` must not change (R-13). Deleted with the v1 path at retire.
 */
export interface LoadedContent extends LoadedAtlasContent {
  v1Source?: WorldConfig;
}

export interface LoadAtlasModelOptions {
  /** Paths in messages are relative to this (default: the working directory). */
  root?: string;
}

/**
 * The one rule for an id used as a path segment (a world folder, a campaign
 * file, a campaign's output dirs): letters, digits, `_`, `-` and `.`; no
 * separators, no leading dot or dash, and no trailing dot (Windows drops it,
 * so `a.` and `a` would be one folder). The scan registry reuses it.
 */
export const SAFE_ID = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class Loader {
  readonly issues: ModelIssue[] = [];

  constructor(
    readonly contentRoot: string,
    readonly root: string,
  ) {}

  rel(p: string): string {
    return path.relative(this.root, p).replace(/\\/g, "/");
  }

  issue(file: string, pathInFile: string, message: string): void {
    this.issues.push({ file: this.rel(file), path: pathInFile, message });
  }

  /** Throw every issue so far, if any. */
  check(): void {
    if (this.issues.length > 0) throw new AtlasModelError(this.issues);
  }

  /** Parse a YAML file; `undefined` (with an issue) if it can't be. */
  readYaml(file: string): unknown {
    const raw = fs.readFileSync(file, "utf8");
    if (/^\s*```/m.test(raw)) {
      this.issue(file, WHOLE_FILE, "contains markdown code fences (```); it must be pure YAML");
      return undefined;
    }
    try {
      return yaml.load(raw) ?? {};
    } catch (e) {
      this.issue(file, WHOLE_FILE, `invalid YAML — ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }

  /** The file's declared version (`null`: none); `undefined` (with an issue) when invalid. */
  version(file: string, data: unknown): AtlasSchemaVersion | null | undefined {
    if (!isObj(data)) {
      this.issue(file, WHOLE_FILE, "top level must be a YAML mapping");
      return undefined;
    }
    try {
      return readSchemaVersion(data, this.rel(file));
    } catch (e) {
      if (!(e instanceof SchemaVersionError)) throw e;
      this.issue(file, "schemaVersion", e.message.replace(`${this.rel(file)}: `, ""));
      return undefined;
    }
  }

  schemaErrors(file: string, errors: SchemaV2Error[]): void {
    for (const e of errors) this.issue(file, e.path, e.message);
  }

  /** Every `<contentRoot>/<folder>/_atlas/world.yaml`, by folder name. */
  worldFiles(): Map<string, string> {
    const out = new Map<string, string>();
    for (const d of fs.readdirSync(this.contentRoot, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith(".") || d.name === "_atlas") continue;
      const f = path.join(this.contentRoot, d.name, "_atlas", "world.yaml");
      if (fs.existsSync(f)) out.set(d.name, f);
    }
    return out;
  }

  /** True when `p` or anything it resolves through leaves the content root. */
  outsideRoot(p: string): boolean {
    const root = fs.realpathSync(this.contentRoot);
    const real = fs.realpathSync(p);
    return real !== root && !real.startsWith(root + path.sep);
  }

  /**
   * Every `.md` file under the content root, walked as the build walks it
   * (`readContentFiles`: every folder, `.md` exactly). A symlinked folder or
   * note is refused: it could lead outside the root, and a walk that skipped
   * it would skip its pin check too.
   */
  noteFiles(dir = this.contentRoot): ContentFile[] {
    const out: ContentFile[] = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isSymbolicLink()) {
        let isDir = false;
        try {
          isDir = fs.statSync(p).isDirectory();
        } catch {
          // a broken link: refused below only if it names a note
        }
        if (isDir || d.name.endsWith(".md")) {
          this.issue(
            p,
            WHOLE_FILE,
            `is a symlink; notes and folders in the content root must be real files and folders`,
          );
        }
      } else if (d.isDirectory()) {
        out.push(...this.noteFiles(p));
      } else if (d.isFile() && d.name.endsWith(".md")) {
        out.push({
          contentPath: path.relative(this.contentRoot, p).replace(/\\/g, "/"),
          relPath: this.rel(p),
          raw: fs.readFileSync(p, "utf8"),
        });
      }
    }
    return out;
  }
}

interface ReadNotes {
  /** The notes the build reads, with their content-root-relative path. */
  read: { contentPath: string; note: Note }[];
  /** Every note, folder-excluded ones too (for checks that must see everything). */
  all: Note[];
}

/** Read every note; a symlink or unreadable frontmatter is an issue. */
function readNotes(l: Loader, config: LoadAtlasModelConfig): ReadNotes {
  for (const key of ["include", "exclude"] as const) {
    const v: unknown = config[key];
    if (!Array.isArray(v) || !v.every((g) => typeof g === "string")) {
      throw new TypeError(
        `loadAtlasModel: config.${key} must be atlas.config.json's ${key} list (got ${JSON.stringify(v)})`,
      );
    }
  }
  const files = l.noteFiles();
  for (const f of files) {
    const note = readNote(f.raw, f.relPath);
    if (note.parseError !== undefined) {
      l.issue(
        path.join(l.root, f.relPath),
        "frontmatter",
        `can't be read, so it can't be checked: ${note.parseError}`,
      );
    }
  }
  l.check();
  const scan = scanContentFolder(files, {
    include: config.include,
    exclude: config.exclude,
  });
  const contentPathOf = new Map(files.map((f) => [f.relPath, f.contentPath]));
  return {
    read: scan.notes.map((note) => ({ contentPath: contentPathOf.get(note.relPath)!, note })),
    all: [...scan.notes, ...scan.excluded],
  };
}

/** Load a content root into the atlas model. Throws `AtlasModelError`. */
export function loadAtlasModel(
  contentRoot: string,
  config: LoadAtlasModelConfig,
  opts: LoadAtlasModelOptions = {},
): LoadedContent {
  const l = new Loader(contentRoot, opts.root ?? process.cwd());
  const atlasDir = path.join(contentRoot, "_atlas");
  const atlasFile = path.join(atlasDir, "atlas.yaml");
  const atlasYml = path.join(atlasDir, "atlas.yml");
  if (fs.existsSync(atlasYml)) {
    l.issue(atlasYml, WHOLE_FILE, "the atlas file must be named atlas.yaml, not atlas.yml");
    l.check();
  }
  const notes = readNotes(l, config);
  return fs.existsSync(atlasFile) ? loadV2(l, atlasFile, notes) : loadV1(l, config, notes);
}

// ---------------------------------------------------------------------------
// v1
// ---------------------------------------------------------------------------

/**
 * Today's pins: each read note's `atlas.placements` (the legacy `atlas.x`/`y`
 * only when it has none), as the build reads them. A pin's visibility is its
 * note's, as R-20 writes it. A placement behind a secret (`secretId`) loads as
 * `dm`: the model has no secret locks, so it can't ship one safely.
 */
function v1Pins(notes: ReadNotes, warnings: string[]): V1Pin[] {
  const pins: V1Pin[] = [];
  for (const { note } of notes.read) {
    const placements = parseNoteFields(note).atlas.placements ?? [];
    const { x, y } = note.atlas;
    const list =
      placements.length > 0
        ? placements
        : typeof x === "number" && typeof y === "number"
          ? [{ mapId: undefined, x, y, secretId: undefined }]
          : [];
    list.forEach((p, i) => {
      // A secret note (not player-visible, or `publish: false`) never ships, so
      // neither does its pin: the build drops it (`isSecret`).
      let visibility: string = note.isSecret ? "dm" : note.visibility;
      if (p.secretId !== undefined) {
        visibility = "dm";
        warnings.push(
          `${note.relPath}: atlas.placements[${i}] is behind secret "${p.secretId}"; its pin loads as "dm"`,
        );
      }
      pins.push({ note: note.id, mapId: p.mapId, x: p.x, y: p.y, visibility });
    });
  }
  return pins;
}

function loadV1(l: Loader, config: LoadAtlasModelConfig, notes: ReadNotes): LoadedContent {
  const campaignsDir = path.join(l.contentRoot, "_atlas", "campaigns");
  if (fs.existsSync(campaignsDir)) {
    l.issue(
      campaignsDir,
      WHOLE_FILE,
      "campaign files are schema v2 and need _atlas/atlas.yaml, which this content root doesn't have",
    );
  }
  // No v2 world file (and nothing above 2) in any world folder without an
  // atlas.yaml. The default world's file is loadWorldConfig's to check: it
  // refuses schemaVersion 2 and anything above, naming the file. Another
  // folder's file v1 never reads, so only its version counts here.
  const worldId = config.defaultWorld;
  for (const [folder, file] of l.worldFiles()) {
    if (folder === worldId) continue;
    let data: unknown;
    try {
      data = yaml.load(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!isObj(data)) continue;
    if (l.version(file, data) === 2) {
      l.issue(
        file,
        "schemaVersion",
        "a schema v2 world.yaml needs _atlas/atlas.yaml at the content root, which is missing",
      );
    }
  }
  l.check();

  const worldFile = path.join(l.contentRoot, worldId, "_atlas", "world.yaml");
  const worldRel = l.rel(worldFile);
  let wc: ReturnType<typeof loadWorldConfig>;
  try {
    wc = loadWorldConfig(l.contentRoot, worldId, l.root);
  } catch (e) {
    if (!(e instanceof WorldConfigError)) throw e;
    throw new AtlasModelError([
      { file: worldRel, path: WHOLE_FILE, message: e.message.replace(`${worldRel}: `, "") },
    ]);
  }

  const pinWarnings: string[] = [];
  const pins = v1Pins(notes, pinWarnings);
  try {
    const loaded = v1Model({
      worldId,
      pins,
      name: wc?.name,
      maps: wc?.maps ?? [],
      regions: wc?.regions,
      routes: wc?.routes,
      fogs: wc?.fogs,
      calendar: wc?.calendar,
      importConfig: wc?.importConfig,
      credits: wc?.credits,
      assetCredits: wc?.assetCredits,
    });
    return {
      model: loaded.model,
      warnings: [
        ...(wc?.warnings ?? []),
        ...pinWarnings,
        ...loaded.warnings.map((w) => `${worldRel}: ${w}`),
      ],
      notes: notes.read.map(({ note }) => ({ world: worldId, file: note.relPath, note })),
      v1Source: wc ?? undefined,
    };
  } catch (e) {
    if (!(e instanceof V1ModelError)) throw e;
    throw new AtlasModelError([{ file: worldRel, path: WHOLE_FILE, message: e.message }]);
  }
}

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

function loadV2(l: Loader, atlasFile: string, notes: ReadNotes): LoadedAtlasContent {
  if (fs.lstatSync(atlasFile).isSymbolicLink()) {
    l.issue(atlasFile, WHOLE_FILE, "is a symlink; atlas.yaml must be a real file");
    l.check();
  }
  const atlasRaw = l.readYaml(atlasFile);
  l.check();
  const atlasVersion = l.version(atlasFile, atlasRaw);
  l.check();
  if (atlasVersion !== 2) {
    l.issue(
      atlasFile,
      "schemaVersion",
      `atlas.yaml exists only in schema v2, so it must say schemaVersion: 2 (got ${atlasVersion ?? "none"})`,
    );
    l.check();
  }
  const atlas = validateAtlasFileV2(atlasRaw);
  if (!atlas.ok) l.schemaErrors(atlasFile, atlas.errors);
  l.check();
  if (!atlas.ok) throw new Error("unreachable");
  const { worlds: worldIds, campaigns: campaignIds } = atlas.value;

  // --- worlds ----------------------------------------------------------------
  const worlds: V2WorldSource[] = [];
  const listedWorlds = new Set<string>();
  worldIds.forEach((id, i) => {
    listedWorlds.add(id);
    if (!SAFE_ID.test(id) || id === "_atlas") {
      l.issue(atlasFile, `worlds[${i}]`, `"${id}" is not a valid world folder name`);
      return;
    }
    // A symlinked world folder never gets here: the note walk refuses every
    // symlinked folder in the content root. world.yaml itself is checked below.
    const dir = path.join(l.contentRoot, id);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      l.issue(atlasFile, `worlds[${i}]`, `world "${id}" has no folder (${l.rel(dir)})`);
      return;
    }
    const file = path.join(dir, "_atlas", "world.yaml");
    if (!fs.existsSync(file)) {
      l.issue(
        file,
        WHOLE_FILE,
        `world "${id}" is listed in atlas.yaml but has no _atlas/world.yaml`,
      );
      return;
    }
    if (fs.lstatSync(file).isSymbolicLink() || l.outsideRoot(file)) {
      l.issue(
        file,
        WHOLE_FILE,
        "is a symlink or leads outside the content root; it must be a real file",
      );
      return;
    }
    const data = l.readYaml(file);
    if (data === undefined) return;
    const version = l.version(file, data);
    if (version === undefined) return;
    if (version !== 2) {
      l.issue(
        file,
        "schemaVersion",
        `a v1 world.yaml (schemaVersion ${version ?? "missing"}) next to _atlas/atlas.yaml; ` +
          "every file of a v2 content root must say schemaVersion: 2",
      );
      return;
    }
    const w = validateWorldFileV2(data);
    if (!w.ok) l.schemaErrors(file, w.errors);
    else worlds.push({ file: l.rel(file), folder: id, value: w.value });
  });
  for (const [folder, file] of l.worldFiles()) {
    if (listedWorlds.has(folder)) continue;
    const data = l.readYaml(file);
    if (data === undefined) continue;
    const version = l.version(file, data);
    if (version === undefined) continue;
    l.issue(
      file,
      WHOLE_FILE,
      version === 2
        ? `world "${folder}" is not listed in atlas.yaml worlds`
        : `a v1 world.yaml (schemaVersion ${version ?? "missing"}) next to _atlas/atlas.yaml`,
    );
  }

  // --- campaign files --------------------------------------------------------
  const campaignsDir = path.join(l.contentRoot, "_atlas", "campaigns");
  const files = new Map<string, string>();
  const symlinked = new Set<string>();
  if (fs.existsSync(campaignsDir)) {
    for (const d of fs.readdirSync(campaignsDir, { withFileTypes: true })) {
      if (d.name.startsWith(".")) continue;
      const p = path.join(campaignsDir, d.name);
      if (d.isSymbolicLink()) {
        l.issue(p, WHOLE_FILE, "is a symlink; campaign files must be real files");
        symlinked.add(d.name.replace(/\.ya?ml$/, ""));
      } else if (d.isFile() && d.name.endsWith(".yaml")) {
        files.set(d.name.slice(0, -".yaml".length), p);
      } else if (d.isFile() && d.name.endsWith(".yml")) {
        l.issue(p, WHOLE_FILE, "campaign files must end in .yaml, not .yml");
      }
    }
  }
  const campaigns: V2CampaignSource[] = [];
  const listedCampaigns = new Set(campaignIds);
  campaignIds.forEach((id, i) => {
    const file = path.join(campaignsDir, `${id}.yaml`);
    if (!SAFE_ID.test(id)) {
      l.issue(atlasFile, `campaigns[${i}]`, `"${id}" is not a valid campaign id`);
      return;
    }
    if (symlinked.has(id)) return;
    if (!files.has(id)) {
      l.issue(atlasFile, `campaigns[${i}]`, `campaign "${id}" has no file (${l.rel(file)})`);
      return;
    }
    const data = l.readYaml(file);
    if (data === undefined) return;
    const c = validateCampaignFileV2(data);
    if (!c.ok) {
      l.schemaErrors(file, c.errors);
      return;
    }
    campaigns.push({
      file: l.rel(file),
      fileId: id,
      value: c.value,
      notesMissing: isObj(data) && data.notes === undefined,
    });
  });
  for (const [id, file] of files) {
    if (!listedCampaigns.has(id)) {
      l.issue(file, WHOLE_FILE, `campaign file "${id}.yaml" is not listed in atlas.yaml campaigns`);
    }
  }

  // --- notes: pins live in world.yaml in v2 ----------------------------------
  // Every note, folder-excluded ones too: none may carry a pin.
  for (const note of notes.all) {
    const file = path.join(l.root, note.relPath);
    for (const key of ["placements", "x", "y"] as const) {
      if (note.atlas[key] !== undefined) {
        l.issue(
          file,
          `atlas.${key}`,
          "a v2 note can't place itself on a map; pins live in world.yaml maps[].pins (the migration moves them)",
        );
      }
    }
  }
  l.check();

  const result = assembleV2Model({
    atlas: { file: l.rel(atlasFile), value: atlas.value },
    worlds,
    campaigns,
  });
  if (result.issues.length > 0) throw new AtlasModelError(result.issues);
  const modelNotes: ModelNote[] = notes.read.map(({ contentPath, note }) => {
    const slash = contentPath.indexOf("/");
    return { world: slash < 0 ? "" : contentPath.slice(0, slash), file: note.relPath, note };
  });
  return { model: result.model, warnings: result.warnings, notes: modelNotes };
}
