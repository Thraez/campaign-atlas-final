/**
 * Build stage 1, load model (R-13): the content root through R-12's loader,
 * for v1 and v2 alike, and the campaign a player build resolves.
 *
 * The build never reads `world.yaml` itself and never picks a world: every
 * world comes from `model.worlds`. The config's v1 world key is passed to
 * the loader only, which reads it for v1 content.
 *
 * Warnings are DM-only (R-06): `worldWarnings` go in the build's warnings and
 * its hidden-from-player set; `consoleWarnings` are printed to the console
 * only (v1's adapter notes, which the v1 build never reported and whose
 * absence keeps the v1 DM `atlas.json` unchanged).
 */
import type { AtlasModel, ModelNote } from "../../../src/atlas/content/atlasModel";
import { V1_CAMPAIGN_ID } from "../../../src/atlas/content/v1Model";
import { loadAtlasModel, type LoadAtlasModelConfig } from "../loadAtlasModel";
import type { WorldConfig } from "../loadWorldConfig";

/** A reason the build can't start that isn't a content problem (a bad `--campaign`). */
export class BuildStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildStageError";
  }
}

export interface BuildModel {
  model: AtlasModel;
  notes: ModelNote[];
  /** v1 only: the world file as `loadWorldConfig` read it (see `LoadedContent`); absent with no world.yaml. */
  v1Source?: WorldConfig;
  /** `world.yaml` and model warnings, every world: DM-only. */
  worldWarnings: string[];
  /** v1 adapter warnings the v1 build never reported: console only. */
  consoleWarnings: string[];
  /** The campaign a player build resolves; `null` in a DM build. */
  campaign: string | null;
}

/**
 * Which campaign a player build resolves: the one `--campaign` names, else
 * the content's only campaign (v1: `main`). Several campaigns and no
 * `--campaign` fails: one output per run until R-17 builds them all.
 */
export function pickCampaign(model: AtlasModel, requested: string | undefined): string {
  const ids = model.campaigns.map((c) => c.id);
  if (requested !== undefined) {
    if (!ids.includes(requested)) {
      throw new BuildStageError(
        `--campaign "${requested}" is not a campaign of this content (${ids.join(", ") || "none"})`,
      );
    }
    return requested;
  }
  if (ids.length === 1) return ids[0];
  throw new BuildStageError(
    `this content has ${ids.length} campaigns (${ids.join(", ")}); a player build builds one: pass --campaign <id>`,
  );
}

/** Load the content root. Throws `AtlasModelError` (content) or `BuildStageError`. */
export function loadBuildModel(
  contentDir: string,
  config: LoadAtlasModelConfig,
  root: string,
  opts: { player: boolean; campaign?: string },
): BuildModel {
  const loaded = loadAtlasModel(contentDir, config, { root });
  const { model, notes, warnings, v1Source } = loaded;
  let worldWarnings: string[];
  let consoleWarnings: string[];
  if (model.schemaVersion === 1) {
    // v1: world.yaml's own warnings, as the build always reported them.
    worldWarnings = [...(v1Source?.warnings ?? [])];
    const own = new Set(worldWarnings);
    consoleWarnings = warnings.filter((w) => !own.has(w));
  } else {
    worldWarnings = [...warnings];
    consoleWarnings = [];
  }
  if (
    model.schemaVersion === 1 &&
    opts.campaign !== undefined &&
    opts.campaign !== V1_CAMPAIGN_ID
  ) {
    throw new BuildStageError(
      `--campaign "${opts.campaign}": v1 content has one campaign, "${V1_CAMPAIGN_ID}"`,
    );
  }
  const campaign = opts.player ? pickCampaign(model, opts.campaign) : null;
  return { model, notes, v1Source, worldWarnings, consoleWarnings, campaign };
}
