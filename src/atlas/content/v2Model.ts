/**
 * The v2 cross-file rules (ADR-0003) and the v2 model. Takes the already
 * validated files (`schemaV2.ts` checks each file's shape) and checks what
 * spans files: worlds, map ids, the map tree, the ocean, campaign files and
 * per-campaign visibility keys. Each broken rule is an issue naming its file
 * and path; the loader throws them all as one `AtlasModelError`.
 *
 * Rules that need the file system (a world with no folder, a campaign listed
 * with no file or a file not listed, a note with `atlas.placements`) are the
 * loader's (`scripts/atlas/loadAtlasModel.ts`).
 *
 * Visibility values stay as written. An unknown one is a warning naming the
 * item (the resolver reads it as `dm`); a per-campaign key that isn't a listed
 * campaign is an error, so a typo can't silently hide an item in the real
 * campaign.
 *
 * Pure: no file IO.
 */
import type { AtlasModel, ModelIssue, WorldModel } from "./atlasModel";
import type {
  AtlasFileV2,
  CampaignFileV2,
  VisibilityValue,
  WorldFileV2,
  WrittenVisibility,
} from "./schemaV2";
import { isValidVisibility } from "./visibility";

export interface V2AtlasSource {
  file: string;
  value: AtlasFileV2;
}

export interface V2WorldSource {
  file: string;
  /** The world's folder name: its id in `atlas.yaml` `worlds`. */
  folder: string;
  value: WorldFileV2;
}

export interface V2CampaignSource {
  file: string;
  /** The id the file name gives (`campaigns/<id>.yaml`). */
  fileId: string;
  value: CampaignFileV2;
  /** The file has no `notes:` field (it reads as `hidden`, with a warning). */
  notesMissing: boolean;
}

export interface V2Sources {
  atlas: V2AtlasSource;
  /** In `atlas.yaml` `worlds` order. */
  worlds: V2WorldSource[];
  /** In `atlas.yaml` `campaigns` order. */
  campaigns: V2CampaignSource[];
}

export interface V2ModelResult {
  model: AtlasModel;
  warnings: string[];
  /** Empty when the content is valid; otherwise the model must not be used. */
  issues: ModelIssue[];
}

interface MapRef {
  file: string;
  path: string;
  world: string;
  parent?: string;
}

function duplicates(list: string[], file: string, key: string, what: string): ModelIssue[] {
  const seen = new Set<string>();
  const out: ModelIssue[] = [];
  list.forEach((id, i) => {
    if (seen.has(id)) out.push({ file, path: `${key}[${i}]`, message: `${what} "${id}" is listed twice` });
    seen.add(id);
  });
  return out;
}

/** Check one visibility value: unknown values warn, unlisted campaign keys fail. */
function checkVisibility(
  v: VisibilityValue | undefined,
  file: string,
  path: string,
  item: string,
  campaigns: ReadonlySet<string>,
  issues: ModelIssue[],
  warnings: string[],
): void {
  if (v === undefined) return;
  const warnBad = (value: WrittenVisibility, at: string) => {
    if (!isValidVisibility(value)) {
      warnings.push(`${file}: ${at}: ${item} has invalid visibility "${value}" — it resolves to "dm"`);
    }
  };
  if (typeof v === "string") {
    warnBad(v, path);
    return;
  }
  for (const [campaign, value] of Object.entries(v)) {
    if (!campaigns.has(campaign)) {
      issues.push({
        file,
        path: `${path}.${campaign}`,
        message: `${item}: "${campaign}" is not a campaign listed in atlas.yaml`,
      });
      continue;
    }
    warnBad(value, `${path}.${campaign}`);
  }
}

function checkWorldVisibility(
  src: V2WorldSource,
  campaigns: ReadonlySet<string>,
  issues: ModelIssue[],
  warnings: string[],
): void {
  const { file, value } = src;
  const check = (v: VisibilityValue | undefined, path: string, item: string) =>
    checkVisibility(v, file, path, item, campaigns, issues, warnings);
  value.maps.forEach((m, i) => {
    const mp = `maps[${i}]`;
    check(m.visibility, `${mp}.visibility`, `map "${m.id}"`);
    m.regions?.forEach((r, j) => check(r.visibility, `${mp}.regions[${j}].visibility`, `region "${r.id}"`));
    m.routes?.forEach((r, j) => check(r.visibility, `${mp}.routes[${j}].visibility`, `route "${r.id}"`));
    m.pins?.forEach((p, j) => check(p.visibility, `${mp}.pins[${j}].visibility`, `pin of note "${p.note}"`));
    m.sound?.forEach((s, j) => check(s.visibility, `${mp}.sound[${j}].visibility`, `sound area "${s.id}"`));
  });
  for (const [note, entry] of Object.entries(value.notes ?? {})) {
    check(entry.visibility, `notes.${note}.visibility`, `notes: entry "${note}"`);
    if (entry.basedOn !== undefined && !isValidVisibility(entry.basedOn)) {
      warnings.push(
        `${file}: notes.${note}.basedOn: invalid visibility "${entry.basedOn}" — the entry resolves to "dm"`,
      );
    }
  }
}

