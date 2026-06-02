import type { SearchIndexEntry } from "@/atlas/content/loader";

export interface ParsedQuery {
  phrases: string[]; // lowercased, trimmed, non-empty quoted spans
  rest: string;      // text outside quotes, trimmed
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
      const phrase = raw.slice(i + 1, closeIdx).trim().toLowerCase();
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
 * substring somewhere in the entry's title, aliases, summary, or body.
 */
export function matchesPhrases(e: SearchIndexEntry, phrases: string[]): boolean {
  const haystack = [
    e.title.toLowerCase(),
    ...e.aliases.map((a) => a.toLowerCase()),
    (e.summary ?? "").toLowerCase(),
    e.body ?? "", // already lowercased in the index
  ].join(" ");
  return phrases.every((p) => haystack.includes(p));
}
