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
 * Returns the model and its warnings, or throws `AtlasModelError` naming every
 * problem's file and path. Warnings are DM-only: a caller must keep them out of
 * player artifacts (R-06: they go in the build's hidden-from-player set).
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  AtlasModelError,
  WHOLE_FILE,
  type LoadedAtlasModel,
  type ModelIssue,
} from "../../src/atlas/content/atlasModel";
import { readNote } from "../../src/atlas/content/readNote";
import {
  validateAtlasFileV2,
  validateCampaignFileV2,
  validateWorldFileV2,
  type SchemaV2Error,
} from "../../src/atlas/content/schemaV2";
import { v1Model, V1ModelError } from "../../src/atlas/content/v1Model";
import {
  assembleV2Model,
  type V2CampaignSource,
  type V2WorldSource,
} from "../../src/atlas/content/v2Model";
import { loadWorldConfig, WorldConfigError } from "./loadWorldConfig";
import { readSchemaVersion, SchemaVersionError, type AtlasSchemaVersion } from "./schemaVersion";

export { AtlasModelError } from "../../src/atlas/content/atlasModel";
export type { AtlasModel, LoadedAtlasModel, ModelIssue } from "../../src/atlas/content/atlasModel";

export interface LoadAtlasModelConfig {
  /** `atlas.config.json` `defaultWorld`: the v1 world. Not used for v2. */
  defaultWorld: string;
}

export interface LoadAtlasModelOptions {
  /** Paths in messages are relative to this (default: the working directory). */
  root?: string;
}

/** A folder or file id used as a path segment: no separators, no `..`, no leading dot. */
const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

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

  /** Every `.md` file under the content root (not in dot folders or `_atlas`). */
  noteFiles(dir = this.contentRoot): string[] {
    const out: string[] = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith(".")) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name !== "_atlas") out.push(...this.noteFiles(p));
      } else if (d.isFile() && d.name.toLowerCase().endsWith(".md")) {
        out.push(p);
      }
    }
    return out;
  }
}

/** Load a content root into the atlas model. Throws `AtlasModelError`. */
export function loadAtlasModel(
  contentRoot: string,
  config: LoadAtlasModelConfig,
  opts: LoadAtlasModelOptions = {},
): LoadedAtlasModel {
  const l = new Loader(contentRoot, opts.root ?? process.cwd());
  const atlasDir = path.join(contentRoot, "_atlas");
  const atlasFile = path.join(atlasDir, "atlas.yaml");
  const atlasYml = path.join(atlasDir, "atlas.yml");
  if (fs.existsSync(atlasYml)) {
    l.issue(atlasYml, WHOLE_FILE, "the atlas file must be named atlas.yaml, not atlas.yml");
    l.check();
  }
  return fs.existsSync(atlasFile) ? loadV2(l, atlasFile) : loadV1(l, config);
}

// ---------------------------------------------------------------------------
// v1
// ---------------------------------------------------------------------------

function loadV1(l: Loader, config: LoadAtlasModelConfig): LoadedAtlasModel {
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

  try {
    const loaded = v1Model({
      worldId,
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
      warnings: [...(wc?.warnings ?? []), ...loaded.warnings.map((w) => `${worldRel}: ${w}`)],
    };
  } catch (e) {
    if (!(e instanceof V1ModelError)) throw e;
    throw new AtlasModelError([{ file: worldRel, path: WHOLE_FILE, message: e.message }]);
  }
}

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

function loadV2(l: Loader, atlasFile: string): LoadedAtlasModel {
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
  if (fs.existsSync(campaignsDir)) {
    for (const d of fs.readdirSync(campaignsDir, { withFileTypes: true })) {
      if (d.name.startsWith(".")) continue;
      const p = path.join(campaignsDir, d.name);
      if (d.isFile() && d.name.endsWith(".yaml")) files.set(d.name.slice(0, -".yaml".length), p);
      else if (d.isFile() && d.name.endsWith(".yml")) {
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
  for (const file of l.noteFiles()) {
    const note = readNote(fs.readFileSync(file, "utf8"), l.rel(file));
    if (note.parseError !== undefined) {
      l.issue(
        file,
        "frontmatter",
        `can't be read, so it can't be checked for pins: ${note.parseError}`,
      );
      continue;
    }
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
  return { model: result.model, warnings: result.warnings };
}