/** Check the cross-file rules and assemble the v2 model. */
export function assembleV2Model(src: V2Sources): V2ModelResult {
  const issues: ModelIssue[] = [];
  const warnings: string[] = [];
  const atlas = src.atlas.value;
  const atlasFile = src.atlas.file;
  const campaignIds = new Set(atlas.campaigns);

  issues.push(...duplicates(atlas.worlds, atlasFile, "worlds", "world"));
  issues.push(...duplicates(atlas.campaigns, atlasFile, "campaigns", "campaign"));

  // --- worlds and map ids --------------------------------------------------
  const maps = new Map<string, MapRef>();
  for (const w of src.worlds) {
    if (w.value.world.id !== w.folder) {
      issues.push({
        file: w.file,
        path: "world.id",
        message: `world id "${w.value.world.id}" doesn't match its folder "${w.folder}"`,
      });
    }
    w.value.maps.forEach((m, i) => {
      const path = `maps[${i}].id`;
      const prior = maps.get(m.id);
      if (prior) {
        issues.push({
          file: w.file,
          path,
          message: `map id "${m.id}" is already used (${prior.file} ${prior.path}); map ids must be unique across every world`,
        });
        return;
      }
      maps.set(m.id, { file: w.file, path: `maps[${i}]`, world: w.folder, parent: m.parent });
    });
  }

  // --- the map tree ----------------------------------------------------------
  for (const [id, ref] of maps) {
    if (ref.parent === undefined) continue;
    const parent = maps.get(ref.parent);
    if (!parent) {
      issues.push({ file: ref.file, path: `${ref.path}.parent`, message: `map "${id}": unknown parent "${ref.parent}"` });
    } else if (parent.world !== ref.world) {
      issues.push({
        file: ref.file,
        path: `${ref.path}.parent`,
        message: `map "${id}": parent "${ref.parent}" is in world "${parent.world}"; a parent must be in the same world`,
      });
    }
  }
  const inCycle = new Set<string>();
  for (const start of maps.keys()) {
    const chain: string[] = [];
    const onChain = new Set<string>();
    let cur: string | undefined = start;
    while (cur !== undefined && maps.has(cur) && !inCycle.has(cur)) {
      if (onChain.has(cur)) {
        const cycle = chain.slice(chain.indexOf(cur));
        cycle.forEach((c) => inCycle.add(c));
        const first = maps.get(cur)!;
        issues.push({
          file: first.file,
          path: `${first.path}.parent`,
          message: `the map tree has a cycle: ${[...cycle, cur].join(" -> ")}`,
        });
        break;
      }
      chain.push(cur);
      onChain.add(cur);
      cur = maps.get(cur)!.parent;
    }
  }

  // --- zoom handoff (R-32) ----------------------------------------------------
  for (const w of src.worlds) {
    w.value.maps.forEach((m, i) => {
      if (!m.frame || m.enterZoom === undefined || !m.zoom || !(m.width > 0)) return;
      if (!(m.frame.width > 0)) return;
      // Entering at the parent's enterZoom shows the same ground at this zoom on the child.
      const landing = m.enterZoom + Math.log2(m.frame.width / m.width);
      if (landing < m.zoom.min) {
        warnings.push(
          `${w.file}: maps[${i}].enterZoom: entering "${m.id}" at ${m.enterZoom} lands at zoom ` +
            `${landing.toFixed(2)} on it, below its zoom.min ${m.zoom.min}; the viewer lowers ` +
            `the zoom it leaves at to keep the handoff from flipping back`,
        );
      }
    });
  }

  // --- the ocean --------------------------------------------------------------
  const placed = new Map<string, number>();
  atlas.onOcean.forEach((p, i) => {
    const path = `onOcean[${i}].map`;
    const ref = maps.get(p.map);
    if (!ref) {
      issues.push({ file: atlasFile, path, message: `unknown map "${p.map}"` });
    } else if (ref.parent !== undefined) {
      issues.push({
        file: atlasFile,
        path,
        message: `map "${p.map}" has a parent ("${ref.parent}"); only top-level maps sit on the ocean`,
      });
    }
    if (placed.has(p.map)) {
      issues.push({
        file: atlasFile,
        path,
        message: `map "${p.map}" is placed on the ocean twice (also onOcean[${placed.get(p.map)}])`,
      });
    } else {
      placed.set(p.map, i);
    }
  });
  for (const [id, ref] of maps) {
    if (ref.parent === undefined && !placed.has(id)) {
      issues.push({
        file: atlasFile,
        path: "onOcean",
        message: `top-level map "${id}" (${ref.file} ${ref.path}) is not placed on the ocean`,
      });
    }
  }

  // --- visibility keys -------------------------------------------------------
  for (const w of src.worlds) checkWorldVisibility(w, campaignIds, issues, warnings);

  // --- campaign files --------------------------------------------------------
  for (const c of src.campaigns) {
    if (c.value.id !== c.fileId) {
      issues.push({
        file: c.file,
        path: "id",
        message: `campaign id "${c.value.id}" doesn't match its file name "${c.fileId}.yaml"`,
      });
    }
    for (const mapId of Object.keys(c.value.maps)) {
      if (!maps.has(mapId)) {
        issues.push({ file: c.file, path: `maps.${mapId}`, message: `unknown map "${mapId}"` });
      }
    }
    if (c.notesMissing) {
      warnings.push(
        `${c.file}: no notes: field — reads as "notes: hidden": a note ships to this campaign only ` +
          `if a world.yaml notes: entry names it as player or rumor`,
      );
    }
  }

  const worlds: WorldModel[] = src.worlds.map((w) => {
    const { schemaVersion: _v, ...rest } = w.value;
    return rest;
  });
  const model: AtlasModel = {
    schemaVersion: 2,
    ocean: atlas.ocean,
    onOcean: atlas.onOcean,
    worlds,
    campaigns: src.campaigns.map((c) => c.value),
  };
  return { model, warnings, issues };
}
