import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { useSoundSettings } from "@/atlas/sound/SoundSettingsProvider";
import { useCalmMode, useReduceMotion } from "@/hooks/use-reduce-motion";

/**
 * How long the welcome invite ("Tap to bring the world to life") shows in
 * full before it folds down to its speaker button (Q-04), and how long its
 * text takes to fade first (no fade when motion is reduced). Pointer or
 * keyboard focus on the invite holds it open. Only the invite's look
 * changes: the speaker button turns sound on exactly as the full invite does.
 */
export const INVITE_VISIBLE_MS = 12_000;
export const INVITE_FADE_MS = 600;

type InvitePhase = "full" | "fading" | "folded";

/**
 * The sound invite pill. data-sound-invite tells the provider's gesture
 * listener to leave taps here to these buttons, so Dismiss stays silent.
 */
function SoundInvite({
  label,
  onEnable,
  onDismiss,
  fading = false,
  onHold,
  rootRef,
}: {
  label: string;
  onEnable: () => void;
  onDismiss: () => void;
  /** The text and ✕ are fading out before the invite folds (Q-04). */
  fading?: boolean;
  /**
   * Pointer over it or focus inside it (true), or neither (false). The two are
   * tracked apart, so a pointer leaving doesn't release a keyboard user's hold.
   * Unmounting releases it, so a remounted invite starts unheld.
   */
  onHold?: (held: boolean) => void;
  rootRef?: Ref<HTMLDivElement>;
}) {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const held = hovered || focusWithin;
  useEffect(() => {
    if (!onHold) return;
    onHold(held);
    return () => onHold(false);
  }, [onHold, held]);
  const fade = `transition-opacity${fading ? " opacity-0" : ""}`;
  const fadeStyle = { transitionDuration: `${INVITE_FADE_MS}ms` };
  return (
    <div
      ref={rootRef}
      data-sound-invite
      className="atlas-notice flex items-center gap-1 rounded-full border border-border bg-card/95 pl-3 pr-1 shadow-md"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      {/* h-10: a 40px tap target on a phone (was the 20px line of text). */}
      <button
        type="button"
        onClick={onEnable}
        className="flex h-10 items-center gap-2 whitespace-nowrap text-sm"
      >
        <span aria-hidden>🔊</span>
        <span className={fade} style={fadeStyle}>
          {label}
        </span>
      </button>
      {/* Was a bare ✕ glyph measuring 13x24 on a phone. Sized to match the
          mute button, which is already 40x40. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground ${fade}`}
        style={fadeStyle}
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}

interface SoundControlProps {
  hasSoundscape?: boolean;
}

export function SoundControl({ hasSoundscape = true }: SoundControlProps) {
  const {
    soundEnabled,
    audioUnlocked,
    resumeDismissed,
    dismissResume,
    muted,
    volume,
    enableSound,
    setMuted,
    setVolume,
    ambiencePlaying,
    audioAvailable,
  } = useSoundSettings();
  const calmMode = useCalmMode();
  const reduceMotion = useReduceMotion();
  const [dismissed, setDismissed] = useState(false);
  const [invitePhase, setInvitePhase] = useState<InvitePhase>("full");
  const [inviteHeld, setInviteHeld] = useState(false);
  const inviteRoot = useRef<HTMLDivElement>(null);
  const focusSpeaker = useRef(false);
  const welcomeShown = hasSoundscape && audioAvailable && !soundEnabled && !dismissed;

  // The welcome invite folds to its speaker button after a while (Q-04). A
  // timer on the invite's look only; nothing here touches sound.
  useEffect(() => {
    if (!welcomeShown || inviteHeld || invitePhase === "folded") return;
    const fold = () => {
      // Focus is held open, so this shouldn't happen; if it does, don't drop
      // focus to the page: hand it to the speaker button.
      focusSpeaker.current = !!inviteRoot.current?.contains(document.activeElement);
      setInvitePhase("folded");
    };
    const t =
      invitePhase === "full"
        ? setTimeout(() => (reduceMotion ? fold() : setInvitePhase("fading")), INVITE_VISIBLE_MS)
        : setTimeout(fold, INVITE_FADE_MS);
    return () => clearTimeout(t);
  }, [welcomeShown, inviteHeld, invitePhase, reduceMotion]);

  const holdInvite = useCallback((held: boolean) => {
    setInviteHeld(held);
    // Caught mid-fade: show the text again; the wait starts over on leaving.
    if (held) setInvitePhase((p) => (p === "fading" ? "full" : p));
  }, []);
  const speakerRef = useCallback((el: HTMLButtonElement | null) => {
    if (el && focusSpeaker.current) {
      focusSpeaker.current = false;
      el.focus();
    }
  }, []);

  // Sound is on (saved from an earlier visit, or the browser kept the context
  // suspended) but audio isn't running yet: the first tap or key press
  // anywhere unlocks it, and the invite stays until then.
  const awaitingGesture = soundEnabled && !audioUnlocked;
  const ambienceActive = soundEnabled && audioUnlocked && ambiencePlaying && !muted && !calmMode;

  return (
    // Placed by the map's notice dock (MapNoticeDock), not pinned to a corner:
    // the corner is the minimap's.
    <div data-sound-control className="flex flex-wrap items-center justify-end gap-2">
      <span role="status" aria-live="polite" className="sr-only">
        {ambienceActive ? "Ambience playing" : ""}
      </span>
      {hasSoundscape && audioAvailable && awaitingGesture && !resumeDismissed && (
        <SoundInvite label="Tap to resume sound" onEnable={enableSound} onDismiss={dismissResume} />
      )}

      {welcomeShown && invitePhase !== "folded" && (
        <SoundInvite
          label="Tap to bring the world to life"
          onEnable={enableSound}
          onDismiss={() => setDismissed(true)}
          fading={invitePhase === "fading"}
          onHold={holdInvite}
          rootRef={inviteRoot}
        />
      )}

      {welcomeShown && invitePhase === "folded" && (
        <div data-sound-invite>
          <button
            ref={speakerRef}
            type="button"
            aria-label="Turn on sound"
            title="Tap to bring the world to life"
            onClick={enableSound}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/95 shadow-md"
          >
            <span aria-hidden>🔊</span>
          </button>
        </div>
      )}

      {hasSoundscape && audioAvailable && soundEnabled && audioUnlocked && (
        <>
          {ambienceActive && (
            <span className="atlas-notice rounded-full border border-border bg-card px-3 py-2 text-xs shadow-sm text-muted-foreground">
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
    </div>
  );
}
