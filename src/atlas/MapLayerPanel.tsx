import { useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Upload, Link as LinkIcon, Trash2, Maximize2, Minimize2, Crosshair, RotateCcw, Lock, Unlock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, FileCode, Copy, Eraser, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import { ExportChecklistDialog, useExportChecklist } from "./ExportChecklistDialog";
import { normalizeAtlasAssetUrl } from "./url";

interface Props {
  map: MapDocument;
  mergedLayers: MapLayer[];
  localLayers: LocalLayer[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onAddFiles: (files: File[]) => void | Promise<void>;
  onAddUrl: (src: string) => void | Promise<void>;
  onEditBuiltin: (id: string) => void;
  onUpdate: (id: string, patch: Partial<MapLayer>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onSetMapSize?: (w: number, h: number) => void;
}

const NUDGE_STEPS = [100, 1000, 10000];
const SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

function downloadText(name: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  toast.success(`Downloaded ${name}`);
}

export function MapLayerPanel(props: Props) {
  const { map, mergedLayers, localLayers, selectedId, setSelectedId, onAddFiles, onAddUrl, onEditBuiltin, onUpdate, onDuplicate, onRemove, onClearAll, onSetMapSize } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const [locked, setLocked] = useState(false);
  const checklist = useExportChecklist();

  const selected = mergedLayers.find((l) => l.id === selectedId) ?? null;
  const localSelected = localLayers.find((l) => l.id === selectedId) ?? null;
  const isBuiltinReadOnly = !!selected && !localSelected;

  const aspect = selected ? (selected.height === 0 ? 1 : selected.width / selected.height) : 1;

  const ensureEditable = (id: string) => {
    if (!localLayers.find((l) => l.id === id)) {
      onEditBuiltin(id);
      toast.info("Editing built-in layer locally — export patch to commit.");
    }
  };

  const patch = (p: Partial<MapLayer>) => {
    if (!selected || locked) return;
    ensureEditable(selected.id);
    onUpdate(selected.id, p);
  };

  const setSize = (w: number, h: number) => {
    if (!selected) return;
    patch({ width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
  };

  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    patch({ x: selected.x + dx, y: selected.y + dy });
  };

  const scale = (factor: number) => {
    if (!selected) return;
    const w = selected.width * factor;
    const h = lockAspect ? w / aspect : selected.height * factor;
    setSize(w, h);
  };

  const fitWidth = () => selected && setSize(map.width, lockAspect ? map.width / aspect : selected.height);
  const fitHeight = () => selected && setSize(lockAspect ? map.height * aspect : selected.width, map.height);

  const exportZip = async () => {
    const uploads = localLayers.filter((l) => l.origin === "upload" && l.dataUrl);
    if (uploads.length === 0) {
      toast.info("No uploaded files to bundle (only data-URL uploads can be zipped).");
      return;
    }
    const zip = new JSZip();
    for (const u of uploads) {
      const targetPath = (u.targetPath ?? `public/atlas/assets/maps/${u.id}`).replace(/^\/+/, "");
      const m = u.dataUrl!.match(/^data:[^;]+;base64,(.*)$/);
      if (!m) continue;
      zip.file(targetPath, m[1], { base64: true });
    }
    zip.file("README.txt", [
      "AstrathDeeprealm Atlas — uploaded asset bundle",
      "",
      "Unzip from the repository root so files land at the listed paths,",
      "then commit alongside your world.yaml patch and run:",
      "  npm run atlas:build:player",
      "",
      "Files:",
      ...uploads.map((u) => `  - ${(u.targetPath ?? "").replace(/^\/+/, "")}`),
    ].join("\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `atlas-assets-${map.id}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Bundled ${uploads.length} file${uploads.length === 1 ? "" : "s"}`);
    checklist.show({
      title: "Asset bundle exported",
      description: "Your uploaded images are ready. Follow the checklist to commit them.",
      files: [`atlas-assets-${map.id}.zip`],
      steps: [
        { label: "Upload files from the zip to GitHub", detail: `In your repo, go to public/atlas/assets/maps/ and upload ${uploads.length} image file(s). Or unzip the bundle at the repo root.` },
        { label: "Apply the world.yaml patch", detail: "Open the downloaded Patch.md and paste the YAML under the matching map entry in content/<world>/_atlas/world.yaml." },
        { label: "Commit changes to main", detail: "Push the updated world.yaml and new images." },
        { label: "GitHub Action publishes automatically", detail: "The publish-atlas.yml workflow will run and deploy to GitHub Pages." },
      ],
    });
  };

  const exportPatch = () => {
    const lines: string[] = [];
    lines.push(`# Map layer patch — ${map.name}`);
    lines.push("");
    lines.push("Paste under the matching map entry in `content/<world>/_atlas/world.yaml`.");
    lines.push("Uploaded local images must also be saved to the listed `targetPath` and committed.");
    lines.push("");
    lines.push("```yaml");
    lines.push(`maps:`);
    lines.push(`  - id: ${map.id}`);
    lines.push(`    name: ${yamlString(map.name)}`);
    lines.push(`    width: ${map.width}`);
    lines.push(`    height: ${map.height}`);
    if (map.oceanColor) lines.push(`    oceanColor: ${yamlString(map.oceanColor)}`);
    lines.push(`    wrapX: ${!!map.wrapX}`);
    lines.push(`    layers:`);
    for (const l of mergedLayers) {
      const local = localLayers.find((x) => x.id === l.id);
      const src = local?.origin === "upload"
        ? `/${(local.targetPath ?? `public/atlas/assets/maps/${l.id}.webp`).replace(/^public\//, "")}`
        : l.src;
      lines.push(`      - id: ${yamlString(l.id)}`);
      lines.push(`        src: ${yamlString(src)}`);
      lines.push(`        x: ${Math.round(l.x)}`);
      lines.push(`        y: ${Math.round(l.y)}`);
      lines.push(`        width: ${Math.round(l.width)}`);
      lines.push(`        height: ${Math.round(l.height)}`);
      lines.push(`        opacity: ${l.opacity}`);
      lines.push(`        zIndex: ${l.zIndex}`);
      if (local?.origin === "upload") {
        lines.push(`        # ⤷ uploaded locally — save file to ${local.targetPath}`);
      }
    }
    lines.push("```");
    lines.push("");
    const uploads = localLayers.filter((l) => l.origin === "upload");
    if (uploads.length) {
      lines.push(`## Asset checklist`);
      lines.push("");
      for (const u of uploads) {
        lines.push(`- [ ] Save \`${u.filename}\` → \`${u.targetPath}\``);
      }
    }
    downloadText(`map-layers-${map.id}.md`, lines.join("\n"), "text/markdown");
    checklist.show({
      title: "Layer patch exported",
      description: "Your map layer YAML patch is ready. Follow the checklist to commit it.",
      files: [`map-layers-${map.id}.md`],
      steps: [
        { label: "Open the downloaded Patch.md file", detail: "It contains the YAML snippet to paste into world.yaml." },
        { label: "Paste under the matching map entry", detail: `In content/<world>/_atlas/world.yaml, find the map with id "${map.id}" and replace its layers section with the exported YAML.` },
        ...(uploads.length ? [{ label: "Upload image files to GitHub", detail: `Upload ${uploads.length} image file(s) to their target paths (e.g., public/atlas/assets/maps/).` }] : []),
        { label: "Commit changes to main", detail: "Push the updated world.yaml and any new images." },
        { label: "GitHub Action publishes automatically", detail: "The publish-atlas.yml workflow will run and deploy to GitHub Pages." },
      ],
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="text-xs text-muted-foreground">
          Edits here are <strong>local browser drafts</strong>. Export the patch and commit the YAML + asset files to publish.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1 gap-1.5" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload images
          </Button>
          <Button size="sm" variant="default" className="gap-1.5" onClick={exportPatch} title="Download world.yaml patch">
            <FileCode className="h-3.5 w-3.5" /> Patch
          </Button>
          <Button size="sm" variant="default" className="gap-1.5" onClick={exportZip} title="Download .zip of uploaded assets">
            <Package className="h-3.5 w-3.5" /> Zip
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title="Clear local draft assets">
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear local draft assets?</AlertDialogTitle>
                <AlertDialogDescription>
                  Removes every uploaded image preview and local layer override from this browser, across every map. Already-published assets in <code>public/atlas/</code> are not touched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { onClearAll(); toast.info("Local draft layers cleared."); }}>Clear drafts</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAddFiles(files);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/map.webp"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" variant="ghost" onClick={() => { onAddUrl(urlDraft); setUrlDraft(""); }}>
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
        {urlDraft && /^https?:/i.test(urlDraft) && (
          <p className="text-[10px] text-amber-300/90">
            External URLs may break — not recommended for the final player publish.
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {mergedLayers.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center italic">No layers yet. Upload an image or paste a URL.</p>
          )}
          {mergedLayers.slice().reverse().map((l) => {
            const local = localLayers.find((x) => x.id === l.id);
            const isSel = l.id === selectedId;
            return (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-2 ${isSel ? "bg-primary/15 border border-primary/40" : "hover:bg-accent/40 border border-transparent"}`}
              >
                <div className="h-8 w-8 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                  <img src={normalizeAtlasAssetUrl(l.src)} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.id}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {local?.origin === "upload" && <Badge variant="secondary" className="h-3.5 px-1 text-[9px] mr-1">local preview</Badge>}
                    {local?.origin === "url" && <Badge variant="outline" className="h-3.5 px-1 text-[9px] mr-1">url</Badge>}
                    {!local && <Badge variant="outline" className="h-3.5 px-1 text-[9px] mr-1">built-in</Badge>}
                    {Math.round(l.width)}×{Math.round(l.height)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="p-3 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transform</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDuplicate(selected.id)} title="Duplicate">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setLocked((v) => !v)} title={locked ? "Unlock" : "Lock"}>
                  {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </Button>
                {localSelected && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onRemove(selected.id)} title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {isBuiltinReadOnly && (
              <p className="text-[10px] text-muted-foreground italic">
                Built-in layer — edits create a local override.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="X" value={selected.x} onChange={(v) => patch({ x: v })} />
              <Field label="Y" value={selected.y} onChange={(v) => patch({ y: v })} />
              <Field label="Width" value={selected.width} onChange={(v) => {
                const h = lockAspect ? v / aspect : selected.height;
                setSize(v, h);
              }} />
              <Field label="Height" value={selected.height} onChange={(v) => {
                const w = lockAspect ? v * aspect : selected.width;
                setSize(w, v);
              }} />
              <Field label="zIndex" value={selected.zIndex} onChange={(v) => patch({ zIndex: v })} />
              <div className="col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Opacity {selected.opacity.toFixed(2)}</Label>
                <Slider min={0} max={1} step={0.05} value={[selected.opacity]} onValueChange={([v]) => patch({ opacity: v })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
              Lock aspect ratio
            </label>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Nudge</div>
              <div className="space-y-1.5">
                {NUDGE_STEPS.map((step) => (
                  <div key={step} className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground w-12">±{step}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(-step, 0)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(step, 0)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(0, -step)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(0, step)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Scale</div>
              <div className="flex flex-wrap gap-1">
                {SCALE_STEPS.map((s) => (
                  <Button key={s} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => scale(s)}>
                    {Math.round(s * 100)}%
                  </Button>
                ))}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={fitWidth}>Fit W</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={fitHeight}>Fit H</Button>
              </div>
            </div>

            {localSelected && (
              <div className="space-y-2 border-t border-border pt-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input value={localSelected.name ?? ""} onChange={(e) => onUpdate(selected.id, { name: e.target.value } as Partial<MapLayer>)} className="h-7 text-xs" />
                </div>
                {localSelected.origin === "upload" && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Target publish path</Label>
                    <Input
                      value={localSelected.targetPath ?? ""}
                      onChange={(e) => onUpdate(selected.id, { targetPath: e.target.value } as Partial<MapLayer>)}
                      className="h-7 text-xs font-mono"
                    />
                  </div>
                )}
                {localSelected.origin === "url" && /^https?:/i.test(localSelected.src) && (
                  <p className="text-[10px] text-amber-300/90">External image — may break in published builds.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <Button size="sm" variant="secondary" className="text-xs" onClick={() => patch({ x: (map.width - selected.width) / 2, y: (map.height - selected.height) / 2 })}>
                <Crosshair className="h-3.5 w-3.5 mr-1" />Center
              </Button>
              <Button size="sm" variant="secondary" className="text-xs" onClick={() => patch({ x: 0, y: 0, width: map.width, height: map.height })}>
                <Maximize2 className="h-3.5 w-3.5 mr-1" />Fit map
              </Button>
              <Button size="sm" variant="secondary" className="text-xs" onClick={() => onSetMapSize?.(selected.width, selected.height)} disabled={!onSetMapSize}>
                <Minimize2 className="h-3.5 w-3.5 mr-1" />Map = layer
              </Button>
              <Button size="sm" variant="secondary" className="text-xs" onClick={() => {
                const xs = mergedLayers.map((l) => l.x);
                const ys = mergedLayers.map((l) => l.y);
                const xe = mergedLayers.map((l) => l.x + l.width);
                const ye = mergedLayers.map((l) => l.y + l.height);
                const w = Math.max(...xe) - Math.min(0, ...xs);
                const h = Math.max(...ye) - Math.min(0, ...ys);
                onSetMapSize?.(Math.max(map.width, w), Math.max(map.height, h));
              }} disabled={!onSetMapSize}>
                <Maximize2 className="h-3.5 w-3.5 mr-1" />Expand
              </Button>
              <Button size="sm" variant="ghost" className="text-xs col-span-2" onClick={() => patch({ x: 0, y: 0, opacity: 1 })}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />Reset position
              </Button>
            </div>
          </div>
        )}
      </ScrollArea>
      <ExportChecklistDialog
        open={checklist.open}
        onOpenChange={checklist.setOpen}
        title={checklist.state.title}
        description={checklist.state.description}
        files={checklist.state.files}
        steps={checklist.state.steps}
      />
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 text-xs"
      />
    </div>
  );
}

function yamlString(s: string): string {
  if (/^[a-zA-Z0-9_./:#-]+$/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}
