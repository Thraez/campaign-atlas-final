import type { EntityVisibility } from "@/atlas/content/schema";
import type { ParsedFrontmatter } from "./frontmatter";

const VALID_VIS = new Set<EntityVisibility>(["player", "dm", "hidden", "rumor"]);
const PLAYER_VISIBLE = new Set<EntityVisibility>(["player", "rumor"]);

/** Effective visibility build-atlas.ts:346 would derive from a frontmatter atlas block. */
export function resolveEffectiveVisibility(atlas: Record<string, unknown>): EntityVisibility {
  const v = atlas.visibility;
  if (typeof v === "string" && VALID_VIS.has(v as EntityVisibility)) return v as EntityVisibility;
  return atlas.publish === false ? "dm" : "player";
}

/** True iff disk is hidden-tier AND the vault copy would expose it to players. */
export function detectExposureIncrease(
  diskEffective: EntityVisibility,
  vaultAtlas: Record<string, unknown>,
): boolean {
  if (PLAYER_VISIBLE.has(diskEffective)) return false;
  const vaultVis = vaultAtlas.visibility;
  const vaultWantsExposure =
    (typeof vaultVis === "string" && PLAYER_VISIBLE.has(vaultVis as EntityVisibility)) ||
    vaultAtlas.publish === true;
  return vaultWantsExposure;
}

/** Two-way type resolution via last-synced base (spec §3.6). */
export function resolveType(args: {
  diskType: string;
  vaultType: string;
  baseType: string | undefined;
}): { type: string; conflict: boolean } {
  const { diskType, vaultType, baseType } = args;
  if (baseType === undefined) return { type: vaultType, conflict: false };
  const diskChanged = diskType !== baseType;
  const vaultChanged = vaultType !== baseType;
  if (vaultChanged && !diskChanged) return { type: vaultType, conflict: false };
  if (!vaultChanged && diskChanged) return { type: diskType, conflict: false };
  if (!vaultChanged && !diskChanged) return { type: diskType, conflict: false };
  return { type: diskType, conflict: true };
}

const VAULT_CONTENT_KEYS = [
  "summary", "race", "date", "dateValue", "images", "canon", "world",
] as const;

function unionStrings(...sources: unknown[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    const arr = Array.isArray(s) ? s : typeof s === "string" && s.trim() ? [s.trim()] : [];
    for (const v of arr) {
      if (typeof v === "string" && v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

export interface MergeImportInput {
  disk: ParsedFrontmatter;
  vault: ParsedFrontmatter;
  inferredType: string;
  baseType: string | undefined;
}

export interface MergeImportResult {
  data: Record<string, unknown>;
  content: string;
  diskVisibility: EntityVisibility;
  exposureIncrease: boolean;
  typeConflict: boolean;
}

/**
 * Disk-base merge per spec §3.
 *
 * 1. Start from disk.atlas verbatim (preserves placements, relationships,
 *    profile, id, legacy x/y, and any unknown future keys).
 * 2. Overlay vault content keys (summary, race, etc.).
 * 3. Two-way type resolution (§3.6); append resolved type as a tag.
 * 4. Visibility: disk effective, always explicit; flag exposure increases.
 * 5. Top-level: vault wins entirely; then set merged atlas block.
 * 6. Prose always comes from the vault.
 */
export function mergeImportFrontmatter(input: MergeImportInput): MergeImportResult {
  const diskData = input.disk.data;
  const vaultData = input.vault.data;
  const diskAtlas = (diskData.atlas as Record<string, unknown>) ?? {};
  const vaultAtlas = (vaultData.atlas as Record<string, unknown>) ?? {};

  // (1) Base = disk atlas verbatim
  const atlas: Record<string, unknown> = { ...diskAtlas };

  // (2) Overlay vault content keys
  for (const k of VAULT_CONTENT_KEYS) {
    if (vaultAtlas[k] !== undefined) atlas[k] = vaultAtlas[k];
  }

  // (3) Two-way type + append type as a tag (preserve today's rewriteFrontmatter behavior)
  const diskType = typeof diskAtlas.type === "string" ? diskAtlas.type : input.inferredType;
  const { type: resolvedType, conflict: typeConflict } = resolveType({
    diskType,
    vaultType: input.inferredType,
    baseType: input.baseType,
  });
  atlas.type = resolvedType;
  atlas.tags = unionStrings(diskAtlas.tags, vaultAtlas.tags, [resolvedType]);
  const aliases = unionStrings(diskAtlas.aliases, vaultAtlas.aliases);
  if (aliases.length > 0) atlas.aliases = aliases;

  // (4) Visibility: disk effective, ALWAYS written explicitly
  const diskVisibility = resolveEffectiveVisibility(diskAtlas);
  const exposureIncrease = detectExposureIncrease(diskVisibility, vaultAtlas);
  atlas.visibility = diskVisibility;

  // (5) Top-level: vault wins; then set merged atlas; prose from vault
  const data: Record<string, unknown> = { ...vaultData, atlas };

  return { data, content: input.vault.content, diskVisibility, exposureIncrease, typeConflict };
}
