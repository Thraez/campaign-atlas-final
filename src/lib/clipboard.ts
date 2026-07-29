import { logger } from "@/lib/logger";

/**
 * Writes text to the clipboard, swallowing and logging any failure
 * (denied permission, insecure context, etc.) instead of throwing.
 * Callers decide how to surface the failure (toast, silent, etc.).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    logger.warn("Clipboard copy failed", e);
    return false;
  }
}
