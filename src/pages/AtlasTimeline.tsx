import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, Compass, Filter, X } from "lucide-react";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { playerTypeLabel } from "@/atlas/content/typeLabel";

interface YearGroup {
  year: number;
  label: string;
  entries: Entity[];
}

export default function AtlasTimeline() {
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<string | null>(null);

  useEffect(() => {
    loadAtlasContent(true).then(setProject).catch((e: Error) => setError(e.message));
  }, []);

  const dated = useMemo(
    () => (project?.entities ?? []).filter((e) => typeof e.dateValue === "number"),
    [project]
  );

  const allTypes = useMemo(() => {
    const m = new Map<string, number>();
    dated.forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [dated]);

  const groups = useMemo<YearGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = dated.filter((e) => {
      if (activeType && e.type !== activeType) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.summary ?? "").toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    const sorted = [...filtered].sort((a, b) => (a.dateValue! - b.dateValue!));
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

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="font-display text-2xl text-primary">Timeline unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="secondary">
            <Link to="/atlas"><ArrowLeft className="h-4 w-4 mr-1" />Back to atlas</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading timeline…
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <header className="atlas-toolbar flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border">
        <AtlasNavMenu publishedAt={project.publishedAt} />
        <Link to="/atlas" className="font-display text-lg text-primary hover:opacity-80 flex items-center gap-2">
          <Compass className="h-5 w-5" /> <span className="hidden sm:inline">Astrath Atlas</span>
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
          <Link to="/atlas"><ArrowLeft className="h-4 w-4 mr-1" />Map</Link>
        </Button>
      </header>

      {allTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 px-3 md:px-4 py-2 border-b border-border/50 bg-muted/20 items-center">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          <button
            onClick={() => setActiveType(null)}
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${activeType === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
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
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${activeType === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
              >
                {label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
          {project.calendar?.name && (
            <p className="text-xs text-muted-foreground mb-4">
              Calendar: <span className="text-foreground">{project.calendar.name}</span>
              {project.calendar.epochName ? ` · epoch ${project.calendar.epochName}` : ""}
            </p>
          )}

          {groups.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16">
              No dated entries yet. Add <code className="px-1 py-0.5 rounded bg-muted">atlas.date</code> to a markdown file's frontmatter.
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
                          <span className="text-xs text-muted-foreground tabular-nums">{e.dateRaw}</span>
                          <span className="font-medium text-sm">{e.title}</span>
                          {playerTypeLabel(e.type) && (
                            <Badge variant="outline" className="text-[10px] uppercase">{playerTypeLabel(e.type)}</Badge>
                          )}
                        </div>
                        {e.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.summary}</p>
                        )}
                        {e.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {e.tags.slice(0, 5).map((t) => (
                              <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>
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
    </div>
  );
}
