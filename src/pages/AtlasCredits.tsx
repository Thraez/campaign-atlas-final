import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import type { AtlasProject, Entity } from "@/atlas/content/schema";
import { useAtlasContent } from "@/atlas/content/useAtlasContent";
import { AtlasLoadState } from "@/atlas/content/AtlasLoadState";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";
import { playerTypeLabel } from "@/atlas/content/typeLabel";

/** One row on the credits page. Sourced either from an entity's coarse
 *  `credit` field or from a world-level `assetCredits` registry entry. */
interface CreditRow {
  key: string;
  title: string;
  typeLabel?: string;
  href?: string;
  credit: string;
}

/**
 * Aggregate credit rows from both sources: entity.credit (player-visible
 * entities only, unchanged from before) AND the assetCredits registry
 * (enabled, non-empty entries only), so attributions authored only via the
 * Asset Manager still show up here. De-duped so an asset whose registry
 * entry repeats an already-shown entity credit for the same image doesn't
 * produce a second row for the same attribution.
 */
function buildCreditRows(project: AtlasProject | null): CreditRow[] {
  if (!project) return [];
  const visibleEntities = (project.entities ?? []).filter((e) => e.visibility !== "dm");

  const entityRows: CreditRow[] = visibleEntities
    .filter((e) => e.credit && e.credit.trim() !== "")
    .map((e) => ({
      key: `entity:${e.id}`,
      title: e.title,
      typeLabel: e.type ? playerTypeLabel(e.type) : undefined,
      href: `/?entity=${e.id}`,
      credit: e.credit as string,
    }));

  // Which visible entities use a given image src — used both to link an
  // asset-only row to an entity when possible, and to skip a duplicate row
  // when the registry just repeats that entity's own credit text.
  const ownersBySrc = new Map<string, Entity[]>();
  for (const e of visibleEntities) {
    for (const img of e.images ?? []) {
      const list = ownersBySrc.get(img) ?? [];
      list.push(e);
      ownersBySrc.set(img, list);
    }
  }

  const registry = project.worlds[0]?.assetCredits ?? {};
  const assetRows: CreditRow[] = [];
  for (const [src, entry] of Object.entries(registry)) {
    if (!entry.enabled || !entry.credit || entry.credit.trim() === "") continue;
    const owners = ownersBySrc.get(src) ?? [];
    if (owners.some((o) => o.credit === entry.credit)) continue; // already shown above
    const owner = owners[0];
    assetRows.push({
      key: `asset:${src}`,
      title: owner ? owner.title : (src.split("/").pop() ?? src),
      typeLabel: owner?.type ? playerTypeLabel(owner.type) : undefined,
      href: owner ? `/?entity=${owner.id}` : undefined,
      credit: entry.credit,
    });
  }

  return [...entityRows, ...assetRows].sort((a, b) => a.title.localeCompare(b.title));
}

export default function AtlasCredits() {
  const { project, error } = useAtlasContent();

  const rows = useMemo(() => buildCreditRows(project), [project]);

  if (error || !project) {
    return <AtlasLoadState error={error} loading={!project} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a href="#credits-main" className="skip-to-main">
        Skip to content
      </a>
      <AtlasNavMenu publishedAt={project.publishedAt} />
      <main id="credits-main" className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
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

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground text-sm text-center">
            <Star className="h-8 w-8 opacity-30" aria-hidden="true" />
            <p>No image credits have been added to this atlas yet.</p>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  {row.href ? (
                    <Link
                      to={row.href}
                      className="font-medium text-foreground hover:text-primary transition-colors text-sm"
                    >
                      {row.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground text-sm">{row.title}</span>
                  )}
                  {row.typeLabel && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {row.typeLabel}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">{row.credit}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
