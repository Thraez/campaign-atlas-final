import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Compass, Filter, X } from "lucide-react";
import type { Entity } from "@/atlas/content/schema";
import { useAtlasContent } from "@/atlas/content/useAtlasContent";
import { AtlasLoadState } from "@/atlas/content/AtlasLoadState";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { isDmToolsEnabled } from "@/atlas/dmTools";
import { playerTypeLabel } from "@/atlas/content/typeLabel";
import { entityMatchesQuery } from "@/atlas/search/entityMatchesQuery";
import {
  parseBrowseFilterParams,
  serializeBrowseFilterParams,
} from "@/atlas/browse/browseFilterParams";

interface YearGroup {
  year: number;
  label: string;
  entries: Entity[];
}

export default function AtlasTimeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { project, error } = useAtlasContent();

  const { q: query, type: activeType } = parseBrowseFilterParams(searchParams);

  const setQuery = (v: string) =>
    setSearchParams(
      (prev) => serializeBrowseFilterParams({ q: v, type: prev.get("type") || null }),
      { replace: true },
    );

  const setActiveType = (t: string | null) =>
    setSearchParams(
      (prev) => serializeBrowseFilterParams({ q: prev.get("q") ?? "", type: t }),
      { replace: true },
    );

  const dated = useMemo(
    () => (project?.entities ?? []).filter((e) => typeof e.dateValue === "number"),
    [project],
  );

  const allTypes = useMemo(() => {
    const m = new Map<string, number>();
    dated.forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [dated]);

  const groups = useMemo<YearGroup[]>(() => {
    const filtered = dated.filter((e) => {
      if (activeType && e.type !== activeType) return false;
      return entityMatchesQuery(e, query);
    });
    const sorted = [...filtered].sort((a, b) => a.dateValue! - b.dateValue!);
    const byYear = new Map<number, Entity[]>();
    sorted.forEach((e) => {
      const y = e.dateYear ?? 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(e);
    });
    const epoch = project?.calendar?.epochName ? ` ${project.calendar.epochName}` : "";
    return Array.from(byYear.entries()).map(([year, entries]) => ({
      year,
      label: `${year}${epoch}`,
      entries,
    }));
  }, [dated, query, activeType, project]);

  if (error || !project) {
    return (
      <AtlasLoadState
        error={error}
        loading={!project}
        errorTitle="Timeline unavailable"
        loadingLabel="Loading timeline…"
      />
    );
  }

  const worldName = project.worlds[0]?.name ?? "Atlas";
  // Dated entries exist but no month names to render them with. Only the DM can
  // act on this, and only the editor build can reach the calendar panel.
  const needsCalendar =
    isDmToolsEnabled() && dated.length > 0 && !(project.calendar?.months?.length ?? 0);

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <a href="#timeline-main" className="skip-to-main">
        Skip to content
      </a>
      <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
        <AtlasNavMenu publishedAt={project.publishedAt} worldName={worldName} />
        <Link
          to="/atlas"
          className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2 min-w-0"
        >
          <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[8.5rem] sm:max-w-none">{worldName}</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock className="h-4 w-4" /> Timeline
        </span>
        <div className="flex-1" />
        <div className="relative w-44 sm:w-64">
          <Input
            placeholder="Filter events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm pr-7"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/atlas/browse">Browse</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/atlas">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Map
          </Link>
        </Button>
      </header>

      {allTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 px-3 md:px-4 py-2 border-b border-border/50 bg-muted/20 items-center">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
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
        </div>
      )}

      <main id="timeline-main" className="flex-1 min-h-0" aria-label="Timeline events">
      <ScrollArea className="h-full">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
          {project.calendar?.name && (
            <p className="text-xs text-muted-foreground mb-4">
              Calendar: <span className="text-foreground">{project.calendar.name}</span>
              {project.calendar.epochName ? ` · epoch ${project.calendar.epochName}` : ""}
            </p>
          )}

          {/* No months named yet, so every date here reads as plain numbers.
              DM-only: a player can't fix this and shouldn't be asked to. */}
          {needsCalendar && (
            <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
              <p className="font-medium text-foreground">Your months don&rsquo;t have names yet.</p>
              <p className="text-muted-foreground">
                Name them once and every date in the atlas reads the way your world does, instead of
                as a number.
              </p>
              <Button asChild size="sm" variant="secondary" className="h-7 text-xs">
                <Link to="/atlas/edit?panel=calendar">Name your months</Link>
              </Button>
            </div>
          )}

          {groups.length === 0 && dated.length > 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16 space-y-3">
              <p>No events match your filter.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSearchParams(
                    serializeBrowseFilterParams({ q: "", type: null }),
                    { replace: true },
                  )
                }
              >
                Clear filter
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16">
              No dated entries yet. Add{" "}
              <code className="px-1 py-0.5 rounded bg-muted">atlas.date</code> to a markdown file's
              frontmatter.
            </div>
          ) : (
            <ol className="relative border-l-2 border-border pl-5 space-y-6">
              {groups.map((g) => (
                <li key={g.year} className="space-y-3">
                  <div className="flex items-center gap-2 -ml-7">
                    <span className="w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <h2 className="font-display text-lg text-primary">{g.label}</h2>
                  </div>
                  <div className="space-y-2">
                    {g.entries.map((e) => (
                      <Link
                        key={e.id}
                        to={`/atlas?entity=${encodeURIComponent(e.id)}`}
                        className="block rounded border border-border bg-card hover:bg-accent/40 transition px-3 py-2"
                      >
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {e.dateRaw}
                          </span>
                          <span className="font-medium text-sm">{e.title}</span>
                          {playerTypeLabel(e.type) && (
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {playerTypeLabel(e.type)}
                            </Badge>
                          )}
                        </div>
                        {e.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {e.summary}
                          </p>
                        )}
                        {e.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {e.tags.slice(0, 5).map((t) => (
                              <span key={t} className="text-[10px] text-muted-foreground">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </ScrollArea>
      </main>
    </div>
  );
}
