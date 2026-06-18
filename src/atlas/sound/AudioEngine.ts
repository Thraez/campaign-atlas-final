import type { PreparedArea } from "@/atlas/sound/resolveSoundscape";

export interface AudioDeps {
  createContext: () => AudioContext;
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  /** true if the browser can decode the given src extension (Ogg probe etc.). */
  canPlay: (src: string) => boolean;
}

const CROSSFADE_S = 1.0;
const BUFFER_CAP = 4;

interface ActiveBed {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Resolve the asset URL for the player build. */
function audioUrl(src: string): string {
  return src.startsWith("/") || src.startsWith("http") ? src : `atlas/assets/audio/${src}`;
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

  constructor(private deps: AudioDeps) {}

  /** Must be called from a user-gesture handler. Idempotent. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterGain;
      this.master.connect(this.ctx.destination);
    }
    await this.resume();
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
      this.master.gain.linearRampToValueAtTime(muted ? 0 : this.masterGain, this.ctx.currentTime + 0.2);
    }
  }

  setMasterGain(g: number): void {
    this.masterGain = Math.min(1, Math.max(0, g));
    if (!this.muted) this.setMuted(false);
  }

  /** Crossfade to the given area's bed, or to silence when area is null. */
  async crossfadeTo(area: PreparedArea | null): Promise<void> {
    if (!this.ctx || !this.master) return;
    const targetId = area?.id ?? null;
    if (this.active?.id === targetId) return;

    const out = this.active;
    this.active = null;
    if (out) this.fadeOutAndStop(out);

    if (!area) return;

    const src = this.deps.canPlay(area.bed.src) || !area.bed.srcFallback ? area.bed.src : area.bed.srcFallback;
    const buffer = await this.loadBuffer(src);
    if (!buffer || !this.ctx || !this.master) return;
    if (this.active) return; // a newer crossfade superseded us while decoding

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
    setTimeout(() => {
      try {
        bed.source.disconnect();
        bed.gain.disconnect();
      } catch {
        /* ignore */
      }
    }, (CROSSFADE_S + 0.1) * 1000);
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
      if (this.active && this.buffers.get(evict) === this.active.source.buffer) continue;
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
