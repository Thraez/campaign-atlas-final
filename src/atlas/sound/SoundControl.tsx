import { useState } from "react";
import { useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";

export function SoundControl() {
  const { soundEnabled, muted, calmMode, enableSound, setMuted, setCalmMode } = useSoundSettings();
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2">
      {!soundEnabled && !dismissed && (
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
          <button
            type="button"
            onClick={enableSound}
            className="flex items-center gap-2 text-sm"
          >
            <span aria-hidden>🔊</span>
            Tap to bring the world to life
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="text-muted-foreground">
            ✕
          </button>
        </div>
      )}

      {soundEnabled && (
        <button
          type="button"
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          onClick={() => setMuted(!muted)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm"
        >
          <span aria-hidden>{muted ? "🔈" : "🔊"}</span>
        </button>
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
