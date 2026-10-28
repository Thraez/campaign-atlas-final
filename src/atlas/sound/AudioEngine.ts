import type { PreparedArea } from "@/atlas/sound/resolveSoundscape";
import { normalizeAtlasAssetUrl } from "@/atlas/url";

export interface AudioDeps {
  createContext: () => AudioContext;
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  /** true if the browser can decode the given src extension (Ogg probe etc.). */
  canPlay: (src: string) => boolean;
}

/**
 * What crossfadeTo did:
 * - "playing": the bed is set up and the AudioContext is running.
 * - "paused": the bed is set up but the context is suspended (muted, or the
 *   tab is hidden); it plays as soon as the context resumes.
 * - "locked": no AudioContext yet (unlock() hasn't run); nothing happened.
 * - "silence": crossfaded to no bed.
 * - "failed": the bed could not be fetched or decoded.
 * - "superseded": a newer crossfade (to another bed, or to silence) was asked
 *   for while this one decoded; this one started nothing.
 */
export type CrossfadeResult = "playing" | "paused" | "locked" | "silence" | "failed" | "superseded";

const CROSSFADE_S = 1.0;
const BUFFER_CAP = 4;

interface ActiveBed {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const AUDIO_DIR_PREFIX = "atlas/assets/audio/";

/** Resolve a bed's URL with the same rule as images (`normalizeAtlasAssetUrl`):
 * a bare filename goes under the audio dir, then the site base path is
 * prefixed, so it resolves the same at `/atlas` and `/atlas/`. Remote URLs
 * pass through. */
function audioUrl(src: string): string {
  const path = src.replace(/^\/+/, "");
  const withDir =
    /^(https?:|data:|blob:)/i.test(src) || path.includes("/") ? src : `${AUDIO_DIR_PREFIX}${path}`;
  return normalizeAtlasAssetUrl(withDir);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private lru: string[] = [];
  private active: ActiveBed | null = null;
  private muted = false;
  private masterGain = 0.6;
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  /** Request counter: bumped by every crossfadeTo, so a call can tell it is stale. */
  private requests = 0;
  /** What the newest crossfadeTo asked for (a bed id, or null for silence). */
  private newestTarget: string | null = null;

  constructor(private deps: AudioDeps) {}

  /**
   * Must be called from a user-gesture handler. Idempotent. Resolves true
   * when the AudioContext is running afterwards; false when the browser kept
   * it suspended (the gesture didn't count). Rejects when Web Audio can't start.
   */
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterGain;
      this.master.connect(this.ctx.destination);
    }
    await this.resume();
    return this.running;
  }

  private get running(): boolean {
    return this.ctx?.state === "running";
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(
        muted ? 0 : this.masterGain,
        this.ctx.currentTime + 0.2,
      );
    }
  }

  setMasterGain(g: number): void {
    this.masterGain = Math.min(1, Math.max(0, g));
    if (!this.muted) this.setMuted(false);
  }

  private bedResult(): CrossfadeResult {
    return this.running ? "playing" : "paused";
  }

  /** Crossfade to the given area's bed, or to silence when area is null. */
  async crossfadeTo(area: PreparedArea | null): Promise<CrossfadeResult> {
    if (!this.ctx || !this.master) return "locked";
    const targetId = area?.id ?? null;
    const request = ++this.requests;
    this.newestTarget = targetId;
    if (this.active?.id === targetId) return this.active ? this.bedResult() : "silence";

    const out = this.active;
    this.active = null;
    if (out) this.fadeOutAndStop(out);

    if (!area) return "silence";

    const src =
      this.deps.canPlay(area.bed.src) || !area.bed.srcFallback
        ? area.bed.src
        : area.bed.srcFallback;
    const buffer = await this.loadBuffer(src);
    // Only the newest request may start a bed. A stale call to the same bed as
    // the newest one goes on: both share one decode, and whichever resumes
    // first starts the bed for both.
    if (request !== this.requests && this.newestTarget !== area.id) return "superseded";
    if (!buffer || !this.ctx || !this.master) return "failed";
    // A call to this same bed already started it while we decoded.
    // (TS narrowed this.active to null above; the await may have changed it.)
    const started = this.active as ActiveBed | null;
    if (started) return started.id === area.id ? this.bedResult() : "superseded";

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(gain);
    source.start();
    const peak = Math.min(1, area.bed.gain ?? 0.7);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peak, this.ctx.currentTime + CROSSFADE_S);
    this.active = { id: area.id, source, gain };
    return this.bedResult();
  }

  private fadeOutAndStop(bed: ActiveBed): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
    try {
      bed.source.stop(t + CROSSFADE_S + 0.05);
    } catch {
      /* already stopped */
    }
    setTimeout(
      () => {
        try {
          bed.source.disconnect();
          bed.gain.disconnect();
        } catch {
          /* ignore */
        }
      },
      (CROSSFADE_S + 0.1) * 1000,
    );
  }

  private async loadBuffer(src: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(src);
    if (cached) {
      this.touch(src);
      return cached;
    }
    const inflight = this.decoding.get(src);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const bytes = await this.deps.fetchAudio(audioUrl(src));
        const buf = await this.ctx!.decodeAudioData(bytes.slice(0));
        this.buffers.set(src, buf);
        this.touch(src);
        return buf;
      } catch {
        return null;
      } finally {
        this.decoding.delete(src);
      }
    })();
    this.decoding.set(src, p);
    return p;
  }

  private touch(src: string): void {
    this.lru = this.lru.filter((s) => s !== src);
    this.lru.push(src);
    while (this.lru.length > BUFFER_CAP) {
      const evict = this.lru.shift()!;
      if (this.active && this.buffers.get(evict) === this.active.source.buffer) {
        // Keep the active buffer tracked (moved to the tail) so it isn't
        // silently dropped from the LRU while still in use; evict the next
        // genuinely inactive entry instead.
        this.lru.push(evict);
        continue;
      }
      this.buffers.delete(evict);
    }
  }

  dispose(): void {
    if (this.active) this.fadeOutAndStop(this.active);
    this.active = null;
    this.buffers.clear();
    this.lru = [];
    void this.ctx?.close?.();
    this.ctx = null;
    this.master = null;
  }
}
