/**
 * Pure client mirror of scripts/build-atlas.ts's PLAYER entity transform.
 * Locked to the real build output by src/test/content/projectEntityForPlayer-build-parity.test.ts.
 * Reuses every shared unit the build uses; replicates only the build's tiny
 * inline locals (scrubTags / dedupAliases / META_TAGS), guarded by the parity test.
 */
import { marked } from "marked";
import type { Entity } from "@/atlas/content/schema";
import type { EntityVisibility } from "@/atlas/content/schema";
import { stripDmBlocks, stripDmFromShippingString } from "@/atlas/content/stripDmBlocks";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import { compactProfile, stripDmProfile, filterRelationshipsForPlayer } from "@/atlas/profiles/profileBuild";

const PLAYER_VISIBLE = new Set<EntityVisibility>(["player", "rumor"]);

// Verbatim from scripts/build-atlas.ts META_TAGS. Kept in lockstep
// by the build-parity test; if the build's list changes, that test fails.
const META_TAGS = new Set([
  "npc",
  "person",
  "region",
  "settlement",
  "city",
  "town",
  "village",
  "faction",
  "organization",
  "guild",
  "deity",
  "god",
  "event",
  "item",
  "artifact",
  "note",
  "location",
  "ruin",
  "dungeon",
  "cave",
  "temple",
  "shop",
  "port",
  "stub",
  "draft",
  "wip",
  "todo",
]);

export interface ProjectionContext {
  /** entity id → entity (DM-side, includes hidden). */
  entitiesById: Map<string, Entity>;
  /** ids whose visibility ∉ {player,rumor} (build's secretEntityIds). */
  secretIds: Set<string>;
  /** lowercase title/alias → id (build's crossRefNameIndex). */
  resolveByName: (name: string) => string | undefined;
  /** entityVisibility map for filterRelationshipsForPlayer. */
  entityVisibility: Map<string, EntityVisibility>;
}

export function buildProjectionContext(entitiesById: Map<string, Entity>): ProjectionContext {
  const nameIndex = new Map<string, string>();
  const secretIds = new Set<string>();
  const entityVisibility = new Map<string, EntityVisibility>();
  for (const e of entitiesById.values()) {
    nameIndex.set(e.title.toLowerCase(), e.id);
    for (const a of e.aliases ?? []) nameIndex.set(a.toLowerCase(), e.id);
    if (!PLAYER_VISIBLE.has(e.visibility)) secretIds.add(e.id);
    entityVisibility.set(e.id, e.visibility);
  }
  return {
    entitiesById,
    secretIds,
    resolveByName: (n) => nameIndex.get(n.trim().toLowerCase()),
    entityVisibility,
  };
}

export function projectEntityForPlayer(entity: Entity, ctx: ProjectionContext): Entity {
  // 1. Body: DM blocks stripped
  let body = stripDmBlocks(entity.body ?? "").text;

  // 2. Tokenise wikilinks
  const { tokenized, links } = tokenizeWikilinks(body, { resolveByName: ctx.resolveByName });

  // 3. Redact links to secret targets (redact in body string AND mark link as broken)
  for (const l of links) {
    if (l.resolvedId && ctx.secretIds.has(l.resolvedId)) {
      if (l.target) {
        const escTarget = l.target.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
        body = body.replace(new RegExp(`\\[\\[${escTarget}(?:\\|[^\\]]+)?\\]\\]`, "g"), "…");
      }
      l.resolvedId = undefined;
      l.display = "…";
      l.target = "";
      l.broken = true;
    }
  }

  // 4. Render bodyHtml
  const html = marked.parse(tokenized, { async: false }) as string;
  const linked = renderLinkTokens(html, links, { hideBroken: true });
  const bodyHtml = sanitizeAtlasHtml(linked);

  // 5. Shipping-string scrubs + meta-tag scrub + alias dedup
  const strip = (s: string | undefined) => stripDmFromShippingString(s);
  const stripArr = (arr: string[]) =>
    arr.map((x) => stripDmFromShippingString(x) ?? "").filter((x) => x.length > 0);
  const scrubTags = (arr: string[]) => arr.filter((t) => !META_TAGS.has(t.toLowerCase()));
  const dedupAliases = (arr: string[], t: string) => {
    const tl = t.toLowerCase();
    return arr.filter((a) => a.trim().toLowerCase() !== tl);
  };

  const title = strip(entity.title) ?? entity.title;

  // 6. Relationships filtered for player via the canonical shared implementation.
  // filterRelationshipsForPlayer enforces both r.visibility and target entity visibility.
  let relationships = entity.relationships;
  if (relationships && relationships.length > 0) {
    const { kept } = filterRelationshipsForPlayer(relationships, {
      entityVisibility: ctx.entityVisibility,
    });
    // Scrub DM inline strings from relationship text fields (mirrors build-atlas.ts ~488-491).
    for (const r of kept) {
      if (r.label) r.label = stripDmFromShippingString(r.label) ?? r.label;
      if (r.description) r.description = stripDmFromShippingString(r.description) ?? r.description;
    }
    relationships = kept.length > 0 ? kept : undefined;
  }

  // 7. Scrub DM inline strings from profile.player fields (mirrors build-atlas.ts ~471-484).
  const compacted = compactProfile(entity.profile);
  if (compacted?.player) {
    const pp = compacted.player;
    if (pp.known_for) pp.known_for = stripDmFromShippingString(pp.known_for) ?? undefined;
    if (pp.visible_traits) {
      pp.visible_traits = pp.visible_traits
        .map((s) => stripDmFromShippingString(s) ?? "")
        .filter((s) => s.length > 0);
    }
    if (pp.rumors) {
      pp.rumors = pp.rumors
        .map((s) => stripDmFromShippingString(s) ?? "")
        .filter((s) => s.length > 0);
    }
  }

  return {
    ...entity,
    title,
    aliases: dedupAliases(stripArr(entity.aliases ?? []), title),
    tags: scrubTags(stripArr(entity.tags ?? [])),
    summary: strip(entity.summary),
    race: strip(entity.race),
    body,
    bodyHtml,
    frontmatter: {},
    sourcePath: "",
    links,
    profile: stripDmProfile(compacted),
    relationships,
  };
}
