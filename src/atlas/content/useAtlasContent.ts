import { useEffect, useState } from "react";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject } from "@/atlas/content/schema";

/** Shared load for the simple reader pages (Browse, Timeline, Credits,
 *  Secrets): fetch the atlas once on mount, exposing project/error so the
 *  caller can render `<AtlasLoadState>` while neither is settled. */
export function useAtlasContent() {
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAtlasContent(true)
      .then(setProject)
      .catch((e: Error) => setError(e.message));
  }, []);

  return { project, error };
}
