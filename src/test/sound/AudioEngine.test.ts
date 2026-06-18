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
  };
  return ctx;
}

const deps = (ctx: any) => ({
  createContext: () => ctx,
  fetchAudio: vi.fn(async () => new ArrayBuffer(8)),
  canPlay: () => true,
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
});
