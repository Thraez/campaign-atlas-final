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
import { useCalmMode } from "@/hooks/use-reduce-motion";

interface SoundSettings extends SoundPrefs {
  engine: AudioEngine;
  enableSound: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  setMapMasterGain: (g: number) => void;
  /**
   * True once the AudioContext has reached "running". A saved soundEnabled
   * survives a reload, but the browser only lets audio start from a user
   * gesture, so after a reload this stays false until the first tap or key
   * press anywhere (or until a gesture the browser actually honours).
   */
  audioUnlocked: boolean;
  /** True after the player dismissed the resume invite: stay silent this visit. */
  resumeDismissed: boolean;
  dismissResume: () => void;
  /** True only while a bed is actually playing (reported by SoundscapeLayer). */
  ambiencePlaying: boolean;
  setAmbiencePlaying: (v: boolean) => void;
  /** False when the Web Audio API is unavailable in this environment. */
  audioAvailable: boolean;
}

/**
 * Events that count as user activation for every pointer type. pointerdown
 * only counts for a mouse; a touch activates at pointerup/touchend/click.
 */
const GESTURE_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

/** Escape and lone modifier keys don't grant user activation. */
const NON_ACTIVATING_KEYS = new Set([
  "Escape",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "Fn",
  "OS",
]);

function grantsActivation(e: KeyboardEvent): boolean {
  return !NON_ACTIVATING_KEYS.has(e.key);
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  // Calm mode is the site's reduce-motion switch (view settings); it also
  // silences audio. The OS reduced-motion setting never does.
  const calmMode = useCalmMode();

  const update = useCallback((patch: Partial<SoundPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveSoundPrefs(next);
      return next;
    });
  }, []);

  // Mirror mute/calm into the engine; suspend the AudioContext after the gain
  // ramp settles so the browser can reclaim CPU/battery while silent.
  useEffect(() => {
    const silenced = prefs.muted || calmMode;
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
  }, [engine, prefs.muted, calmMode]);

  // Push combined effective master gain = playerVolume × mapMasterGain.
  useEffect(() => {
    engine.setMasterGain(prefs.volume * mapMasterGain);
  }, [engine, prefs.volume, mapMasterGain]);

  // iOS: resume on return to foreground; suspend on hide for battery.
  // Skip resume while muted/calm — the mute effect owns the context in that case.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (!prefs.muted && !calmMode) void engine.resume();
      } else {
        void engine.suspend();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [engine, prefs.muted, calmMode]);

  // Explicit enable from the invite button. If Web Audio can't start at all,
  // roll soundEnabled back to false. If the context stays suspended, keep
  // soundEnabled on: audioUnlocked stays false, so the resume invite shows.
  const enableSound = useCallback(() => {
    update({ soundEnabled: true });
    engine
      .unlock()
      .then(setAudioUnlocked)
      .catch(() => {
        // Web Audio failed to initialise (e.g. browser policy or missing API).
        update({ soundEnabled: false });
      });
  }, [engine, update]);

  const dismissResume = useCallback(() => setResumeDismissed(true), []);

  // Sound was saved on before a reload: unlock on the first gesture anywhere
  // that the browser counts as user activation. Gestures on the sound invite
  // itself are left to its own buttons (Dismiss must stay silent). A gesture
  // that doesn't get the context running leaves the listener in place for the
  // next one, and never touches the saved preference.
  useEffect(() => {
    if (!prefs.soundEnabled || audioUnlocked || resumeDismissed || !audioAvailable) return;
    let alive = true;
    const onGesture = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-sound-invite]")) return;
      if (e instanceof KeyboardEvent && !grantsActivation(e)) return;
      engine
        .unlock()
        .then((running) => {
          if (alive && running) setAudioUnlocked(true);
        })
        .catch(() => {
          /* keep the saved "on"; the invite stays */
        });
    };
    for (const type of GESTURE_EVENTS) window.addEventListener(type, onGesture, true);
    return () => {
      alive = false;
      for (const type of GESTURE_EVENTS) window.removeEventListener(type, onGesture, true);
    };
  }, [prefs.soundEnabled, audioUnlocked, resumeDismissed, audioAvailable, engine]);

  const value = useMemo<SoundSettings>(
    () => ({
      ...prefs,
      engine,
      enableSound,
      setMuted: (m) => update({ muted: m }),
      setVolume: (v) => update({ volume: Math.min(1, Math.max(0, v)) }),
      setMapMasterGain,
      audioUnlocked,
      resumeDismissed,
      dismissResume,
      ambiencePlaying,
      setAmbiencePlaying,
      audioAvailable,
    }),
    [
      prefs,
      engine,
      enableSound,
      update,
      audioUnlocked,
      resumeDismissed,
      dismissResume,
      ambiencePlaying,
      audioAvailable,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
