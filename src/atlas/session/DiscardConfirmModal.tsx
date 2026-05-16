/**
 * The one forgiving confirm in the editor. Default focus is the safe action
 * ("Keep editing"). Confirming reverts to the last saved state.
 */
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function DiscardConfirmModal({ open, count, onConfirm, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-[min(92vw,420px)] rounded-lg border border-border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">Discard all {count} unsaved {count === 1 ? "change" : "changes"}?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This reverts everything back to your last saved state. This can&rsquo;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" autoFocus onClick={onClose}>Keep editing</Button>
          <Button size="sm" variant="destructive" onClick={() => { onConfirm(); onClose(); }}>
            Discard changes
          </Button>
        </div>
      </div>
    </div>
  );
}
