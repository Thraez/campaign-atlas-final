const STORAGE_KEY = "atlas-player-sound-v1";

export interface SoundPrefs {
  soundEnabled: boolean;
  muted: boolean;
  calmMode: boolean;
}

export const DEFAULT_PREFS: SoundPrefs = { soundEnabled: false, muted: false, calmMode: false };

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__atlas_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSoundPrefs(): SoundPrefs {
  const s = getStorage();
  if (!s) return { ...DEFAULT_PREFS };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return { ...DEFAULT_PREFS };
    return {
      soundEnabled: typeof p.soundEnabled === "boolean" ? p.soundEnabled : DEFAULT_PREFS.soundEnabled,
      muted: typeof p.muted === "boolean" ? p.muted : DEFAULT_PREFS.muted,
      calmMode: typeof p.calmMode === "boolean" ? p.calmMode : DEFAULT_PREFS.calmMode,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveSoundPrefs(prefs: SoundPrefs): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota/sandbox — drop silently; the viewer keeps working.
  }
}

export function _resetSoundPrefsForTests(): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
