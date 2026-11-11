import type {
  AssetCredit,
  AtlasProject,
  CreditsConfig,
  MapDocument,
  World,
} from "@/atlas/content/schema";

export interface ViewCredits {
  credits?: CreditsConfig;
  assetCredits?: Record<string, AssetCredit>;
}

/**
 * The credits that go with what the viewer shows (R-33).
 * - v1 output (no ocean): the first world's, as the viewer always did.
 * - v2, a map in view: the world of that map (`map.worldId`).
 * - v2, the ocean (`map` null): every world in the output. A switch is off only
 *   when every world turns it off; the asset registries are merged.
 */
export function creditsForView(
  project: Pick<AtlasProject, "worlds" | "ocean">,
  map: Pick<MapDocument, "worldId"> | null,
): ViewCredits {
  if (!project.ocean) return pick(project.worlds[0]);
  if (map) return pick(project.worlds.find((w) => w.id === map.worldId));
  const worlds = project.worlds;
  if (worlds.length === 0) return {};
  const assetCredits: Record<string, AssetCredit> = {};
  for (const w of worlds) Object.assign(assetCredits, w.assetCredits);
  const off = (key: keyof CreditsConfig) => worlds.every((w) => w.credits?.[key] === false);
  return {
    credits: { badges: !off("badges"), page: !off("page") },
    assetCredits,
  };
}

function pick(w: World | undefined): ViewCredits {
  return { credits: w?.credits, assetCredits: w?.assetCredits };
}
