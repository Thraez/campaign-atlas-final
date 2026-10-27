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
import { readPrefersReducedMotion } from "@/atlas/sound/prefersReducedMotion";

interface SoundSettings extends SoundPrefs {
  engine: AudioEngine;
  enableSound: () => void;
  setMuted: (m: boolean) => void;
  setCalmMode: (c: boolean) => void;
  setVolume: (v: number) => void;
  setMapMasterGain: (g: number) => void;
  /**
   * True once the AudioContext exists. A saved soundEnabled survives a reload
   * but the browser only lets audio start from a user gesture, so after a
   * reload this stays false until the first tap or key press anywhere.
   */
  audioUnlocked: boolean;
  /** True only while a bed is actually playing (reported by SoundscapeLayer). */
  ambiencePlaying: boolean;
  setAmbiencePlaying: (v: boolean) => void;
  /** False when the Web Audio API is unavailable in this environment. */
  audioAvailable: boolean;
  /** True when the OS reports prefers-reduced-motion: reduce. Audio is unaffected. */
  motionReduced: boolean;
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
  motionReduced = readPrefersReducedMotion(),
}: {
  children: React.ReactNode;
  deps?: AudioDeps;
  /** Injected in tests to simulate environments without Web Audio. */
  audioAvailable?: boolean;
  /** Injected in tests to simulate a reduced-motion OS preference. */
  motionReduced?: boolean;
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const update = useCallback((patch: Partial<SoundPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveSoundPrefs(next);
      return next;
    });
  }, []);

  // Reflect calm mode or system reduced-motion onto <html> for the ocean CSS hook.
  // Audio muting is driven only by prefs.muted || prefs.calmMode — never by motionReduced.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.calmMode || motionReduced) root.setAttribute("data-calm", "true");
    else root.removeAttribute("data-calm");
  }, [prefs.calmMode, motionReduced]);

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

  // Must run inside a user-gesture handler so the browser lets audio start.
  const unlockAudio = useCallback(() => {
    const unlocking = engine.unlock();
    // unlock() creates the AudioContext synchronously, before its first await.
    setAudioUnlocked(engine.unlocked);
    unlocking.catch(() => {
      // Web Audio failed to initialise (e.g. browser policy or missing API).
      // Roll soundEnabled back to false.
      update({ soundEnabled: false });
    });
  }, [engine, update]);

  const enableSound = useCallback(() => {
    unlockAudio();
    update({ soundEnabled: true });
  }, [unlockAudio, update]);

  // Sound was saved on before a reload: unlock on the first tap or key press
  // anywhere on the page. Capture phase, so map handlers can't swallow it.
  useEffect(() => {
    if (!prefs.soundEnabled || audioUnlocked || !audioAvailable) return;
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      unlockAudio();
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
  }, [prefs.soundEnabled, audioUnlocked, audioAvailable, unlockAudio]);

  const value = useMemo<SoundSettings>(
    () => ({
      ...prefs,
      engine,
      enableSound,
      setMuted: (m) => update({ muted: m }),
      setCalmMode: (c) => update({ calmMode: c }),
      setVolume: (v) => update({ volume: Math.min(1, Math.max(0, v)) }),
      setMapMasterGain,
      audioUnlocked,
      ambiencePlaying,
      setAmbiencePlaying,
      audioAvailable,
      motionReduced,
    }),
    [
      prefs,
      engine,
      enableSound,
      update,
      audioUnlocked,
      ambiencePlaying,
      audioAvailable,
      motionReduced,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
