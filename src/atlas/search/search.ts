/**
 * The atlas's one search: query parsing, matching and ranking for the search
 * palette, Browse and Timeline. Every page that filters entities by a typed
 * query goes through `searchMatches` / `searchEntries`, so `"quoted phrases"`
 * and note-text matching behave the same everywhere.
 *
 * Player safety: this module only reads the fields it is handed. Browse and
 * Timeline pass atlas.json entities (the player build already stripped DM
 * content from `body`); the palette passes search-index.json entries, which the
 * build derives from the same bodies via `searchBodyText`. No editor imports.
 */
import type { Entity } from "@/atlas/content/schema";

/** The fields search reads. `body` is the lowercased plain-text note body. */
export interface SearchDoc {
  title: string;
  aliases: string[];
  tags: string[];
  summary?: string;
  body?: string;
}

export interface ParsedQuery {
  phrases: string[]; // lowercased, trimmed, non-empty quoted spans
  rest: string; // text outside quotes, trimmed
}

/** Longest stretch of a note body that search looks at (shared with the build). */
export const SEARCH_BODY_MAX_CHARS = 4000;

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
 * substring somewhere in the doc's title, aliases, summary, tags, or body.
 */
export function matchesPhrases(e: SearchDoc, phrases: string[]): boolean {
  const haystack = [
    e.title.toLowerCase(),
    ...e.aliases.map((a) => a.toLowerCase()),
    (e.summary ?? "").toLowerCase(),
    ...e.tags.map((t) => t.toLowerCase()),
    e.body ?? "",
  ].join(" ");
  return phrases.every((p) => haystack.includes(p));
}

/** A parsed query ready to match: phrases, the lowercased unquoted term, and what to highlight. */
export interface CompiledQuery extends ParsedQuery {
  /** Lowercased unquoted remainder; empty when the query is phrases only. */
  term: string;
  /** What ranking uses: the term, or the first phrase when there is no term. */
  scoreTerm: string;
  /** What snippets and title highlights mark: the first phrase, else the term. */
  highlight: string;
  /** No phrase and no term: everything matches. */
  isEmpty: boolean;
}

export function compileQuery(raw: string): CompiledQuery {
  const parsed = parseSearchQuery(raw.trim());
  const term = parsed.rest.toLowerCase();
  const scoreTerm = term || parsed.phrases[0] || "";
  return {
    ...parsed,
    term,
    scoreTerm,
    highlight: parsed.phrases[0] ?? term,
    isEmpty: parsed.phrases.length === 0 && !term,
  };
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
  if ((e.body ?? "").includes(term)) s += 1;
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

/** Matching docs, best first (stable for ties). Used by the palette. */
export function searchEntries<T extends SearchDoc>(pool: T[], q: CompiledQuery): T[] {
  return pool
    .filter((e) => searchMatches(e, q))
    .map((e) => ({ e, s: scoreDoc(e, q.scoreTerm) }))
    .sort((a, b) => b.s - a.s)
    .map(({ e }) => e);
}

const entityDocs = new WeakMap<Entity, SearchDoc>();

/** An atlas.json entity as search sees it: same fields and body text as its index entry. */
export function entitySearchDoc(entity: Entity): SearchDoc {
  let doc = entityDocs.get(entity);
  if (!doc) {
    doc = {
      title: entity.title,
      aliases: entity.aliases,
      tags: entity.tags,
      summary: entity.summary,
      body: searchBodyText(entity.body ?? "").toLowerCase(),
    };
    entityDocs.set(entity, doc);
  }
  return doc;
}

/** Browse and Timeline's entry point: does this entity match the typed query? */
export function entityMatchesQuery(entity: Entity, query: string): boolean {
  const q = compileQuery(query);
  return q.isEmpty || searchMatches(entitySearchDoc(entity), q);
}
