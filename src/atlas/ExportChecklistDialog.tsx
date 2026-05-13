import { useState } from "react";
import { ClipboardCheck, Download, FileCode, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChecklistItem {
  label: string;
  detail?: string;
}

interface ExportChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  files: string[];
  steps: ChecklistItem[];
}

export function ExportChecklistDialog({
  open,
  onOpenChange,
  title,
  description,
  files,
  steps,
}: ExportChecklistDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const allChecked = checked.size === steps.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {files.length > 0 && (
          <div className="rounded-md bg-muted p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Files generated
            </div>
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="text-xs font-mono flex items-center gap-1.5">
                  <Download className="h-3 w-3 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Commit checklist
          </div>
          <div className="space-y-1">
            {steps.map((step, i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`w-full text-left flex items-start gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors ${
                  checked.has(i)
                    ? "bg-primary/10 text-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-bold transition-colors ${
                    checked.has(i)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {checked.has(i) ? "✓" : i + 1}
                </span>
                <span>
                  <span className="font-medium">{step.label}</span>
                  {step.detail && (
                    <span className="block text-[10px] opacity-80 mt-0.5">
                      {step.detail}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {allChecked && (
          <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-400">
            All steps checked. Push to main and the GitHub Action will publish automatically.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience hook for controlling the checklist dialog. */
export function useExportChecklist() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{
    title: string;
    description: string;
    files: string[];
    steps: ChecklistItem[];
  }>({ title: "", description: "", files: [], steps: [] });

  const show = (params: {
    title: string;
    description: string;
    files: string[];
    steps: ChecklistItem[];
  }) => {
    setState(params);
    setOpen(true);
  };

  return { open, setOpen, show, state };
}
