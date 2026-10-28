/**
 * The one player projection: a DM-side entity in, the entity a player sees
 * out. `scripts/build-atlas.ts` ships its player build through
 * `projectEntityWithReport`, and the editor's player preview uses
 * `projectEntityForPlayer`, so the two cannot drift (code-retro 08).
 *
 * Imports stay relative: the build runs this file under `tsx` from any
 * working directory, where the `@/` alias may not resolve.
 */
import { markdownToHtml } from "./markdownCore";
import type { Entity, EntityVisibility } from "./schema";
import {
  replaceSecretMarkers,
  stripDmBlocks,
  stripDmFromShippingString,
  stripSecretMarkers,
} from "./dmMarkup";
import { resolveImageEmbeds } from "./renderEntityMarkdown";
import { tokenizeWikilinks, renderLinkTokens } from "./parseWikilinks";
import { sanitizeAtlasHtml } from "../sanitizeHtml";
import {
  compactProfile,
  stripDmProfile,
  filterRelationshipsForPlayer,
  type RelationshipFilterResult,
} from "../profiles/profileBuild";

import { PLAYER_VISIBLE_VISIBILITY } from "./visibility";

/**
 * Tags that are organizational/meta for the DM but read as jargon to players
 * ("#npc", "#stub"). Stripped from `entity.tags` in player output only; DM
 * builds keep them so the DM can still filter the editor by these.
 */
export const META_TAGS: ReadonlySet<string> = new Set([
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
  /** ids that must never be linked from player output (DM/hidden notes, folder-excluded notes). */
  secretIds: Set<string>;
  /** Title/alias → id, with the loose fallback (see `NameIndex`). */
  resolveByName: (name: string) => string | undefined;
  /** Folder-path basename fallback — undefined when ambiguous. */
  resolveByBasename: (basename: string) => string | undefined;
  /** Entity id → visibility, for filterRelationshipsForPlayer. */
  entityVisibility: Map<string, EntityVisibility>;
}

/** A name with case, dashes, underscores and runs of spaces folded away. */
export function looseNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, " ")
    .trim();
}

/**
 * Title + alias → id index used to resolve wikilinks. Exact (case-insensitive)
 * names win; otherwise the name with dashes, underscores and spaces folded
 * together (code-retro 06), where one owner wins outright and among several a
 * secret one wins so the link is redacted (fail closed). Basename lookups
 * (Q49) refuse a name owned by more than one entity.
 */
export class NameIndex {
  private readonly exact = new Map<string, string>();
  private readonly owners = new Map<string, Set<string>>();
  private readonly looseOwners = new Map<string, Set<string>>();

  constructor(private readonly secretIds: ReadonlySet<string>) {}

  register(name: string, id: string): void {
    const key = name.toLowerCase();
    this.exact.set(key, id);
    addOwner(this.owners, key, id);
    addOwner(this.looseOwners, looseNameKey(name), id);
  }

  private resolveLoose(n: string): string | undefined {
    const owners = this.looseOwners.get(looseNameKey(n));
    if (!owners || owners.size === 0) return undefined;
    if (owners.size === 1) return [...owners][0];
    return [...owners].find((id) => this.secretIds.has(id));
  }

  resolveByName = (n: string): string | undefined =>
    this.exact.get(n.trim().toLowerCase()) ?? this.resolveLoose(n);

  resolveByBasename = (n: string): string | undefined => {
    const key = n.trim().toLowerCase();
    if ((this.owners.get(key)?.size ?? 0) > 1) return undefined;
    return this.exact.get(key) ?? this.resolveLoose(n);
  };
}

function addOwner(index: Map<string, Set<string>>, key: string, id: string): void {
  let owners = index.get(key);
  if (!owners) {
    owners = new Set();
    index.set(key, owners);
  }
  owners.add(id);
}

/** Projection context for the editor preview, from the DM-side entity map. */
export function buildProjectionContext(entitiesById: Map<string, Entity>): ProjectionContext {
  const secretIds = new Set<string>();
  const entityVisibility = new Map<string, EntityVisibility>();
  for (const e of entitiesById.values()) {
    if (!PLAYER_VISIBLE_VISIBILITY.has(e.visibility)) secretIds.add(e.id);
    entityVisibility.set(e.id, e.visibility);
  }
  const names = new NameIndex(secretIds);
  for (const e of entitiesById.values()) {
    names.register(e.title, e.id);
    for (const a of e.aliases ?? []) names.register(a, e.id);
  }
  return {
    secretIds,
    resolveByName: names.resolveByName,
    resolveByBasename: names.resolveByBasename,
    entityVisibility,
  };
}

