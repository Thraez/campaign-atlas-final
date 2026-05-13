import { Link } from "react-router-dom";
import { Compass, Map, MapPin, BookOpen, CalendarClock, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const tiles = [
  { to: "/atlas", title: "Player Atlas", icon: Map,
    desc: "The published, player-safe map and wiki. DM-only entries are physically removed before publish.",
    cta: "Open the atlas →" },
  { to: "/atlas/edit", title: "DM Placement & Map Editor", icon: MapPin,
    desc: "Place pins on maps, manage map image layers, and export YAML patches you can commit to GitHub.",
    cta: "Open editor →", badge: "DM" },
  { to: "/atlas/browse", title: "Browse", icon: BookOpen,
    desc: "Alphabetical directory plus tag and type landing pages.",
    cta: "Browse entries →" },
  { to: "/atlas/timeline", title: "Timeline", icon: CalendarClock,
    desc: "In-world calendar timeline of every dated entry.",
    cta: "Open timeline →" },
  { to: "/legacy-editor", title: "Legacy Local Editor", icon: FlaskConical,
    desc: "The original in-browser atlas editor with optional cloud save. Kept for back-compat — not the source of truth.",
    cta: "Open legacy editor →", badge: "Legacy" },
];

export default function Landing() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <Compass className="h-6 w-6 text-primary" />
          <h1 className="font-display text-xl text-primary">AstrathDeeprealm Atlas</h1>
          <Badge variant="outline" className="ml-2 text-[10px]">Obsidian → GitHub → Pages</Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section className="space-y-2">
          <h2 className="font-display text-3xl">Start here</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            This atlas reads from Obsidian markdown in <code className="px-1 py-0.5 bg-muted rounded">content/</code>, builds
            a player-safe JSON, and serves it from <code className="px-1 py-0.5 bg-muted rounded">public/atlas/</code>.
            The browser never writes to GitHub directly — DM edits happen here, then export → commit → publish.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {tiles.map(({ to, title, desc, cta, icon: Icon, badge }) => (
            <Link
              key={to}
              to={to}
              className="group block rounded-lg border border-border bg-card hover:bg-accent/30 hover:border-primary/40 transition p-5"
            >
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg">{title}</h3>
                    {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{desc}</p>
                  <div className="text-xs text-primary mt-3 group-hover:underline">{cta}</div>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="font-display text-xl">How saving actually works</h2>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li><strong>Local browser draft</strong> — placement and layer edits in <code>/atlas/edit</code> are autosaved to your browser. Nothing leaves your machine until you export.</li>
            <li><strong>Exported YAML patch</strong> — placements and map layers are exported as YAML/JSON snippets you paste into <code>content/&lt;world&gt;/_atlas/world.yaml</code> or run through <code>npm run atlas:apply-placements</code>.</li>
            <li><strong>Asset bundle</strong> — uploaded images live as previews in your browser. To publish them, save the file into <code>public/atlas/assets/maps/</code> and commit it.</li>
            <li><strong>Player-safe published atlas</strong> — <code>npm run atlas:publish</code> runs the player build (strict) and Vite build. The GitHub Action does this on every push to <code>main</code>.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
