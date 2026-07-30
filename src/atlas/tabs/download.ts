/** Shared download helper for tab exports. */
import { toast } from "sonner";

/** Trigger a browser download of a Blob. Appends the anchor to the DOM before
 *  clicking (Firefox requires this for the click to register) and removes it
 *  after. Pass `opts.toast` to show a "Downloaded <filename>" success toast. */
export function downloadBlob(filename: string, blob: Blob, opts?: { toast?: boolean }) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  if (opts?.toast) toast.success(`Downloaded ${filename}`);
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(filename, blob, { toast: true });
}
