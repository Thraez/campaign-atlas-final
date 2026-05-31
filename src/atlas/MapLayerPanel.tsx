import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Link as LinkIcon, Trash2, Maximize2, Minimize2, Crosshair, RotateCcw, Lock, Unlock, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Eraser, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { MapDocument, MapLayer } from "@/atlas/content/schema";
import type { LocalLayer } from "@/atlas/useMapLayers";
import { normalizeAtlasAssetUrl } from "./url";
import { centerAnchoredResize } from "./layerGeometry";

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
  // Phase 1B: editor-owned drag/resize state. When undefined, the panel
  // falls back to an internal lockAspect toggle (legacy behavior).
  editGeometry?: boolean;
  setEditGeometry?: (v: boolean) => void;
  lockAspect?: boolean;
  setLockAspect?: (v: boolean) => void;
}

const NUDGE_STEPS = [100, 1000, 10000];
const SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

/**
 * Produce a human-friendly display name for a layer.
 *
 * The MapLayer schema has no `name` field on its own, so historically the
 * layer list showed the raw id (e.g. `upload-1778790358938-0-chatgpt-image-may-4-2026`).
 * That made imported maps look like nothing the DM had typed. This helper
 * prefers, in order:
 *   1. A user-typed name on the LocalLayer override.
 *   2. The original filename captured at upload time.
 *   3. The basename of the layer's `src`, with separators turned into spaces.
 * Falls back to the layer id only if everything else is missing.
 */
function layerDisplayName(layer: MapLayer, local?: { name?: string; filename?: string }): string {
  if (local?.name && local.name.trim()) return local.name.trim();
  if (local?.filename && local.filename.trim()) return stripExt(local.filename.trim());
  const fromSrc = stripExt(basename(layer.src));
  return fromSrc || layer.id;
}

function basename(p: string): string {
  return p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}

function stripExt(name: string): string {
  return name.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[-_]+/g, " ").trim();
}

export function MapLayerPanel(props: Props) {
  const { map, mergedLayers, localLayers, selectedId, setSelectedId, onAddFiles, onAddUrl, onEditBuiltin, onUpdate, onDuplicate, onRemove, onClearAll, onSetMapSize } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  // When the editor passes lockAspect/setLockAspect, mirror them; otherwise
  // keep local state (legacy code paths that don't wire the props yet).
  const [lockAspectInternal, setLockAspectInternal] = useState(true);
  const lockAspect = props.lockAspect ?? lockAspectInternal;
  const setLockAspect = props.setLockAspect ?? setLockAspectInternal;
  const editGeometry = props.editGeometry ?? false;
  const setEditGeometry = props.setEditGeometry;
  const [locked, setLocked] = useState(false);

  const selected = mergedLayers.find((l) => l.id === selectedId) ?? null;
  const localSelected = localLayers.find((l) => l.id === selectedId) ?? null;
  const isBuiltinReadOnly = !!selected && !localSelected;

  const aspect = selected ? (selected.height === 0 ? 1 : selected.width / selected.height) : 1;

  const ensureEditable = (id: string) => {
    if (!localLayers.find((l) => l.id === id)) {
      onEditBuiltin(id);
      toast.info("Editing built-in layer locally — click Save to commit.");
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

  /**
   * Phase 1B B3: center-anchored resize. Recomputes X/Y so the layer's
   * geometric center stays fixed across the size change — preset buttons
   * (50/75/100/.../Fit) no longer drift the layer toward the top-left.
   */
  const setSizeCenterAnchored = (w: number, h: number) => {
    if (!selected) return;
    patch(centerAnchoredResize(selected, w, h));
  };

  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    patch({ x: selected.x + dx, y: selected.y + dy });
  };

  const scale = (factor: number) => {
    if (!selected) return;
    const w = selected.width * factor;
    const h = lockAspect ? w / aspect : selected.height * factor;
    setSizeCenterAnchored(w, h);
  };

  const fitWidth = () => selected && setSizeCenterAnchored(map.width, lockAspect ? map.width / aspect : selected.height);
  const fitHeight = () => selected && setSizeCenterAnchored(lockAspect ? map.height * aspect : selected.width, map.height);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-sm truncate" title={map.name}>{map.name}</div>
            <div className="text-[10px] text-muted-foreground truncate" title={map.id}>
              id: <code>{map.id}</code>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground shrink-0">
            {map.width}×{map.height}
          </div>
        </div>
        {setEditGeometry && (
          <div className="space-y-1">
            <Button
              size="sm"
              variant={editGeometry ? "default" : "outline"}
              className="w-full gap-1.5 h-8 text-xs"
              onClick={() => setEditGeometry(!editGeometry)}
              title="When on, click a layer to select it, then drag the body or corner handles to reposition / resize. Hold Shift to lock aspect, Alt to scale from center. Esc cancels."
            >
              <Move className="h-3.5 w-3.5" /> Adjust map image {editGeometry ? "(on)" : "(off)"}
            </Button>
            <p className="text-[10px] text-muted-foreground">Off: click the map to place pins. On: drag/resize the map image.</p>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Edits here are <strong>local drafts</strong> until you click <strong>Save</strong> — Save writes the layers (and any uploaded images) to disk and rebuilds.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1 gap-1.5" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload images
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title="Clear local draft assets" aria-label="Clear local draft assets">
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
                  <img src={normalizeAtlasAssetUrl(l.src)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={layerDisplayName(l, local)}>{layerDisplayName(l, local)}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono" title={l.id}>{l.id}</div>
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
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDuplicate(selected.id)} title="Duplicate" aria-label="Duplicate layer">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setLocked((v) => !v)} title={locked ? "Unlock" : "Lock"} aria-label={locked ? "Unlock layer" : "Lock layer"}>
                  {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </Button>
                {localSelected && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onRemove(selected.id)} title="Remove" aria-label="Remove layer">
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
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(-step, 0)} aria-label={`Nudge layer left (±${step})`}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(step, 0)} aria-label={`Nudge layer right (±${step})`}><ChevronRight className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(0, -step)} aria-label={`Nudge layer up (±${step})`}><ChevronUp className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => nudge(0, step)} aria-label={`Nudge layer down (±${step})`}><ChevronDown className="h-3.5 w-3.5" /></Button>
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

