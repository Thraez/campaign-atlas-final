/**
 * The atlas search palette — the Cmd/Ctrl-K overlay that searches entity
 * titles, lore body, and tags, with type/tag/this-map/recently-revealed
 * filters and keyboard navigation.
 *
 * Extracted verbatim from AtlasViewer so it lives beside its collaborators
 * (`snippet`, `parseSearchQuery`) and can be tested in isolation — it takes
 * plain props and calls callbacks, with no react-leaflet dependency.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPlacement } from "@/atlas/content/schema";
import type { SearchIndexEntry } from "@/atlas/content/loader";
import { Input } from "@/components/ui/input";
import { Search, MapPin, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { playerTypeLabel } from "@/atlas/content/typeLabel";
import { snippet, highlightMatch } from "@/atlas/search/snippet";
import { parseSearchQuery, matchesPhrases } from "@/atlas/search/parseSearchQuery";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import { loadVisitedOrdered } from "@/atlas/visited/visitedPlaces";

interface SearchPaletteProps {
  query: string;
  setQuery: (q: string) => void;
  index: SearchIndexEntry[];
  placements: MapPlacement[];
  onPick: (id: string, fly: boolean) => void;
  onClose: () => void;
}

/**
 * Hook: fetch `.last-published.json` (the publish-baseline snapshot written by
 * the `atlas:snapshot` script) and compute the set of entity ids that exist in
 * the CURRENT atlas but did NOT exist in the previous published one — i.e.
 * "recently revealed" since the last publish. Returns null while loading or
 * if the baseline doesn't exist (in which case the filter is unavailable).
 *
 * The "current atlas" ids come from the `index` the palette was already given
 * — no need to re-fetch atlas.json just to rebuild an id set that's already
 * in memory. `indexRef` lets the effect (which only needs to run once, at
 * mount) read the latest `index` without re-fetching on every re-render.
 */
