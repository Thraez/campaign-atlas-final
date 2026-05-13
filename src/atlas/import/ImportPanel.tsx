/**
 * Obsidian import / migration panel — lives as a tab inside `/atlas/edit`.
 *
 * The DM picks an Obsidian vault folder (or individual .md files); we parse
 * everything in the browser, classify by import level, infer types, and
 * suggest YAML frontmatter patches. Nothing leaves the browser unless the DM
 * downloads a patch.
 */

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Eye,
  EyeOff,
  FileWarning,
  FolderOpen,
  Lock,
  MapPin,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  buildEntityFrontmatterPatch,
  type EntityFrontmatterPatch,
} from "@/atlas/yaml/buildPatches";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { parseObsidianFile, type ImportedFile, type ImportLevel } from "./parseObsidian";
import type { EntityVisibility } from "@/atlas/content/schema";

interface FileWithPath {
  file: File;
  /** webkitRelativePath, falls back to file.name. */
  relPath: string;
}

interface DmOverride {
  visibility?: EntityVisibility;
  level?: ImportLevel;
  ignored?: boolean;
  acceptSummary?: boolean;
}

const LEVEL_LABEL: Record<ImportLevel, string> = {
  ignored: "Ignored",
  "wiki-only": "Wiki only",
  placeable: "Placeable",
  "player-published": "Player published",
};

