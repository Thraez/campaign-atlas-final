import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject } from "@/atlas/content/schema";

/**
 * Save-conflict detector: polls atlas.json every 30s while the editor is
 * mounted. If `publishedAt` has changed since load, a rebuild happened
 * externally (Obsidian + `npm run atlas:build`, another save plugin
 * invocation, etc.). Surfaces a toast so the DM can `Reload canon` before
 * their next save overwrites someone else's edits.
 */
export function useExternalRebuildDetector(
  project: AtlasProject | null,
  setProject: Dispatch<SetStateAction<AtlasProject | null>>,
) {
  const [externalRebuildAt, setExternalRebuildAt] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    const loadedAt = project.publishedAt;
    let timer: number | undefined;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const fresh = await loadAtlasContent(true);
        if (cancelled) return;
        if (
          fresh.publishedAt &&
          fresh.publishedAt !== loadedAt &&
          fresh.publishedAt !== externalRebuildAt
        ) {
          setExternalRebuildAt(fresh.publishedAt);
          toast.warning("Canon rebuilt externally", {
            description:
              "Atlas was regenerated since you opened the editor. Reload to see the new canon before saving.",
            duration: 8000,
          });
        }
      } catch (err) {
        logger.debug("[editor] background atlas refresh failed; retrying next tick", err);
      }
      timer = window.setTimeout(tick, 30_000);
    };
    timer = window.setTimeout(tick, 30_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // Re-arm only on initial project load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.publishedAt]);

  const reloadCanon = useCallback(async () => {
    try {
      const fresh = await loadAtlasContent(true);
      setProject(fresh);
      setExternalRebuildAt(null);
      toast.success("Canon reloaded from disk");
    } catch (e) {
      toast.error(`Reload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setProject]);

  return { externalRebuildAt, reloadCanon };
}
