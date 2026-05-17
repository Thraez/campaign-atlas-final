import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ViewMode = "player" | "dm";
export const VIEW_MODE_STORAGE_KEY = "atlas.viewMode";

interface Ctx {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
}
const ViewModeContext = createContext<Ctx | null>(null);

function readInitial(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return v === "player" ? "player" : "dm";
  } catch {
    return "dm";
  }
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>(readInitial);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  const setMode = useCallback((m: ViewMode) => setModeState(m), []);
  return (
    <ViewModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode(): Ctx {
  const c = useContext(ViewModeContext);
  if (!c) throw new Error("useViewMode must be used within ViewModeProvider");
  return c;
}
