/**
 * Map Import Wizard.
 *
 * 6-step dialog (Select → Mode → Configure → Sizing → Preview → Export) that
 * generates a valid world.yaml map/layer patch + asset zip + apply README.
 * The only place in the app that drafts a new map; the editor's upload adds
 * layers to a map that exists. Zip images are stripped of metadata by the
 * same dev-server step as an editor upload (./mapImportZip.ts).
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
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShieldAlert,
  Package,
} from "lucide-react";
import { fileToDataUrl, readImageSize } from "@/atlas/content/browserFile";
import { downloadBlob } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { MapDocument } from "@/atlas/content/schema";
import {
  buildImportPlan,
  buildPatchFile,
  buildPlanYaml,
  buildReadme,
  defaultAssignment,
  MAP_IMPORT_ZIP_NAME,
  validateImportPlan,
  type ImportImage,
  type ImportMode,
} from "./mapImport";
import { buildMapImportZip, cleanAssetViaDevServer } from "./mapImportZip";
import { safeFilename } from "@/atlas/assets/mapLayerTarget";
import { SelectStep } from "./wizard-steps/SelectStep";
import { ModeStep } from "./wizard-steps/ModeStep";
import { ConfigureStep } from "./wizard-steps/ConfigureStep";
import { SizingStep } from "./wizard-steps/SizingStep";
import { PreviewStep } from "./wizard-steps/PreviewStep";
import { ExportStep } from "./wizard-steps/ExportStep";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentMap?: MapDocument;
  defaultWorldId?: string;
}

const ACCEPTED = ".png,.jpg,.jpeg,.webp,.svg";
const STEPS = ["Select", "Mode", "Configure", "Sizing", "Preview", "Export"] as const;

export function MapImportWizard({
  open,
  onOpenChange,
  currentMap,
  defaultWorldId = "default",
}: Props) {
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<ImportImage[]>([]);
  const [mode, setMode] = useState<ImportMode>("per-image");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(0);
    setImages([]);
    setMode("per-image");
  };

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      const next: ImportImage[] = [];
      for (const file of arr) {
        if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
          toast.warning(`Skipped "${file.name}" — unsupported extension`);
          continue;
        }
        try {
          const dataUrl = await fileToDataUrl(file);
          const dim = await readImageSize(dataUrl);
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
    },
    [mode, currentMap, defaultWorldId],
  );

  const removeImage = (id: string) => setImages((p) => p.filter((i) => i.id !== id));

  const updateAssignment = (id: string, patch: Partial<ImportImage["assignment"]>) =>
    setImages((p) =>
      p.map((img) =>
        img.id === id ? { ...img, assignment: { ...img.assignment, ...patch } } : img,
      ),
    );

  // Recompute defaults when mode changes (only the createNewMap flag flips).
  const onModeChange = (m: ImportMode) => {
    setMode(m);
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        assignment: defaultAssignment(img.originalFilename, m, currentMap, defaultWorldId),
      })),
    );
  };

  const plan = useMemo(
    () => buildImportPlan({ images, mode, currentMap, defaultWorldId }),
    [images, mode, currentMap, defaultWorldId],
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
    if (blocking.length) {
      toast.error("Fix blocking issues first.");
      return;
    }
    const assets = plan.assets.flatMap((a) => {
      const dataUrl = images.find((i) => i.id === a.sourceImageId)?.dataUrl;
      return dataUrl ? [{ targetPath: a.targetPath, dataUrl }] : [];
    });
    let built;
    try {
      // Each image gets the editor upload's metadata strip (eval-2026-10/48).
      built = await buildMapImportZip(
        { patch: buildPatchFile(plan), readme: buildReadme(plan, images) },
        assets,
        cleanAssetViaDevServer(),
      );
    } catch (e) {
      toast.error(`Couldn't build the package: ${(e as Error).message}`);
      return;
    }
    if (!built.ok) {
      toast.error(`${built.path}: ${built.detail}`);
      return;
    }
    const blob = await built.zip.generateAsync({ type: "blob" });
    downloadBlob(MAP_IMPORT_ZIP_NAME, blob, { toast: false });
    toast.success("Map import package downloaded.");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Import Maps
          </DialogTitle>
          <DialogDescription>
            YAML stays canon — this wizard generates a valid world.yaml patch + asset zip you commit
            to GitHub.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1 text-[11px]">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`px-2 py-0.5 rounded ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"}`}
              >
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
          {step === 1 && (
            <ModeStep mode={mode} onChange={onModeChange} hasCurrentMap={!!currentMap} />
          )}
          {step === 2 && (
            <ConfigureStep images={images} updateAssignment={updateAssignment} mode={mode} />
          )}
          {step === 3 && (
            <SizingStep
              images={images}
              updateAssignment={updateAssignment}
              hasCurrentMap={!!currentMap}
            />
          )}
          {step === 4 && (
            <PreviewStep
              plan={plan}
              yamlPreview={yamlPreview}
              blocking={blocking}
              warnings={warnings}
            />
          )}
          {step === 5 && (
            <ExportStep
              onDownload={downloadAll}
              blocking={blocking.length}
              planSummary={`${plan.maps.length} map(s), ${plan.assets.length} asset(s)`}
            />
          )}
        </ScrollArea>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {blocking.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                {blocking.length} blocking
              </Badge>
            )}
            {warnings.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {warnings.length} warning
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={downloadAll}
                disabled={blocking.length > 0}
                className="gap-1"
              >
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
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