function useRecentlyRevealedIds(index: SearchIndexEntry[]): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    let mounted = true;
    const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
    fetch(`${base}atlas/.last-published.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((baseline) => {
        if (!mounted) return;
        if (!baseline) {
          setIds(null);
          return;
        }
        const baseIds = new Set<string>((baseline.entities ?? []).map((e: { id: string }) => e.id));
        const out = new Set<string>();
        for (const e of indexRef.current) {
          if (!baseIds.has(e.id)) out.add(e.id);
        }
        setIds(out);
      })
      .catch(() => {
        if (mounted) setIds(null);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return ids;
}

export function SearchPalette({
  query,
  setQuery,
  index,
  placements,
  onPick,
  onClose,
}: SearchPaletteProps) {
  const placedIds = useMemo(() => new Set(placements.map((p) => p.entityId)), [placements]);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  /** "This map only" — restricts results to entities placed on the current map. */
  const [thisMapOnly, setThisMapOnly] = useState(false);
  /** "Recently revealed" — entities not present in the previous publish snapshot. */
  const [recentOnly, setRecentOnly] = useState(false);
  const recentlyRevealed = useRecentlyRevealedIds(index);
  const listRef = useRef<HTMLDivElement>(null);
  // Capture the element that had focus before the palette opened so it can be
  // restored when the palette closes (regardless of how it closes).
  const triggerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null,
  );
  const dialogRef = useRef<HTMLDivElement>(null);

  const allTypes = useMemo(() => {
    const m = new Map<string, number>();
    index.forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [index]);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    index.forEach((e) => e.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [index]);

  const {
    items: results,
    total: resultTotal,
    isRecentlyViewed,
  } = useMemo(() => {
    let pool = index;
    if (activeType) pool = pool.filter((e) => e.type === activeType);
    if (activeTag) pool = pool.filter((e) => e.tags.includes(activeTag));
    if (thisMapOnly) pool = pool.filter((e) => placedIds.has(e.id));
    if (recentOnly && recentlyRevealed) pool = pool.filter((e) => recentlyRevealed.has(e.id));

    const raw = query.trim();
    if (!raw) {
      const visitedIds = loadVisitedOrdered();
      if (visitedIds.length > 0) {
        const indexIdSet = new Set(pool.map((e) => e.id));
        const visitedInPool = visitedIds.filter((id) => indexIdSet.has(id));
        if (visitedInPool.length > 0) {
          const idMap = new Map(pool.map((e) => [e.id, e]));
          const items = visitedInPool
            .slice(0, 40)
            .map((id) => ({ e: idMap.get(id)!, snip: null as string | null, titleHtml: null as string | null }));
          return { items, total: visitedInPool.length, isRecentlyViewed: true };
        }
      }
      return {
        items: pool.slice(0, 40).map((e) => ({ e, snip: null as string | null, titleHtml: null as string | null })),
        total: pool.length,
        isRecentlyViewed: false,
      };
    }

    const { phrases, rest } = parseSearchQuery(raw);
    const q = rest.toLowerCase();
    // When query is phrases-only, score by the first phrase so results are still ranked.
    const scoreQuery = q || (phrases.length > 0 ? phrases[0] : "");
    const phrasesOnly = phrases.length > 0 && rest === "";

    // Hard AND-filter: exclude entries missing any required phrase.
    if (phrases.length > 0) pool = pool.filter((e) => matchesPhrases(e, phrases));

    const score = (e: SearchIndexEntry): number => {
      if (!scoreQuery) return 0;
      let s = 0;
      const t = e.title.toLowerCase();
      if (t === scoreQuery) s += 30;
      if (t.startsWith(scoreQuery)) s += 14;
      if (t.includes(scoreQuery)) s += 10;
      if (e.aliases.some((a) => a.toLowerCase().includes(scoreQuery))) s += 6;
      if (e.tags.some((tt) => tt.toLowerCase().includes(scoreQuery))) s += 3;
      if ((e.summary ?? "").toLowerCase().includes(scoreQuery)) s += 2;
      if ((e.body ?? "").includes(scoreQuery)) s += 1;
      return s;
    };
    // When phrases-only, all phrase-matched entries are shown (sorted by phrase score).
    // When unquoted terms are present, the existing score > 0 gate still applies.
    const snippetQuery = phrases.length > 0 ? phrases[0] : scoreQuery;
    const scored = pool
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => phrasesOnly || x.s > 0)
      .sort((a, b) => b.s - a.s);
    return {
      items: scored
        .slice(0, 40)
        .map(({ e }) => ({
          e,
          snip: snippet(e.bodyText ?? e.body, e.body, snippetQuery),
          titleHtml: highlightMatch(e.title, snippetQuery),
        })),
      total: scored.length,
      isRecentlyViewed: false,
    };
  }, [query, index, activeType, activeTag, thisMapOnly, placedIds, recentOnly, recentlyRevealed]);

  // Reset selection and scroll position when filters or query change.
  useEffect(() => {
    setActiveIndex(-1);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, activeType, activeTag, thisMapOnly, recentOnly]);

  // Scroll active item into view.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector(
      `[data-index="${activeIndex}"]`,
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Restore focus to whatever was focused before the palette opened.
  useEffect(() => {
    const trigger = triggerRef.current;
    return () => {
      trigger?.focus();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      if (!dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const r = results[idx];
      if (r) onPick(r.e.id, placedIds.has(r.e.id));
    }
  };
  const countLabel =
    resultTotal === 1 ? "1 match" : `${resultTotal} matches`;

  // Stable option id for the currently active result — used for aria-activedescendant.
  const activeResultId =
    activeIndex >= 0 && results[activeIndex]
      ? `sp-result-${results[activeIndex].e.id}`
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the atlas"
        className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Search"
            aria-activedescendant={activeResultId}
            aria-controls="sp-results-listbox"
            placeholder='Search titles, lore body, tags… "exact phrase"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 focus-visible:ring-0 p-0 h-auto"
          />
          <Link
            to="/atlas/timeline"
            onClick={onClose}
            className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap"
          >
            Timeline →
          </Link>
        </div>

        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border/50 bg-muted/20">
          <button
            onClick={() => setThisMapOnly((v) => !v)}
            className={`text-[10px] uppercase tracking-wider filter-chip px-2 py-0.5 rounded inline-flex items-center gap-1 ${thisMapOnly ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            title={
              thisMapOnly
                ? "Showing only entities placed on the current map"
                : "Search within all maps"
            }
            aria-pressed={thisMapOnly}
          >
            <MapPin className="h-3 w-3" /> {thisMapOnly ? "this map" : "all maps"}
          </button>
          {recentlyRevealed && recentlyRevealed.size > 0 && (
            <button
              onClick={() => setRecentOnly((v) => !v)}
              className={`text-[10px] uppercase tracking-wider filter-chip px-2 py-0.5 rounded inline-flex items-center gap-1 ${recentOnly ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
              title={`${recentlyRevealed.size} entities revealed since the last publish`}
              aria-pressed={recentOnly}
            >
              <CalendarClock className="h-3 w-3" /> recent ({recentlyRevealed.size})
            </button>
          )}
          <span className="w-full h-0" />
          {(allTypes.length > 1 || allTags.length > 0) && (
            <>
              <button
                onClick={() => setActiveType(null)}
                className={`text-[10px] uppercase tracking-wider filter-chip px-2 py-0.5 rounded ${activeType === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
              >
                all
              </button>
              {allTypes.map(([t, n]) => {
                const label = playerTypeLabel(t);
                if (!label) return null;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveType(activeType === t ? null : t)}
                    className={`text-[10px] uppercase tracking-wider filter-chip px-2 py-0.5 rounded ${activeType === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
                  >
                    {label} <span className="opacity-60">{n}</span>
                  </button>
                );
              })}
              {allTags.length > 0 && <span className="w-full h-0" />}
              {allTags.map(([t, n]) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                  className={`text-[10px] filter-chip px-2 py-0.5 rounded ${activeTag === t ? "bg-secondary text-secondary-foreground" : "bg-muted/60 hover:bg-accent"}`}
                >
                  #{t} <span className="opacity-60">{n}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {results.length > 0 && !isRecentlyViewed && (
          <div className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border/50 bg-muted/10">
            {countLabel}
            {resultTotal > 40 && <span className="ml-1 opacity-70">(showing first 40)</span>}
          </div>
        )}

        {/* Polite live region announces result count to screen readers when the query changes.
            Uses "result/results" (not "match/matches") to keep text distinct from the visible
            count label, so tests can target each element unambiguously. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {!isRecentlyViewed
            ? results.length === 0
              ? "No results"
              : `${resultTotal} ${resultTotal === 1 ? "result" : "results"}`
            : ""}
        </div>

        <div
          ref={listRef}
          id="sp-results-listbox"
          role="listbox"
          aria-label="Search results"
          className="max-h-[60vh] overflow-y-auto"
        >
          {results.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No matches.</div>
          ) : (
            <>
              {isRecentlyViewed && (
                <div className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/10">
                  Recently viewed
                </div>
              )}
              {results.map(({ e: r, snip, titleHtml }, i) => {
              const placed = placedIds.has(r.id);
              const active = i === activeIndex;
              return (
                <button
                  key={r.id}
                  id={`sp-result-${r.id}`}
                  role="option"
                  aria-selected={active}
                  data-index={i}
                  onClick={() => onPick(r.id, placed)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-3 py-2 border-b border-border/50 last:border-b-0 ${
                    active ? "bg-accent/60" : "hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {titleHtml ? (
                      <span
                        className="font-medium text-sm"
                        dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(titleHtml) }}
                      />
                    ) : (
                      <span className="font-medium text-sm">{r.title}</span>
                    )}
                    {playerTypeLabel(r.type) && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {playerTypeLabel(r.type)}
                      </span>
                    )}
                    {r.dateRaw && (
                      <span className="text-[10px] text-muted-foreground">· {r.dateRaw}</span>
                    )}
                    {placed && <MapPin className="h-3 w-3 text-primary ml-auto" />}
                  </div>
                  {snip ? (
                    <div
                      className="text-xs text-muted-foreground line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(snip) }}
                    />
                  ) : (
                    r.summary && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{r.summary}</div>
                    )
                  )}
                </button>
              );
            })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
