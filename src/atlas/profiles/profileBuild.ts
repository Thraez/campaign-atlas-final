/**
 * Pure helpers used by both the editor (preview/validation) and the build
 * script (player-build stripping). Keeping the logic here means there is ONE
 * implementation of "what does a player see?" — the UI dry-run and the
 * shipped build can never disagree.
 */
import type { EntityVisibility } from "@/atlas/content/schema";
import type { EntityProfile, EntityRelationship, PlayerProfile, DmProfile } from "./profileTypes";

const PLAYER_VIS = new Set<EntityVisibility>(["player", "rumor"]);

/** Strip the DM half of a profile. Used to produce player-build entities. */
export function stripDmProfile(profile: EntityProfile | undefined): EntityProfile | undefined {
  if (!profile?.player || isEmptyPlayer(profile.player)) {
    return profile?.player ? { player: profile.player } : undefined;
  }
  return { player: profile.player };
}

function isEmptyPlayer(p: PlayerProfile): boolean {
  return !p.known_for && !p.visible_traits?.length && !p.rumors?.length;
}

export function isEmptyDmProfile(d: DmProfile | undefined): boolean {
  if (!d) return true;
  return Object.values(d).every((v) => !v || (typeof v === "string" && v.trim() === ""));
}

/** Clean a DM profile object — drop empty/whitespace values. */
export function compactDmProfile(d: DmProfile | undefined): DmProfile | undefined {
  if (!d) return undefined;
  const out: DmProfile = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function compactPlayerProfile(p: PlayerProfile | undefined): PlayerProfile | undefined {
  if (!p) return undefined;
  const out: PlayerProfile = {};
  if (p.known_for && p.known_for.trim() !== "") out.known_for = p.known_for.trim();
  const traits = (p.visible_traits ?? []).map((s) => s.trim()).filter(Boolean);
  if (traits.length) out.visible_traits = traits;
  const rumors = (p.rumors ?? []).map((s) => s.trim()).filter(Boolean);
  if (rumors.length) out.rumors = rumors;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Compose a profile with both halves cleaned; returns undefined if both empty. */
export function compactProfile(profile: EntityProfile | undefined): EntityProfile | undefined {
  if (!profile) return undefined;
  const player = compactPlayerProfile(profile.player);
  const dm = compactDmProfile(profile.dm);
  if (!player && !dm) return undefined;
  const out: EntityProfile = {};
  if (player) out.player = player;
  if (dm) out.dm = dm;
  return out;
}

export interface RelationshipFilterOpts {
  /** Map of every entity id → its visibility. Used to prevent DM-only leaks. */
  entityVisibility: Map<string, EntityVisibility>;
}

export interface RelationshipFilterResult {
  kept: EntityRelationship[];
  /** Relationships dropped because they were not player-visible to begin with. */
  droppedByVisibility: EntityRelationship[];
  /**
   * Relationships that WOULD have been player-visible but pointed at a
   * DM-only entity. These are the dangerous spoiler leaks the strict-player
   * gate must catch.
   */
  droppedByLeak: EntityRelationship[];
  /** Relationships pointing at non-existent entity ids — warning only. */
  unresolved: EntityRelationship[];
}

/**
 * Apply player-build rules to a list of relationships.
 *
 * Rules:
 *   1. visibility must be `player` or `rumor`
 *   2. target entity id must exist AND be player-visible
 * Anything that fails (2) but passed (1) is a SPOILER LEAK.
 */
export function filterRelationshipsForPlayer(
  rels: EntityRelationship[],
  opts: RelationshipFilterOpts
): RelationshipFilterResult {
  const kept: EntityRelationship[] = [];
  const droppedByVisibility: EntityRelationship[] = [];
  const droppedByLeak: EntityRelationship[] = [];
  const unresolved: EntityRelationship[] = [];
  for (const r of rels) {
    if (!PLAYER_VIS.has(r.visibility)) { droppedByVisibility.push(r); continue; }
    const targetVis = opts.entityVisibility.get(r.entity);
    if (targetVis === undefined) { unresolved.push(r); droppedByLeak.push(r); continue; }
    if (!PLAYER_VIS.has(targetVis)) { droppedByLeak.push(r); continue; }
    kept.push(r);
  }
  return { kept, droppedByVisibility, droppedByLeak, unresolved };
}