/** What the projection removed, for the build's counters and warnings. */
export interface ProjectionReport {
  /** Links redacted because they pointed at a secret note: the original target and id. */
  redactedLinks: { target: string; resolvedId: string }[];
  /** Relationship filter outcome; undefined when the entity had none. */
  relationships?: RelationshipFilterResult;
  /** True when the entity carried a DM profile half that was dropped. */
  strippedDmProfile: boolean;
}

export function projectEntityForPlayer(entity: Entity, ctx: ProjectionContext): Entity {
  return projectEntityWithReport(entity, ctx).entity;
}

/**
 * Project one entity for players. `entity.body` is the authored markdown
 * (DM blocks and secret markers may still be in it). Secret markers render as
 * sealed-box placeholders only for ids in `entity.secrets`; the build projects
 * before its encrypt pass, so player builds drop every marker.
 */
export function projectEntityWithReport(
  entity: Entity,
  ctx: ProjectionContext,
): { entity: Entity; report: ProjectionReport } {
  // 1. Body: DM blocks stripped. The shipped markdown also loses secret
  // markers; the HTML below turns known ones into placeholders instead.
  const noDm = stripDmBlocks(entity.body ?? "").text;
  let body = stripSecretMarkers(noDm);

  // 1b. Resolve ![[image.ext]] embeds AFTER DM stripping so embeds inside %% blocks are already gone.
  const bodyForHtml = resolveImageEmbeds(noDm);

  // 1c. Secret markers: replace {{secret:id}} with an inert placeholder span. The
  // client (EntityPanel effect) resolves the matching entity.secrets blob and
  // renders the sealed-box UI. Orphan markers (no matching secret blob) are dropped.
  const knownSecretIds = new Set((entity.secrets ?? []).map((s) => s.id));
  const bodyWithSecrets = replaceSecretMarkers(bodyForHtml, (rawId) => {
    const id = String(rawId).trim();
    if (!knownSecretIds.has(id)) return "";
    const esc = id.replace(/"/g, "&quot;");
    return `<span class="atlas-secret-block" data-secret-id="${esc}"></span>`;
  });

  // 2. Tokenise wikilinks (from embed-resolved text so <img> appears in rendered HTML)
  const { tokenized, links } = tokenizeWikilinks(bodyWithSecrets, {
    resolveByName: ctx.resolveByName,
    resolveByBasename: ctx.resolveByBasename,
  });

  // 3. Redact links to secret targets: the display text is usually the
  // secret's name, so redact it in the body string AND mark the link broken.
  const redactedLinks: ProjectionReport["redactedLinks"] = [];
  for (const l of links) {
    if (l.resolvedId && ctx.secretIds.has(l.resolvedId)) {
      redactedLinks.push({ target: l.target, resolvedId: l.resolvedId });
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

  // 4. Render bodyHtml; broken links render as plain display text.
  const html = markdownToHtml(tokenized);
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
  // Copies, so the caller's (DM-side) entity is never changed.
  let relationships = entity.relationships;
  let relReport: RelationshipFilterResult | undefined;
  if (relationships && relationships.length > 0) {
    relReport = filterRelationshipsForPlayer(relationships, {
      entityVisibility: ctx.entityVisibility,
    });
    const kept = relReport.kept.map((r) => {
      const out = { ...r };
      if (out.label) out.label = stripDmFromShippingString(out.label);
      if (out.description) out.description = stripDmFromShippingString(out.description);
      return out;
    });
    relationships = kept.length > 0 ? kept : undefined;
  }

  // 7. Scrub DM inline strings from profile.player fields; drop profile.dm.
  const compacted = compactProfile(entity.profile);
  if (compacted?.player) {
    const pp = compacted.player;
    if (pp.known_for) pp.known_for = stripDmFromShippingString(pp.known_for);
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

  const projected: Entity = {
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
  if (entity.dateLabel !== undefined) projected.dateLabel = strip(entity.dateLabel);

  return {
    entity: projected,
    report: {
      redactedLinks,
      relationships: relReport,
      strippedDmProfile: !!entity.profile?.dm,
    },
  };
}
