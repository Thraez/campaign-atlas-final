/**
 * Map Import Wizard.
 *
 * 6-step dialog (Select → Mode → Configure → Sizing → Preview → Export) that
 * generates a valid world.yaml map/layer patch + asset zip + apply README.
 *
 * Storage rules:
 *   - YAML remains the canon storage format.
 *   - The DM never types YAML in this wizard — every field maps to the YAML
 *     via the pure helpers in ./mapImport.ts.
 *   - Validation runs on every step; the Export step refuses to download if
 *     any blocking issue is open.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Upload, Image as ImageIcon, X, ChevronLeft, ChevronRight, AlertTriangle, ShieldAlert, FileCode, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { MapDocument } from "@/atlas/content/schema";
import {
  buildImportPlan,
  buildPatchFile,
  buildPlanYaml,
  buildReadme,
  defaultAssignment,
  idFromFilename,
  safeFilename,
  validateImportPlan,
  type ImportImage,
  type ImportMode,
  type SizingMode,
} from "./mapImport";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentMap?: MapDocument;
  defaultWorldId?: string;
}

const ACCEPTED = ".png,.jpg,.jpeg,.webp,.svg";
const STEPS = ["Select", "Mode", "Configure", "Sizing", "Preview", "Export"] as const;

export function MapImportWizard({ open, onOpenChange, currentMap, defaultWorldId = "default" }: Props) {
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<ImportImage[]>([]);
  const [mode, setMode] = useState<ImportMode>("per-image");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep(0); setImages([]); setMode("per-image"); };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const next: ImportImage[] = [];
    for (const file of arr) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
        toast.warning(`Skipped "${file.name}" — unsupported extension`);
        continue;
      }
      try {
        const dataUrl = await readDataUrl(file);
        const dim = await readImageDimensions(dataUrl);
        const safe = safeFilename(file.name);
        next.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          filename: safe,
          originalFilename: file.name,
          mime: file.type || "image/*",
          bytes: file.size,
          naturalWidth: dim.w,
          naturalHeight: dim.h,
          dataUrl,
          assignment: defaultAssignment(file.name, mode, currentMap, defaultWorldId),
        });
      } catch (e) {
        toast.error(`Failed to read "${file.name}": ${(e as Error).message}`);
      }
    }
    setImages((prev) => [...prev, ...next]);
  }, [mode, currentMap, defaultWorldId]);

  const removeImage = (id: string) => setImages((p) => p.filter((i) => i.id !== id));

  const updateAssignment = (id: string, patch: Partial<ImportImage["assignment"]>) =>
    setImages((p) => p.map((img) => (img.id === id ? { ...img, assignment: { ...img.assignment, ...patch } } : img)));

  // Recompute defaults when mode changes (only the createNewMap flag flips).
  const onModeChange = (m: ImportMode) => {
    setMode(m);
    setImages((prev) => prev.map((img) => ({
      ...img,
      assignment: defaultAssignment(img.originalFilename, m, currentMap, defaultWorldId),
    })));
  };

  const plan = useMemo(
    () => buildImportPlan({ images, mode, currentMap, defaultWorldId }),
    [images, mode, currentMap, defaultWorldId]
  );
  const issues = useMemo(() => validateImportPlan(plan, images), [plan, images]);
  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const yamlPreview = useMemo(() => buildPlanYaml(plan), [plan]);

  const canNext = (() => {
    if (step === 0) return images.length > 0;
    if (step === 4) return blocking.length === 0;
    return true;
  })();

  const downloadAll = async () => {
    if (blocking.length) { toast.error("Fix blocking issues first."); return; }
    const zip = new JSZip();
    const patch = buildPatchFile(plan);
    const readme = buildReadme(plan, images);
    zip.file("world-map-patch.yaml", patch);
    zip.file("README-apply-map-import.md", readme);
    for (const a of plan.assets) {
      const img = images.find((i) => i.id === a.sourceImageId);
      if (!img?.dataUrl) continue;
      const m = img.dataUrl.match(/^data:[^;]+;base64,(.*)$/);
      if (m) zip.file(a.targetPath, m[1], { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    triggerBlob("atlas-map-import.zip", blob);
    toast.success("Map import package downloaded.");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Import Maps
          </DialogTitle>
          <DialogDescription>
            YAML stays canon — this wizard generates a valid world.yaml patch + asset zip you commit to GitHub.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1 text-[11px]">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`px-2 py-0.5 rounded ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"}`}>
                {i + 1}. {s}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <ScrollArea className="flex-1 pr-2">
          {step === 0 && (
            <SelectStep
              images={images}
              onPick={() => fileInputRef.current?.click()}
              onDrop={addFiles}
              onRemove={removeImage}
            />
          )}
          {step === 1 && <ModeStep mode={mode} onChange={onModeChange} hasCurrentMap={!!currentMap} />}
          {step === 2 && (
            <ConfigureStep images={images} updateAssignment={updateAssignment} mode={mode} />
          )}
          {step === 3 && (
            <SizingStep images={images} updateAssignment={updateAssignment} hasCurrentMap={!!currentMap} />
          )}
          {step === 4 && (
            <PreviewStep plan={plan} yamlPreview={yamlPreview} blocking={blocking} warnings={warnings} />
          )}
          {step === 5 && (
            <ExportStep onDownload={downloadAll} blocking={blocking.length} planSummary={`${plan.maps.length} map(s), ${plan.assets.length} asset(s)`} />
          )}
        </ScrollArea>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {blocking.length > 0 && <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />{blocking.length} blocking</Badge>}
            {warnings.length > 0 && <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" />{warnings.length} warning</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" variant="default" onClick={downloadAll} disabled={blocking.length > 0} className="gap-1">
                <Package className="h-4 w-4" /> Download package
              </Button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Step components --------------------------------------------------

function SelectStep({ images, onPick, onDrop, onRemove }: {
  images: ImportImage[];
  onPick: () => void;
  onDrop: (files: FileList) => void;
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="space-y-3 p-1">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) onDrop(e.dataTransfer.files); }}
        onClick={onPick}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm font-medium">Drop map images here or click to browse</div>
        <div className="text-[11px] text-muted-foreground mt-1">PNG, JPG, WEBP, SVG · multiple files OK</div>
      </div>
      {images.map((img) => (
        <div key={img.id} className="flex items-center gap-3 rounded-md border border-border p-2 bg-card/50">
          <img src={img.dataUrl} alt={img.originalFilename} className="h-12 w-12 object-cover rounded bg-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{img.originalFilename}</div>
            <div className="text-[10px] text-muted-foreground">
              {img.naturalWidth}×{img.naturalHeight} · {(img.bytes / 1024).toFixed(0)} KB
              {img.bytes > 4 * 1024 * 1024 && <span className="text-amber-500 ml-1">large</span>}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onRemove(img.id)}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      {images.length === 0 && (
        <div className="text-xs text-muted-foreground italic text-center py-2 flex items-center gap-2 justify-center">
          <ImageIcon className="h-3.5 w-3.5" /> No images added yet.
        </div>
      )}
    </div>
  );
}

function ModeStep({ mode, onChange, hasCurrentMap }: { mode: ImportMode; onChange: (m: ImportMode) => void; hasCurrentMap: boolean }) {
  const opts: Array<{ id: ImportMode; label: string; desc: string; needsCurrent?: boolean }> = [
    { id: "layers", label: "Add as layers on current map", desc: "All images become extra layers on the active map.", needsCurrent: true },
    { id: "per-image", label: "One map per image", desc: "Each image creates its own map at its natural size." },
    { id: "world-plus-regional", label: "World map + regional maps", desc: "First image is the overview; the rest are regional maps." },
    { id: "variants", label: "Player + DM variants", desc: "Pair images by filename — second image becomes the DM-only layer.", needsCurrent: true },
    { id: "custom", label: "Advanced custom assignment", desc: "Configure each image's map/layer manually in the next step." },
  ];
  return (
    <div className="space-y-2 p-1">
      {opts.map((o) => {
        const disabled = o.needsCurrent && !hasCurrentMap;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => !disabled && onChange(o.id)}
            disabled={disabled}
            className={`w-full text-left rounded-md border p-3 transition ${
              mode === o.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
            {disabled && <div className="text-[10px] text-amber-500 mt-1">Requires an active map</div>}
          </button>
        );
      })}
    </div>
  );
}

function ConfigureStep({ images, updateAssignment, mode }: {
  images: ImportImage[];
  updateAssignment: (id: string, patch: Partial<ImportImage["assignment"]>) => void;
  mode: ImportMode;
}) {
  return (
    <div className="space-y-3 p-1">
      <p className="text-[11px] text-muted-foreground">Auto-generated from filenames. Edit anything that should differ from defaults.</p>
      {images.map((img) => (
        <div key={img.id} className="rounded-md border border-border p-3 bg-card/50 space-y-2">
          <div className="flex items-center gap-2">
            <img src={img.dataUrl} alt="" className="h-8 w-8 rounded object-cover bg-muted" />
            <div className="text-xs font-mono truncate flex-1">{img.originalFilename}</div>
          </div>
          {(img.assignment.createNewMap || mode === "custom") && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Map id">
                <Input value={img.assignment.mapId} onChange={(e) => updateAssignment(img.id, { mapId: idFromFilename(e.target.value) })} className="h-7 text-xs font-mono" />
              </Field>
              <Field label="Map name">
                <Input value={img.assignment.mapName} onChange={(e) => updateAssignment(img.id, { mapName: e.target.value })} className="h-7 text-xs" />
              </Field>
              <Field label="World id">
                <Input value={img.assignment.worldId} onChange={(e) => updateAssignment(img.id, { worldId: e.target.value })} className="h-7 text-xs font-mono" />
              </Field>
              {mode === "custom" && (
                <Field label="Create new map">
                  <Switch checked={img.assignment.createNewMap} onCheckedChange={(v) => updateAssignment(img.id, { createNewMap: v })} />
                </Field>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Layer id">
              <Input value={img.assignment.layerId} onChange={(e) => updateAssignment(img.id, { layerId: idFromFilename(e.target.value) })} className="h-7 text-xs font-mono" />
            </Field>
            <Field label="Target asset path">
              <Input value={img.assignment.targetAssetPath} onChange={(e) => updateAssignment(img.id, { targetAssetPath: e.target.value })} className="h-7 text-xs font-mono" />
            </Field>
            <Field label="Opacity (0-1)">
              <Input type="number" step="0.05" min="0" max="1" value={img.assignment.opacity}
                onChange={(e) => updateAssignment(img.id, { opacity: Number(e.target.value) })} className="h-7 text-xs" />
            </Field>
            <Field label="Z-index">
              <Input type="number" value={img.assignment.zIndex}
                onChange={(e) => updateAssignment(img.id, { zIndex: Number(e.target.value) })} className="h-7 text-xs" />
            </Field>
            {mode === "variants" && (
              <Field label="Variant">
                <Select value={img.assignment.variant ?? "player"} onValueChange={(v) => updateAssignment(img.id, { variant: v as "player" | "dm" })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player" className="text-xs">player</SelectItem>
                    <SelectItem value="dm" className="text-xs">dm</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SizingStep({ images, updateAssignment, hasCurrentMap }: {
  images: ImportImage[];
  updateAssignment: (id: string, patch: Partial<ImportImage["assignment"]>) => void;
  hasCurrentMap: boolean;
}) {
  const sizingOpts: Array<{ id: SizingMode; label: string; needsCurrent?: boolean }> = [
    { id: "natural", label: "Use natural image size as map size" },
    { id: "stretch-to-current", label: "Stretch to current map", needsCurrent: true },
    { id: "center-natural", label: "Center at natural size", needsCurrent: true },
    { id: "fit-within-current", label: "Fit within current map", needsCurrent: true },
    { id: "custom", label: "Custom width/height" },
  ];
  return (
    <div className="space-y-3 p-1">
      {images.map((img) => (
        <div key={img.id} className="rounded-md border border-border p-3 bg-card/50 space-y-2">
          <div className="text-xs font-mono truncate">{img.originalFilename} · {img.naturalWidth}×{img.naturalHeight}</div>
          <Field label="Sizing mode">
            <Select value={img.assignment.sizing} onValueChange={(v) => updateAssignment(img.id, { sizing: v as SizingMode })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sizingOpts.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs" disabled={o.needsCurrent && !hasCurrentMap}>
                    {o.label}{o.needsCurrent && !hasCurrentMap ? " (need current map)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {img.assignment.sizing === "custom" && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Width">
                <Input type="number" value={img.assignment.customWidth ?? img.naturalWidth}
                  onChange={(e) => updateAssignment(img.id, { customWidth: Number(e.target.value) })} className="h-7 text-xs" />
              </Field>
              <Field label="Height">
                <Input type="number" value={img.assignment.customHeight ?? img.naturalHeight}
                  onChange={(e) => updateAssignment(img.id, { customHeight: Number(e.target.value) })} className="h-7 text-xs" />
              </Field>
              <Field label="Keep aspect">
                <Switch checked={img.assignment.keepAspect} onCheckedChange={(v) => updateAssignment(img.id, { keepAspect: v })} />
              </Field>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PreviewStep({ plan, yamlPreview, blocking, warnings }: {
  plan: ReturnType<typeof buildImportPlan>;
  yamlPreview: string;
  blocking: { message: string }[];
  warnings: { message: string }[];
}) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="space-y-3 p-1">
      {plan.maps.map((m) => (
        <div key={m.id} className="rounded-md border border-border p-3 bg-card/50">
          <div className="text-sm font-medium flex items-center gap-2">
            {m.name} <Badge variant="outline" className="text-[9px] font-mono">{m.id}</Badge>
            {m.replaces && <Badge variant="secondary" className="text-[9px]">replaces existing</Badge>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {m.width}×{m.height} · world: {m.worldId} · {m.layers.length} layer(s)
          </div>
          <ul className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
            {m.layers.map((l) => (
              <li key={l.id}><span className="font-mono">{l.id}</span> → {l.src} ({l.width}×{l.height})</li>
            ))}
          </ul>
        </div>
      ))}
      {blocking.length > 0 && (
        <IssueList title="Blocking" items={blocking.map((i) => i.message)} variant="destructive" />
      )}
      {warnings.length > 0 && (
        <IssueList title="Warnings" items={warnings.map((i) => i.message)} variant="secondary" />
      )}
      <div>
        <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-[11px] text-muted-foreground hover:text-foreground">
          {showRaw ? "Hide" : "Show"} advanced YAML preview
        </button>
        {showRaw && (
          <pre className="mt-2 p-2 rounded bg-muted text-[10px] font-mono whitespace-pre-wrap max-h-80 overflow-auto">
            {yamlPreview}
          </pre>
        )}
      </div>
    </div>
  );
}

function ExportStep({ onDownload, blocking, planSummary }: { onDownload: () => void; blocking: number; planSummary: string }) {
  return (
    <div className="p-1 space-y-3">
      <div className="rounded-md border border-border p-4 bg-card/50">
        <div className="text-sm font-medium flex items-center gap-2">
          <FileCode className="h-4 w-4 text-primary" /> Package contents
        </div>
        <ul className="mt-2 text-xs space-y-1 text-muted-foreground">
          <li>• <span className="font-mono">world-map-patch.yaml</span> — paste/merge into <span className="font-mono">content/&lt;world&gt;/_atlas/world.yaml</span></li>
          <li>• <span className="font-mono">atlas-assets.zip</span> — image files at their target paths</li>
          <li>• <span className="font-mono">README-apply-map-import.md</span> — step-by-step apply guide</li>
        </ul>
        <div className="mt-3 text-[11px] text-muted-foreground">{planSummary}</div>
      </div>
      <Button onClick={onDownload} disabled={blocking > 0} className="w-full gap-1">
        <Package className="h-4 w-4" /> Download package
      </Button>
      {blocking > 0 && <p className="text-[11px] text-destructive">Resolve {blocking} blocking issue(s) in the Preview step first.</p>}
    </div>
  );
}

function IssueList({ title, items, variant }: { title: string; items: string[]; variant: "destructive" | "secondary" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title} ({items.length})</div>
      <ul className="space-y-1">
        {items.map((m, i) => (
          <li key={i} className="rounded-md border border-border bg-card/50 p-2 text-xs flex items-start gap-2">
            <Badge variant={variant} className="text-[9px] shrink-0">{title.toLowerCase()}</Badge>
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}

// ---------- Browser helpers --------------------------------------------------

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("could not decode image"));
    img.src = dataUrl;
  });
}

function triggerBlob(filename: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
