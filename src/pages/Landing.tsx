import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Compass, Map, MapPin, BookOpen, CalendarClock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isDmToolsEnabled } from "@/atlas/dmTools";
import { loadAtlasContent } from "@/atlas/content/loader";

/**
 * The front door. Two doors, actually: read the world, or work on it.
 *
 * This page used to open with "Obsidian → GitHub → Pages", three source paths,
 * an npm command, and a section headed "How saving actually works". All true,
 * none of it what a DM opening their atlas needs first. The build details now
 * live behind one disclosure at the bottom for the times you do want them.
 */

interface WorldSummary {
  name: string;
  entities: number;
  places: number;
  publishedAt: string | null;
}

const allTiles = [
  {
    to: "/atlas",
    title: "Open the map",
    icon: Map,
    desc: "What your players see — the map, the places, and the lore you've published.",
  },
  // Editor tile is build-gated. In player production builds __INCLUDE_EDITOR__
  // is replaced with `false`, so this entry (and the literal "/atlas/edit"
  // href) is dead-coded out of the bundle entirely.
  ...(__INCLUDE_EDITOR__
    ? [
        {
          to: "/atlas/edit",
          title: "Open the editor",
          icon: MapPin,
          desc: "Add places, people and events, drop pins, and publish when you're ready.",
          badge: "Only you",
          dmOnly: true,
        } as const,
      ]
    : []),
  {
    to: "/atlas/browse",
    title: "Browse everything",
    icon: BookOpen,
    desc: "Every entry by name, by kind, or by tag.",
  },
  {
    to: "/atlas/timeline",
    title: "Timeline",
    icon: CalendarClock,
    desc: "Your world's history, in the order it happened.",
  },
];

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function Landing() {
  const dmOn = isDmToolsEnabled();
  const tiles = allTiles.filter((t) => !t.dmOnly || dmOn);
  const [world, setWorld] = useState<WorldSummary | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  // The world's own name, rather than a hardcoded one that drifts. Failure is
  // non-fatal: the page still works, it just falls back to a generic title.
  useEffect(() => {
    let alive = true;
    // Async IIFE, not a .then() chain: if the atlas can't be reached at all
    // (no fetch in the environment, missing artifact) the throw is synchronous
    // and would escape a trailing .catch, taking the whole page with it.
    void (async () => {
      try {
        const project = await loadAtlasContent();
        if (!alive) return;
        setWorld({
          name: project.worlds[0]?.name ?? "Atlas",
          entities: project.entities.length,
          places: project.placements.length,
          publishedAt: project.publishedAt ?? null,
        });
      } catch {
        /* non-fatal — the doors below work regardless */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const published = formatPublished(world?.publishedAt ?? null);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <Compass className="h-6 w-6 text-primary shrink-0" aria-hidden />
          <h1 className="font-display text-xl text-primary truncate">{world?.name ?? "Atlas"}</h1>
          {dmOn && (
            <Badge variant="outline" className="ml-auto text-[10px] shrink-0">
              Your copy
            </Badge>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section className="space-y-2">
          <h2 className="font-display text-3xl">An atlas for your table.</h2>
          {world && (
            <p className="text-sm text-muted-foreground">
              <span className="tabular-nums">{world.entities}</span>{" "}
              {world.entities === 1 ? "entry" : "entries"} ·{" "}
              <span className="tabular-nums">{world.places}</span> on the map
              {published ? ` · last published ${published}` : ""}
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {tiles.map(({ to, title, desc, icon: Icon, badge }) => (
            <Link
              key={to}
              to={to}
              className="group block rounded-lg border border-border bg-card hover:bg-accent/30 hover:border-primary/40 transition p-5"
            >
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg">{title}</h3>
                    {badge && (
                      <Badge variant="secondary" className="text-[10px]">
                        {badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{desc}</p>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground mt-1 shrink-0 group-hover:text-primary transition"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </section>

        <section className="border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            aria-expanded={howOpen}
            className="text-sm text-primary hover:underline flex items-center gap-1.5"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${howOpen ? "rotate-90" : ""}`}
              aria-hidden
            />
            How this works under the hood
          </button>
          {howOpen && (
            <div className="mt-3 text-sm text-muted-foreground space-y-2 max-w-2xl">
              <p>
                Your world is plain markdown in <code>content/</code> — a valid Obsidian vault on
                its own. A build step turns it into the player-safe atlas this site reads from,
                stripping every DM-only entry before it ships.
              </p>
              {__INCLUDE_EDITOR__ && (
                <p>
                  Changes you make in the editor stay in your browser until you save. Saving writes
                  them back into those markdown files and rebuilds the atlas, so the player view
                  updates without leaving the page. Commit with git when you're happy.
                </p>
              )}
              <p>
                Publishing runs the strict player build plus every safety scan, then deploys the
                static site. The GitHub Action does it for you on each push to <code>main</code>.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
