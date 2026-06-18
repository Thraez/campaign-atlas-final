import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject } from "@/atlas/content/schema";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { playerTypeLabel } from "@/atlas/content/typeLabel";

export default function AtlasCredits() {
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAtlasContent(true).then(setProject).catch((e: Error) => setError(e.message));
  }, []);

  const credited = useMemo(
    () =>
      (project?.entities ?? [])
        .filter((e) => e.credit && e.visibility !== "dm")
        .sort((a, b) => a.title.localeCompare(b.title)),
    [project]
  );

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive text-sm p-6">
        {error}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AtlasNavMenu publishedAt={project.publishedAt} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to atlas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-display">Image Credits</h1>
        </div>

        {credited.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground text-sm text-center">
            <Star className="h-8 w-8 opacity-30" aria-hidden="true" />
            <p>No image credits have been added to this atlas yet.</p>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {credited.map((entity) => (
              <li
                key={entity.id}
                className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/?entity=${entity.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors text-sm"
                  >
                    {entity.title}
                  </Link>
                  {entity.type && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {playerTypeLabel(entity.type)}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {entity.credit}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