const LEVEL_TONE: Record<ImportLevel, string> = {
  ignored: "bg-muted text-muted-foreground",
  "wiki-only": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  placeable: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "player-published": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function downloadText(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.success(`Downloaded ${name}`);
}

export function ImportPanel({ knownEntityNames }: { knownEntityNames?: Set<string> }) {
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [overrides, setOverrides] = useState<Record<string, DmOverride>>({});
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const md: FileWithPath[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i)!;
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      if (!/\.md$/i.test(f.name)) continue;
      md.push({ file: f, relPath: rel });
    }
    if (!md.length) {
      toast.warning("No .md files found in selection.");
      return;
    }
    const parsed: ImportedFile[] = [];
    for (const { file, relPath } of md) {
      try {
        const text = await file.text();
        parsed.push(parseObsidianFile(text, relPath, { knownEntityNames }));
      } catch (e) {
        toast.error(`Failed to read ${relPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setFiles(parsed);
    setSelected(new Set(parsed.filter((f) => f.level !== "ignored").map((f) => f.relPath)));
    toast.success(`Scanned ${parsed.length} markdown file(s).`);
  };

  const effectiveLevel = (f: ImportedFile): ImportLevel => {
    const o = overrides[f.relPath];
    if (o?.ignored) return "ignored";
    return o?.level ?? f.level;
  };

  const effectiveVisibility = (f: ImportedFile): EntityVisibility =>
    overrides[f.relPath]?.visibility ?? f.effectiveVisibility;

  const setOverride = (relPath: string, patch: DmOverride) =>
    setOverrides((s) => ({ ...s, [relPath]: { ...s[relPath], ...patch } }));

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.relPath.toLowerCase().includes(q) ||
        f.inferredType.toLowerCase().includes(q)
    );
  }, [files, filter]);

  const groups = useMemo(() => {
    const out: Record<ImportLevel, ImportedFile[]> = {
      ignored: [],
      "wiki-only": [],
      placeable: [],
      "player-published": [],
    };
    for (const f of filtered) out[effectiveLevel(f)].push(f);
    return out;
  }, [filtered, overrides]);

  const summary = useMemo(() => {
    let withFm = 0,
      missingFm = 0,
      missingAttachments = 0,
      brokenLinks = 0,
      playerWarnings = 0;
    for (const f of files) {
      if (f.hasFrontmatter) withFm++;
      else missingFm++;
      missingAttachments += f.attachments.filter((a) => !a.resolved && !a.rawSrc.startsWith("/")).length;
      brokenLinks += f.wikilinks.filter((w) => w.broken).length;
      if (effectiveLevel(f) === "player-published" && f.warnings.length > 0) playerWarnings++;
    }
    return { withFm, missingFm, missingAttachments, brokenLinks, playerWarnings };
  }, [files, overrides]);

  /** Build EntityFrontmatterPatch[] for the chosen files. */
  const collectPatches = (relPaths: Iterable<string>, opts: { safeOnly?: boolean } = {}): EntityFrontmatterPatch[] => {
    const out: EntityFrontmatterPatch[] = [];
    const wantSafe = !!opts.safeOnly;
    for (const rel of relPaths) {
      const f = files.find((x) => x.relPath === rel);
      if (!f) continue;
      const lvl = effectiveLevel(f);
      if (lvl === "ignored") continue;
      const vis = effectiveVisibility(f);
      // "Safe only" excludes player-published files that still have warnings.
      if (wantSafe && vis === "player" && f.warnings.length > 0) continue;
      out.push({
        sourcePath: f.relPath,
        title: f.title,
        atlas: {
          id: f.suggestedId,
          type: f.inferredType,
          visibility: vis,
          summary: f.suggestedSummary,
        },
      });
    }
    return out;
  };

  const exportPatches = (relPaths: Iterable<string>, label: string, opts: { safeOnly?: boolean } = {}) => {
    const patches = collectPatches(relPaths, opts);
    if (!patches.length) {
      toast.warning("Nothing to export.");
      return;
    }
    const artifact = buildEntityFrontmatterPatch(patches);
    const validation = validatePatchYaml(artifact.content, "placement"); // reuse parser check
    if (validation.errors.some((e) => /code fence/i.test(e))) {
      toast.error("Generated patch contained markdown fences (bug). Aborted.");
      return;
    }
    downloadText(artifact.filename.replace(".yaml", `-${label}.yaml`), artifact.content, artifact.mime);
  };

  const exportSelected = () => exportPatches(selected, "selected");
  const exportSafeAll = () => exportPatches(files.map((f) => f.relPath), "safe-all", { safeOnly: true });

  const toggleSelected = (relPath: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="text-xs text-muted-foreground">
          Drop in your Obsidian vault — the tool infers types, defaults unsafe values to <strong>DM-only</strong>, and generates suggested frontmatter patches.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="default" className="flex-1 gap-1.5" onClick={() => folderInput.current?.click()}>
            <FolderOpen className="h-3.5 w-3.5" /> Pick vault folder
          </Button>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Files
          </Button>
          {files.length > 0 && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setFiles([]); setOverrides({}); setSelected(new Set()); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <input
          ref={folderInput}
          type="file"
          multiple
          // @ts-expect-error non-standard but supported in Chromium/WebKit
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".md,text/markdown"
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />

        {files.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <Stat label="With frontmatter" value={summary.withFm} />
              <Stat label="Missing frontmatter" value={summary.missingFm} tone={summary.missingFm ? "warn" : undefined} />
              <Stat label="Unresolved wikilinks" value={summary.brokenLinks} tone={summary.brokenLinks ? "warn" : undefined} />
              <Stat label="Missing attachments" value={summary.missingAttachments} tone={summary.missingAttachments ? "warn" : undefined} />
            </div>
            <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-7 text-xs" />
            <div className="flex gap-1.5">
              <Button size="sm" variant="default" className="flex-1 gap-1.5" onClick={exportSelected} disabled={selected.size === 0}>
                <Download className="h-3.5 w-3.5" /> Export selected ({selected.size})
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={exportSafeAll} title="Export every non-ignored file whose effective visibility is safe">
                <Sparkles className="h-3.5 w-3.5" /> Safe all
              </Button>
            </div>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        {files.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground text-center">
            No files scanned yet. Pick a folder or drop in .md files.
          </div>
        ) : (
          (Object.keys(groups) as ImportLevel[]).map((lvl) => {
            const list = groups[lvl];
            if (!list.length) return null;
            return (
              <div key={lvl} className="px-2 py-2">
                <div className="flex items-center gap-2 px-1 py-1">
                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider border ${LEVEL_TONE[lvl]}`}>
                    {LEVEL_LABEL[lvl]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{list.length} file{list.length === 1 ? "" : "s"}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((f) => (
                    <FileRow
                      key={f.relPath}
                      file={f}
                      effectiveLevel={effectiveLevel(f)}
                      effectiveVisibility={effectiveVisibility(f)}
                      selected={selected.has(f.relPath)}
                      onToggleSelected={() => toggleSelected(f.relPath)}
                      onSetVisibility={(v) => setOverride(f.relPath, { visibility: v })}
                      onSetLevel={(l) => setOverride(f.relPath, { level: l, ignored: l === "ignored" })}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`rounded border px-2 py-1 ${tone === "warn" ? "border-amber-500/30 text-amber-300 bg-amber-500/10" : "border-border text-muted-foreground bg-muted/30"}`}>
      <div className="text-[9px] uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

interface FileRowProps {
  file: ImportedFile;
  effectiveLevel: ImportLevel;
  effectiveVisibility: EntityVisibility;
  selected: boolean;
  onToggleSelected: () => void;
  onSetVisibility: (v: EntityVisibility) => void;
  onSetLevel: (l: ImportLevel) => void;
}

function FileRow({ file, effectiveLevel, effectiveVisibility, selected, onToggleSelected, onSetVisibility, onSetLevel }: FileRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-md border ${selected ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20"} px-2 py-1.5`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected} onChange={onToggleSelected} className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm truncate">
            <span className="font-medium truncate">{file.title}</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1">{file.inferredType}</Badge>
            {!file.hasFrontmatter && <Badge variant="outline" className="text-[9px] h-4 px-1 text-amber-300 border-amber-500/30">no FM</Badge>}
          </div>
          <div className="text-[10px] text-muted-foreground truncate font-mono">{file.relPath}</div>
          {file.warnings.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {file.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1 text-[10px] text-amber-300">
                  <FileWarning className="h-3 w-3 shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-primary hover:underline mt-1">
            {open ? "hide" : "details"}
          </button>
          {open && (
            <div className="mt-1.5 space-y-1.5 text-[10px] text-muted-foreground">
              {file.suggestedSummary && (
                <div>
                  <span className="text-foreground font-medium">Summary{file.summaryWasGenerated ? " (suggested)" : ""}:</span> {file.suggestedSummary}
                </div>
              )}
              {file.wikilinks.length > 0 && (
                <div>
                  <span className="text-foreground font-medium">Wikilinks:</span>{" "}
                  {file.wikilinks.slice(0, 8).map((w, i) => (
                    <span key={i} className={`mr-1.5 ${w.broken ? "text-amber-300" : ""}`}>[[{w.target}]]</span>
                  ))}
                  {file.wikilinks.length > 8 && <span>+{file.wikilinks.length - 8} more</span>}
                </div>
              )}
              {file.attachments.length > 0 && (
                <div>
                  <span className="text-foreground font-medium">Attachments:</span>{" "}
                  {file.attachments.map((a, i) => (
                    <div key={i} className="font-mono">
                      {a.rawSrc} → {a.suggestedTarget} {!a.resolved && <span className="text-amber-300">(needs path)</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <div className="flex gap-0.5">
            <IconBtn title="Mark DM only" active={effectiveVisibility === "dm"} onClick={() => onSetVisibility("dm")} icon={<Lock className="h-3 w-3" />} />
            <IconBtn title="Mark player visible" active={effectiveVisibility === "player"} onClick={() => onSetVisibility("player")} icon={<Eye className="h-3 w-3" />} />
            <IconBtn title="Mark hidden" active={effectiveVisibility === "hidden"} onClick={() => onSetVisibility("hidden")} icon={<EyeOff className="h-3 w-3" />} />
          </div>
          <div className="flex gap-0.5">
            <IconBtn title="Make placeable" active={effectiveLevel === "placeable"} onClick={() => onSetLevel("placeable")} icon={<MapPin className="h-3 w-3" />} />
            <IconBtn title="Wiki only" active={effectiveLevel === "wiki-only"} onClick={() => onSetLevel("wiki-only")} icon={<ShieldAlert className="h-3 w-3" />} />
            <IconBtn title="Ignore file" active={effectiveLevel === "ignored"} onClick={() => onSetLevel("ignored")} icon={<Trash2 className="h-3 w-3" />} />
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ title, active, onClick, icon }: { title: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`h-6 w-6 rounded flex items-center justify-center border text-[10px] ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}
    >
      {icon}
    </button>
  );
}
