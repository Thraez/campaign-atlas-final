import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Compass, Hash, LayoutGrid, MapPin, Tag } from "lucide-react";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { playerTypeLabel } from "@/atlas/content/typeLabel";

type Mode = "browse" | "tag" | "type";

export default function AtlasBrowse({ mode = "browse" }: { mode?: Mode }) {
  const params = useParams();
  const facet = (mode === "tag" ? params.tag : mode === "type" ? params.type : undefined) ?? "";
  const facetDecoded = decodeURIComponent(facet);

  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<string | null>(null);

  useEffect(() => {
    loadAtlasContent(true).then(setProject).catch((e: Error) => setError(e.message));
  }, []);

  const entries = useMemo(() => {
    const all = project?.entities ?? [];
    return all.filter((e) => {
      if (mode === "tag" && !e.tags.includes(facetDecoded)) return false;
      if (mode === "type" && e.type !== facetDecoded) return false;
      if (activeType && e.type !== activeType) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        if (
          !e.title.toLowerCase().includes(q) &&
          !(e.summary ?? "").toLowerCase().includes(q) &&
          !e.aliases.some((a) => a.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [project, mode, facetDecoded, activeType, query]);

  const allTypes = useMemo(() => {
    const m = new Map<string, number>();
    (project?.entities ?? []).forEach((e) => {
      if (mode === "tag" && !e.tags.includes(facetDecoded)) return;
      m.set(e.type, (m.get(e.type) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [project, mode, facetDecoded]);

  const grouped = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.title.localeCompare(b.title));
    const groups = new Map<string, Entity[]>();
    sorted.forEach((e) => {
      const letter = (e.title[0] || "·").toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : "#";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    });
    return Array.from(groups.entries());
  }, [entries]);

  const placedIds = useMemo(
    () => new Set((project?.placements ?? []).map((p) => p.entityId)),
    [project]
  );

  const heading =
    mode === "tag" ? `#${facetDecoded}` :
    mode === "type" ? (playerTypeLabel(facetDecoded) || facetDecoded) :
    "Browse";

  const headingIcon =
    mode === "tag" ? <Hash className="h-5 w-5" /> :
    mode === "type" ? <Tag className="h-5 w-5" /> :
    <LayoutGrid className="h-5 w-5" />;

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="font-display text-2xl text-primary">Atlas not built yet</h1>
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
        Loading…
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
        <span className="flex items-center gap-1.5 text-sm font-medium min-w-0 truncate">
          {headingIcon} {heading}
        </span>
        <div className="flex-1" />
        <Input
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // B4: shrinkable on mobile (w-32 + min-w-0) so the toolbar never
          // overflows a ~390px viewport; full width returns at the sm: breakpoint.
          className="h-8 w-32 sm:w-64 min-w-0 text-sm"
        />
        <Button asChild variant="ghost" size="sm">
          <Link to="/atlas"><ArrowLeft className="h-4 w-4 mr-1" />Map</Link>
        </Button>
      </header>

      {mode !== "type" && allTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 px-3 md:px-4 py-2 border-b border-border/50 bg-muted/20">
          <button
            onClick={() => setActiveType(null)}
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${activeType === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
          >
            all <span className="opacity-60">{entries.length}</span>
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
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
          {grouped.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16">
              {mode === "tag"
                ? <>No entries tagged <code className="px-1 py-0.5 rounded bg-muted">#{facetDecoded}</code> yet.</>
                : mode === "type"
                ? <>No entries of type <code className="px-1 py-0.5 rounded bg-muted">{facetDecoded}</code> yet.</>
                : <>No entries match your filter.</>}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([letter, list]) => (
                <section key={letter}>
                  <h2 className="font-display text-2xl text-primary border-b border-border pb-1 mb-3">{letter}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {list.map((e) => (
                      <div
                        key={e.id}
                        className="relative rounded border border-border bg-card hover:bg-accent/40 transition px-3 py-2"
                      >
                        <div className="flex items-baseline gap-2">
                          {/* Stretched link: the title link's ::after overlay makes
                              the whole card navigate to the entity, while the type
                              and tag chips below stay as separate, non-nested links
                              (z-10 lifts them above the overlay). Nesting <a> in <a>
                              is invalid HTML and breaks the chip clicks. */}
                          <Link
                            to={`/atlas?entity=${encodeURIComponent(e.id)}`}
                            className="font-medium text-sm truncate after:absolute after:inset-0 after:content-['']"
                          >
                            {e.title}
                          </Link>
                          {playerTypeLabel(e.type) && (
                            <Link
                              to={`/atlas/type/${encodeURIComponent(e.type)}`}
                              className="relative z-10 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                            >
                              {playerTypeLabel(e.type)}
                            </Link>
                          )}
                          {placedIds.has(e.id) && (
                            <MapPin className="h-3 w-3 text-primary ml-auto flex-shrink-0" />
                          )}
                        </div>
                        {e.summary && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.summary}</p>
                        )}
                        {e.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {e.tags.slice(0, 5).map((t) => (
                              <Link
                                key={t}
                                to={`/atlas/tag/${encodeURIComponent(t)}`}
                                className="relative z-10"
                              >
                                <Badge variant="outline" className="text-[10px] hover:bg-accent">#{t}</Badge>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
