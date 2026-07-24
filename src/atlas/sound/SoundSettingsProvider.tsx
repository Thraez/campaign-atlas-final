import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AudioEngine, type AudioDeps } from "@/atlas/sound/AudioEngine";
import { realAudioDeps } from "@/atlas/sound/realAudioDeps";
import {
  DEFAULT_PREFS,
  loadSoundPrefs,
  saveSoundPrefs,
  type SoundPrefs,
} from "@/atlas/sound/soundPrefs";
import { isWebAudioAvailable } from "@/atlas/sound/probeWebAudio";

interface SoundSettings extends SoundPrefs {
  engine: AudioEngine;
  enableSound: () => void;
  setMuted: (m: boolean) => void;
  setCalmMode: (c: boolean) => void;
  setVolume: (v: number) => void;
  setMapMasterGain: (g: number) => void;
  ambiencePlaying: boolean;
  setAmbiencePlaying: (v: boolean) => void;
  /** False when the Web Audio API is unavailable in this environment. */
  audioAvailable: boolean;
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
  audioAvailable = isWebAudioAvailable(),
}: {
  children: React.ReactNode;
  deps?: AudioDeps;
  /** Injected in tests to simulate environments without Web Audio. */
  audioAvailable?: boolean;
}) {
  const [prefs, setPrefs] = useState<SoundPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_PREFS : loadSoundPrefs(),
  );
  // deps is a constant (realAudioDeps or a test stub) — stable across renders.
  const [engine] = useState(() => new AudioEngine(deps));
  // mapMasterGain is reported by SoundscapeLayer and is not persisted.
  const [mapMasterGain, setMapMasterGain] = useState(0.6);
  // ambiencePlaying is reported by SoundscapeLayer when a bed is active.
  const [ambiencePlaying, setAmbiencePlaying] = useState(false);

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

  // Mirror mute/calm into the engine; suspend the AudioContext after the gain
  // ramp settles so the browser can reclaim CPU/battery while silent.
  useEffect(() => {
    const silenced = prefs.muted || prefs.calmMode;
    engine.setMuted(silenced);
    if (silenced) {
      // 0.2s ramp + 50ms headroom, then suspend.
      const t = setTimeout(() => void engine.suspend(), 250);
      return () => clearTimeout(t);
    } else {
      // Resume before sound can play again, but only if the page is visible
      // (the visibilitychange handler owns suspend/resume while hidden).
      if (document.visibilityState === "visible") void engine.resume();
      return undefined;
    }
  }, [engine, prefs.muted, prefs.calmMode]);

  // Push combined effective master gain = playerVolume × mapMasterGain.
  useEffect(() => {
    engine.setMasterGain(prefs.volume * mapMasterGain);
  }, [engine, prefs.volume, mapMasterGain]);

  // iOS: resume on return to foreground; suspend on hide for battery.
  // Skip resume while muted/calm — the mute effect owns the context in that case.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (!prefs.muted && !prefs.calmMode) void engine.resume();
      } else {
        void engine.suspend();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [engine, prefs.muted, prefs.calmMode]);

  const enableSound = useCallback(() => {
    engine.unlock().catch(() => {
      // Web Audio failed to initialise (e.g. browser policy or missing API).
      // Leave soundEnabled false so the invite stays hidden on the next render.
      update({ soundEnabled: false });
    });
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
      ambiencePlaying,
      setAmbiencePlaying,
      audioAvailable,
    }),
    [prefs, engine, enableSound, update, ambiencePlaying, audioAvailable],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
