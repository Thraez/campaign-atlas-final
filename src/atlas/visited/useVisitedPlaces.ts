import { useCallback, useState } from "react";
import { loadVisited, markVisited } from "./visitedPlaces";

export interface VisitedApi {
  visited: Set<string>;
  mark: (entityId: string) => void;
}

/** Reactive wrapper over the visited-places store. Reads once on mount. */
export function useVisitedPlaces(): VisitedApi {
  const [visited, setVisited] = useState<Set<string>>(() => loadVisited());
  const mark = useCallback((entityId: string) => {
    if (!entityId) return;
    markVisited(entityId);
    setVisited((prev) => {
      if (prev.has(entityId)) return prev;
      const next = new Set(prev);
      next.add(entityId);
      return next;
    });
  }, []);
  return { visited, mark };
}
