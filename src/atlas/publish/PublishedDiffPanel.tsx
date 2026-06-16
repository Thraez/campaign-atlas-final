/**
 * "Changes since last publish" panel in the Publish Check tab.
 *
 * Fetches `public/atlas/.last-published.json` (snapshot of the previous
 * deployed atlas, written by the `atlas:snapshot` script that runs at the
 * start of `atlas:publish`) and diffs it against the currently loaded atlas
 * (= what would be deployed if you publish right now).
 *
 * If no baseline file exists, the panel prompts the DM to run a snapshot.
 */
import { useEffect, useState } from "react";
import type { AtlasProject } from "@/atlas/content/schema";
import { computeAtlasDiff, type AtlasDiff } from "./computeAtlasDiff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  GitCompare,
  RotateCcw,
  Plus,
  Minus,
  Eye,
  FileText,
  Edit2,
} from "lucide-react";

interface Props {
  /** The currently-loaded atlas project (= about-to-deploy state). Used only in self-fetch mode. */
  current?: AtlasProject;
  /** Precomputed server-side diff (player-vs-player). When set, renders directly — no fetch, no compute. */
  diff?: AtlasDiff;
}

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");

async function fetchBaseline(): Promise<AtlasProject | null> {
  try {
    const res = await fetch(`${BASE}atlas/.last-published.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as AtlasProject;
  } catch {
    return null;
  }
}

export function PublishedDiffPanel({ current, diff: providedDiff }: Props) {
  const [baseline, setBaseline] = useState<AtlasProject | null>(null);
  const [loading, setLoading] = useState(!providedDiff);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (providedDiff) { setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    fetchBaseline().then((b) => {
      if (!mounted) return;
      setBaseline(b);
      setMissing(b == null);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [providedDiff]);

  const refresh = () => {
    setLoading(true);
    fetchBaseline().then((b) => {
      setBaseline(b);
      setMissing(b == null);
      setLoading(false);
    });
  };

  const diff = providedDiff ?? (baseline && current ? computeAtlasDiff(baseline, current) : null);

  return (
    <div className="rounded-md border border-border bg-card/30">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <GitCompare className="h-3 w-3" />
        <span>Changes since last publish</span>
        {diff?.hasChanges && (
          <span className="ml-auto flex items-center gap-1">
            {diff.counts.entities > 0 && <Badge variant="secondary" className="text-[9px]">{diff.counts.entities} entities</Badge>}
            {diff.counts.placements > 0 && <Badge variant="secondary" className="text-[9px]">{diff.counts.placements} pins</Badge>}
            {(diff.counts.maps + diff.counts.overlays) > 0 && (
              <Badge variant="secondary" className="text-[9px]">{diff.counts.maps + diff.counts.overlays} maps/overlays</Badge>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 text-xs space-y-2">
          {loading && <div className="text-muted-foreground py-2">Loading baseline…</div>}
          {!loading && missing && !providedDiff && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
              <div className="text-foreground">No baseline snapshot found.</div>
              <div className="text-muted-foreground">
                The diff panel compares against <code className="font-mono text-[10px]">public/atlas/.last-published.json</code>,
                which is written by <code className="font-mono text-[10px]">npm run atlas:snapshot</code> (also chained at the
                start of <code className="font-mono text-[10px]">atlas:publish</code>). Run a publish to seed it, then come back.
              </div>
              <Button size="sm" variant="ghost" onClick={refresh} className="h-6 px-2 text-[10px] gap-1">
                <RotateCcw className="h-3 w-3" /> Re-check
              </Button>
            </div>
          )}
          {!loading && diff && !diff.hasChanges && (
            <div className="text-muted-foreground py-1">No changes since last publish.</div>
          )}
          {!loading && diff && diff.hasChanges && (
            <>
              {diff.entities.length > 0 && (
                <DiffSection title="Entities" items={diff.entities.map((e) => ({
                  key: `${e.id}-${e.kind}`,
                  icon: iconFor(e.kind),
                  label: e.title,
                  hint: e.kind === "visibility-changed"
                    ? `visibility: ${e.before} → ${e.after}`
                    : e.kind === "title-changed"
                    ? `title: ${e.before} → ${e.after}`
                    : kindLabel(e.kind),
                  tone: toneFor(e.kind),
                }))} />
              )}
              {diff.placements.length > 0 && (
                <DiffSection title="Placements" items={diff.placements.map((p, i) => ({
                  key: `plc-${i}`,
                  icon: iconFor(p.kind),
                  label: `${p.entityTitle}`,
                  hint: p.kind === "moved"
                    ? `${p.mapId}: (${p.before?.x.toFixed(0)},${p.before?.y.toFixed(0)}) → (${p.after?.x.toFixed(0)},${p.after?.y.toFixed(0)})`
                    : p.kind === "added"
                    ? `${p.mapId}: (${p.after?.x.toFixed(0)},${p.after?.y.toFixed(0)})`
                    : `${p.mapId}: removed`,
                  tone: toneFor(p.kind),
                }))} />
              )}
              {diff.maps.length > 0 && (
                <DiffSection title="Maps" items={diff.maps.map((m) => ({
                  key: `map-${m.id}-${m.kind}`,
                  icon: iconFor(m.kind),
                  label: m.name,
                  hint: kindLabel(m.kind),
                  tone: toneFor(m.kind),
                }))} />
              )}
              {diff.overlays.length > 0 && (
                <DiffSection title="Regions & routes" items={diff.overlays.map((o, i) => ({
                  key: `ov-${i}`,
                  icon: o.kind.endsWith("added") ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />,
                  label: o.name ?? "(untitled)",
                  hint: `${o.mapId} — ${o.kind.replace("-", " ")}`,
                  tone: o.kind.endsWith("added") ? "text-primary" : "text-destructive",
                }))} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function iconFor(kind: string) {
  if (kind === "added") return <Plus className="h-3 w-3" />;
  if (kind === "removed") return <Minus className="h-3 w-3" />;
  if (kind === "moved") return <Edit2 className="h-3 w-3" />;
  if (kind === "visibility-changed") return <Eye className="h-3 w-3" />;
  if (kind === "title-changed") return <Edit2 className="h-3 w-3" />;
  return <FileText className="h-3 w-3" />;
}

function toneFor(kind: string): string {
  if (kind === "added") return "text-primary";
  if (kind === "removed") return "text-destructive";
  if (kind === "visibility-changed") return "text-amber-500";
  return "text-muted-foreground";
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "added": return "added";
    case "removed": return "removed";
    case "moved": return "moved";
    case "summary-changed": return "summary edited";
    case "body-changed": return "body edited";
    case "title-changed": return "title changed";
    case "visibility-changed": return "visibility changed";
    default: return kind;
  }
}

function DiffSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; icon: React.ReactNode; label: string; hint?: string; tone: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title} ({items.length})</div>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-1.5 leading-tight">
            <span className={`${it.tone} mt-0.5 shrink-0`}>{it.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="text-foreground">{it.label}</span>
              {it.hint && <span className="text-muted-foreground text-[10px] ml-1.5">— {it.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
