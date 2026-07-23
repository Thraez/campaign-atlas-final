import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AudioEngine, type AudioDeps } from "@/atlas/sound/AudioEngine";
import { realAudioDeps } from "@/atlas/sound/realAudioDeps";
import {
  DEFAULT_PREFS,
  loadSoundPrefs,
  saveSoundPrefs,
  type SoundPrefs,
} from "@/atlas/sound/soundPrefs";

interface SoundSettings extends SoundPrefs {
  engine: AudioEngine;
  enableSound: () => void;
  setMuted: (m: boolean) => void;
  setCalmMode: (c: boolean) => void;
  setVolume: (v: number) => void;
  setMapMasterGain: (g: number) => void;
}

const Ctx = createContext<SoundSettings | null>(null);

export function useSoundSettings(): SoundSettings {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSoundSettings must be used within SoundSettingsProvider");
  return v;
}

export function SoundSettingsProvider({
  children,
  deps = realAudioDeps,
}: {
  children: React.ReactNode;
  deps?: AudioDeps;
}) {
  const [prefs, setPrefs] = useState<SoundPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_PREFS : loadSoundPrefs(),
  );
  // deps is a constant (realAudioDeps or a test stub) — stable across renders.
  const [engine] = useState(() => new AudioEngine(deps));
  // mapMasterGain is reported by SoundscapeLayer and is not persisted.
  const [mapMasterGain, setMapMasterGain] = useState(0.6);

  const update = useCallback((patch: Partial<SoundPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveSoundPrefs(next);
      return next;
    });
  }, []);

  // Reflect calm mode onto <html> for the ocean CSS hook.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.calmMode) root.setAttribute("data-calm", "true");
    else root.removeAttribute("data-calm");
  }, [prefs.calmMode]);

  // Mirror mute/calm into the engine.
  useEffect(() => {
    engine.setMuted(prefs.muted || prefs.calmMode);
  }, [engine, prefs.muted, prefs.calmMode]);

  // Push combined effective master gain = playerVolume × mapMasterGain.
  useEffect(() => {
    engine.setMasterGain(prefs.volume * mapMasterGain);
  }, [engine, prefs.volume, mapMasterGain]);

  // iOS: resume on return to foreground; suspend on hide for battery.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void engine.resume();
      else void engine.suspend();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [engine]);

  const enableSound = useCallback(() => {
    void engine.unlock();
    update({ soundEnabled: true });
  }, [engine, update]);

  const value = useMemo<SoundSettings>(
    () => ({
      ...prefs,
      engine,
      enableSound,
      setMuted: (m) => update({ muted: m }),
      setCalmMode: (c) => update({ calmMode: c }),
      setVolume: (v) => update({ volume: Math.min(1, Math.max(0, v)) }),
      setMapMasterGain,
    }),
    [prefs, engine, enableSound, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
