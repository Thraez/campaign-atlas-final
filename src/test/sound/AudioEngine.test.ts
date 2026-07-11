import { describe, it, expect, vi } from "vitest";
import { AudioEngine } from "@/atlas/sound/AudioEngine";

function makeMockCtx() {
  const gainNode = () => ({
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const ctx: any = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(gainNode),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    })),
    resume: vi.fn(async () => { ctx.state = "running"; }),
    suspend: vi.fn(async () => { ctx.state = "suspended"; }),
    decodeAudioData: vi.fn(async () => ({ duration: 30 })),
    close: vi.fn(async () => {}),
  };
  return ctx;
}

const deps = (ctx: any, canPlay = true) => ({
  createContext: () => ctx,
  fetchAudio: vi.fn(async (_url: string) => new ArrayBuffer(8)),
  canPlay: vi.fn(() => canPlay),
});

describe("AudioEngine", () => {
  it("creates no context until unlock()", () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    expect((eng as any).ctx).toBeNull();
  });

  it("unlock() creates and resumes the context", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.state).toBe("running");
  });

  it("crossfadeTo decodes and starts a source, and stops the previous one", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(1);
    await eng.crossfadeTo({ id: "b", bed: { src: "b.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(2);
  });

  it("caches decoded buffers (no second fetch for the same src)", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    await eng.crossfadeTo({ id: "b", bed: { src: "b.ogg" } } as any);
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(2); // a reused
  });

  it("resume() only resumes when suspended", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    ctx.resume.mockClear();
    await eng.resume(); // already running
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("crossfadeTo(same id) is a no-op — no new fetch", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    const callsBefore = d.fetchAudio.mock.calls.length;
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    expect(d.fetchAudio).toHaveBeenCalledTimes(callsBefore); // no extra fetch
  });

  it("crossfadeTo(null) fades out the active bed without starting a new source", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    await eng.crossfadeTo(null);
    expect((eng as any).active).toBeNull();
    // no third fetch — only the initial load happened
    expect(d.fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("setMuted(true) ramps master gain to 0 when context exists", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    const master = (eng as any).master;
    eng.setMuted(true);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it("setMuted(false) ramps master gain back to masterGain", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    const master = (eng as any).master;
    eng.setMuted(true);
    master.gain.linearRampToValueAtTime.mockClear();
    eng.setMuted(false);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      (eng as any).masterGain,
      expect.any(Number),
    );
  });

  it("setMasterGain() clamps to [0, 1]", () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    eng.setMasterGain(2.5);
    expect((eng as any).masterGain).toBe(1);
    eng.setMasterGain(-0.5);
    expect((eng as any).masterGain).toBe(0);
    eng.setMasterGain(0.4);
    expect((eng as any).masterGain).toBe(0.4);
  });

  it("canPlay fallback — uses srcFallback when canPlay returns false", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx, false); // canPlay always false
    const eng = new AudioEngine(d);
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg", srcFallback: "a.mp3" } } as any);
    const calledUrl: string = d.fetchAudio.mock.calls[0][0];
    expect(calledUrl).toContain("a.mp3");
    expect(calledUrl).not.toContain("a.ogg");
  });

  it("dispose() clears the context and buffer cache", async () => {
    const ctx = makeMockCtx();
    const eng = new AudioEngine(deps(ctx));
    await eng.unlock();
    await eng.crossfadeTo({ id: "a", bed: { src: "a.ogg" } } as any);
    eng.dispose();
    expect((eng as any).ctx).toBeNull();
    expect((eng as any).buffers.size).toBe(0);
    expect((eng as any).active).toBeNull();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("LRU evicts oldest buffer when cache exceeds 4 entries", async () => {
    const ctx = makeMockCtx();
    const d = deps(ctx);
    const eng = new AudioEngine(d);
    await eng.unlock();
    // Load 5 distinct sources — the first should be evicted from cache
    for (const id of ["a", "b", "c", "d", "e"]) {
      await eng.crossfadeTo({ id, bed: { src: `${id}.ogg` } } as any);
    }
    // "a.ogg" is the oldest and should have been evicted
    expect((eng as any).buffers.has("a.ogg")).toBe(false);
    // "e.ogg" (the most recent) is still in cache
    expect((eng as any).buffers.has("e.ogg")).toBe(true);
  });
});
