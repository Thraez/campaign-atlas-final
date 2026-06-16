import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { usePublishFlow } from "./usePublishFlow";

afterEach(() => vi.restoreAllMocks());

const EMPTY_DIFF = { hasChanges: false, counts: { entities: 0, placements: 0, maps: 0, overlays: 0 }, entities: [], placements: [], maps: [], overlays: [] };

function mockCheck(result: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => result })));
}

describe("usePublishFlow (check half)", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => usePublishFlow());
    expect(result.current.state).toBe("idle");
  });

  it("idle → checking → ready on a safe verdict", async () => {
    mockCheck({ verdict: "safe", reasons: [], diff: EMPTY_DIFF, builtAt: "t", repoIsPublic: true });
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.checkResult?.verdict).toBe("safe");
  });

  it("→ blocked on a blocked verdict", async () => {
    mockCheck({ verdict: "blocked", reasons: [{ scan: "check-derived-secrets", message: "Hidden name would leak", severity: "blocking", target: "dist" }], diff: EMPTY_DIFF, builtAt: "t", repoIsPublic: true });
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("blocked"));
  });

  it("→ build-failed on a build-failed verdict", async () => {
    mockCheck({ verdict: "build-failed", reasons: [], diff: EMPTY_DIFF, builtAt: "t", repoIsPublic: true, buildError: "tsc error" });
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("build-failed"));
  });

  it("→ busy on 423", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 423, json: async () => ({ error: "Locked" }) })));
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("busy"));
  });

  it("→ error on unexpected HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { result } = renderHook(() => usePublishFlow());
    act(() => { result.current.check(); });
    await waitFor(() => expect(result.current.state).toBe("error"));
  });
});
