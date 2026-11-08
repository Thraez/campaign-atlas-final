/**
 * The in-memory atlas model (ADR-0003): what the loader (R-12,
 * `scripts/atlas/loadAtlasModel.ts`) returns for a content root, whichever
 * schema version it is written in. v2 files load into it as validated
 * (`schemaV2.ts`); v1 content is presented as it through the one v1 adapter
 * (`v1Model.ts`), never rewritten to v2 files.
 *
 * Visibility values are kept as written; the per-campaign resolver (R-11a)
 * reads anything missing, unknown or not naming the campaign as `dm`.
 *
 * Types only, plus the loader's named error, so the app and `scripts/` share it.
 */
import type { Note } from "./readNote";
import type { MapScale } from "./schema";
import type {
  CampaignFileV2,
  MapV2,
  OceanPlacementV2,
  OceanV2,
  WorldFileV2,
} from "./schemaV2";

/**
 * A map in the model. As `MapV2`, except `scale` may be missing: a v1 map may
 * have none, and the adapter does not invent one.
 */
export type MapModel = Omit<MapV2, "scale"> & { scale?: MapScale };

/** A world in the model: a v2 `world.yaml` without its `schemaVersion`. */
export interface WorldModel extends Omit<WorldFileV2, "schemaVersion" | "maps"> {
  maps: MapModel[];
}

export interface AtlasModel {
  /** The schema version the content is written in. */
  schemaVersion: 1 | 2;
  /** The ocean from `atlas.yaml`; `null` for v1 content, which has none. */
  ocean: OceanV2 | null;
  /** Top-level map placements on the ocean; empty for v1. */
  onOcean: OceanPlacementV2[];
  /** In `atlas.yaml` `worlds` order. */
  worlds: WorldModel[];
  /** In `atlas.yaml` `campaigns` order. A campaign's `notes` is always set (missing reads as `hidden`). */
  campaigns: CampaignFileV2[];
}

/** What the loader returns. Warnings are DM-only: never copied into a player artifact. */
export interface LoadedAtlasModel {
  model: AtlasModel;
  warnings: string[];
}

/**
 * A note the build reads, with the world it belongs to: what the per-campaign
 * resolver (R-11a) takes as `{ world, note }`. v1: every note is the default
 * world's (as the build does today). v2: the world is the note's top-level
 * folder under the content root; a note outside every listed world folder
 * keeps that folder's name, or `""` at the root, so it belongs to no known
 * world and ships nowhere.
 */
export interface ModelNote {
  world: string;
  /** Relative path, as in warnings. */
  file: string;
  /** As `readNote` read it: id, title, aliases, frontmatter visibility, `atlas` block. */
  note: Note;
}

/**
 * What `loadAtlasModel` returns: the model, its DM-only warnings, and the notes
 * the build reads (folder-excluded notes, `_dm/` and the like, are left out).
 */
export interface LoadedAtlasContent extends LoadedAtlasModel {
  notes: ModelNote[];
}

/** One reason the content can't load: the file (relative path) and where in it. */
export interface ModelIssue {
  file: string;
  /** Path inside the file (`maps[2].parent`), or `(file)` for the file as a whole. */
  path: string;
  message: string;
}

export const WHOLE_FILE = "(file)";

export function formatIssue(i: ModelIssue): string {
  return i.path === WHOLE_FILE ? `${i.file}: ${i.message}` : `${i.file}: ${i.path}: ${i.message}`;
}

/** The loader's one error: every issue found, each naming its file and path. */
export class AtlasModelError extends Error {
  readonly issues: ModelIssue[];

  constructor(issues: ModelIssue[]) {
    const lines = issues.map(formatIssue);
    super(
      issues.length === 1
        ? lines[0]
        : `${issues.length} problems in the atlas content:\n${lines.map((l) => `  - ${l}`).join("\n")}`,
    );
    this.name = "AtlasModelError";
    this.issues = issues;
  }
}
