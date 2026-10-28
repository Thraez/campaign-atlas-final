/**
 * The atlas's one search: query parsing, matching and ranking for the search
 * palette, Browse and Timeline, plus the note text all of them search. Every
 * page that filters entities by a typed query goes through `compileQuery` and
 * `searchMatches` / `searchEntries`, so `"quoted phrases"` and note-text
 * matching behave the same everywhere.
 *
 * Player safety: this module only reads the fields it is handed. Browse and
 * Timeline pass atlas.json entities (the player build already stripped DM
 * content from `body`); the palette passes search-index.json entries, which the
 * build derives from the same bodies via `searchBodyText`. No editor imports.
 */
import type { Entity } from "@/atlas/content/schema";

/** The fields search reads. */
export interface SearchDoc {
  title: string;
  aliases: string[];
  tags: string[];
  summary?: string;
  /** Lowercased plain-text note body (`toSearchText(searchBodyText(markdown))`), not markdown. */
  searchText?: string;
}

export interface ParsedQuery {
  phrases: string[]; // lowercased, trimmed, non-empty quoted spans
  rest: string; // text outside quotes, trimmed
}

/** Longest stretch of a note body that search looks at. */
const SEARCH_BODY_MAX_CHARS = 4000;

/**
 * Markdown body -> the plain text search matches and snippets show (original
 * case). The build stores this as `bodyText` in search-index.json; Browse and
 * Timeline derive it from atlas.json bodies, so all pages search the same text.
 */
export function searchBodyText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, (_m, t, d) => d || t)
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_BODY_MAX_CHARS);
}

/** Plain body text (`bodyText`) -> the `searchText` matching runs on. The one place it is made. */
export function toSearchText(plainBody: string): string {
  return plainBody.toLowerCase();
}

/**
 * Parse a raw search string into quoted exact phrases and unquoted remainder.
 * An unbalanced trailing `"` degrades gracefully: treated as a literal character
 * in `rest` rather than opening a phrase span.
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const phrases: string[] = [];
  const restParts: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      const closeIdx = raw.indexOf('"', i + 1);
      if (closeIdx === -1) {
        // Unbalanced: absorb everything remaining into rest as-is
        restParts.push(raw.slice(i));
        break;
      }
      const phrase = raw
        .slice(i + 1, closeIdx)
        .trim()
        .toLowerCase();
      if (phrase) phrases.push(phrase);
      i = closeIdx + 1;
    } else {
      restParts.push(raw[i]);
      i++;
    }
  }
  return { phrases, rest: restParts.join("").trim() };
}

/**
 * Returns true when every phrase appears as an exact contiguous case-insensitive
 * substring somewhere in the doc's title, aliases, summary, tags, or note text.
 */
export function matchesPhrases(e: SearchDoc, phrases: string[]): boolean {
  const haystack = [
    e.title.toLowerCase(),
    ...e.aliases.map((a) => a.toLowerCase()),
    (e.summary ?? "").toLowerCase(),
    ...e.tags.map((t) => t.toLowerCase()),
    e.searchText ?? "",
  ].join(" ");
  return phrases.every((p) => haystack.includes(p));
}

/** A parsed query ready to match. Compile once per filter pass, not per entity. */
export interface CompiledQuery {
  /** Lowercased quoted phrases; all must be present. */
  phrases: string[];
  /** Lowercased unquoted remainder; empty when the query is phrases only. */
  term: string;
  /** No phrase and no term (blank, or only empty quotes): everything matches. */
  isEmpty: boolean;
}

export function compileQuery(raw: string): CompiledQuery {
  const { phrases, rest } = parseSearchQuery(raw.trim());
  const term = rest.toLowerCase();
  return { phrases, term, isEmpty: phrases.length === 0 && !term };
}

/** What snippets and title highlights mark: the first phrase, else the term. */
export function highlightTerm(q: CompiledQuery): string {
  return q.phrases[0] ?? q.term;
}

/** Ranking weight of `term` in a doc; 0 means the term is nowhere in it. */
export function scoreDoc(e: SearchDoc, term: string): number {
  if (!term) return 0;
  let s = 0;
  const t = e.title.toLowerCase();
  if (t === term) s += 30;
  if (t.startsWith(term)) s += 14;
  if (t.includes(term)) s += 10;
  if (e.aliases.some((a) => a.toLowerCase().includes(term))) s += 6;
  if (e.tags.some((tt) => tt.toLowerCase().includes(term))) s += 3;
  if ((e.summary ?? "").toLowerCase().includes(term)) s += 2;
  if ((e.searchText ?? "").includes(term)) s += 1;
  return s;
}

/**
 * The match rule every page shares: every quoted phrase is present, and the
 * unquoted remainder (if any) appears in the title, an alias, a tag, the
 * summary or the note text. An empty query matches everything.
 */
export function searchMatches(e: SearchDoc, q: CompiledQuery): boolean {
  if (q.isEmpty) return true;
  if (q.phrases.length > 0 && !matchesPhrases(e, q.phrases)) return false;
  return !q.term || scoreDoc(e, q.term) > 0;
}

/**
 * Matching docs, best first (stable for ties). Used by the palette. Same rule
 * as `searchMatches`, scoring each doc once: ranked by the term, or by the
 * first phrase when the query is phrases only.
 */
export function searchEntries<T extends SearchDoc>(pool: T[], q: CompiledQuery): T[] {
  if (q.isEmpty) return pool;
  const rankBy = q.term || q.phrases[0];
  const scored: { e: T; s: number }[] = [];
  for (const e of pool) {
    if (q.phrases.length > 0 && !matchesPhrases(e, q.phrases)) continue;
    const s = scoreDoc(e, rankBy);
    // With a term, rankBy is the term, so s > 0 exactly when the term matches.
    if (q.term && s === 0) continue;
    scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s).map(({ e }) => e);
}

const entityDocs = new WeakMap<Entity, SearchDoc>();

/** An atlas.json entity as search sees it: same fields and note text as its index entry. */
export function entitySearchDoc(entity: Entity): SearchDoc {
  let doc = entityDocs.get(entity);
  if (!doc) {
    doc = {
      title: entity.title,
      aliases: entity.aliases,
      tags: entity.tags,
      summary: entity.summary,
      searchText: toSearchText(searchBodyText(entity.body ?? "")),
    };
    entityDocs.set(entity, doc);
  }
  return doc;
}

/** Convenience for a single entity; pages compile once and call `searchMatches`. */
export function entityMatchesQuery(entity: Entity, query: string): boolean {
  return searchMatches(entitySearchDoc(entity), compileQuery(query));
}
