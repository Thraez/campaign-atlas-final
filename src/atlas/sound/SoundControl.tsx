import { useState } from "react";
import { useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";

interface SoundControlProps {
  hasSoundscape?: boolean;
}

export function SoundControl({ hasSoundscape = true }: SoundControlProps) {
  const {
    soundEnabled,
    muted,
    calmMode,
    volume,
    enableSound,
    setMuted,
    setCalmMode,
    setVolume,
    ambiencePlaying,
    audioAvailable,
  } = useSoundSettings();
  const [dismissed, setDismissed] = useState(false);

  const ambienceActive = soundEnabled && ambiencePlaying && !muted && !calmMode;

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2">
      <span role="status" aria-live="polite" className="sr-only">
        {ambienceActive ? "Ambience playing" : ""}
      </span>
      {hasSoundscape && audioAvailable && !soundEnabled && !dismissed && (
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
          <button type="button" onClick={enableSound} className="flex items-center gap-2 text-sm">
            <span aria-hidden>🔊</span>
            Tap to bring the world to life
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {hasSoundscape && audioAvailable && soundEnabled && (
        <>
          {ambienceActive && (
            <span className="rounded-full border border-border bg-card px-3 py-2 text-xs shadow-sm text-muted-foreground">
              <span aria-hidden="true">♪</span> Ambience playing
            </span>
          )}
          <button
            type="button"
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            onClick={() => setMuted(!muted)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm"
          >
            <span aria-hidden>{muted ? "🔈" : "🔊"}</span>
          </button>
          <div className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="w-20"
            />
          </div>
        </>
      )}

      <button
        type="button"
        aria-pressed={calmMode}
        onClick={() => setCalmMode(!calmMode)}
        className="rounded-full border border-border bg-card px-3 py-2 text-xs shadow-sm"
      >
        Calm mode {calmMode ? "on" : "off"}
      </button>
    </div>
  );
}
