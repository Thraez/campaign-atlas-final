import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { usePublishFlow } from "./usePublishFlow";

afterEach(() => vi.restoreAllMocks());

const EMPTY_DIFF = {
  hasChanges: false,
  counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
  entities: [],
  placements: [],
  maps: [],
  overlays: [],
};

function mockCheck(result: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => result })),
  );
}

function mockPush(result: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => result })),
  );
}

function mockPushHttp(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 400, status, json: async () => ({}) })),
  );
}

const SAFE_CHECK = {
  verdict: "safe",
  reasons: [],
  diff: EMPTY_DIFF,
  builtAt: "t",
  repoIsPublic: true,
};

describe("usePublishFlow (check half)", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => usePublishFlow());
    expect(result.current.state).toBe("idle");
  });

  it("idle → checking → ready on a safe verdict", async () => {
    mockCheck({ verdict: "safe", reasons: [], diff: EMPTY_DIFF, builtAt: "t", repoIsPublic: true });
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.checkResult?.verdict).toBe("safe");
  });

  it("→ blocked on a blocked verdict", async () => {
    mockCheck({
      verdict: "blocked",
      reasons: [
        {
          scan: "check-derived-secrets",
          message: "Hidden name would leak",
          severity: "blocking",
          target: "dist",
        },
      ],
      diff: EMPTY_DIFF,
      builtAt: "t",
      repoIsPublic: true,
    });
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("blocked"));
  });

  it("→ build-failed on a build-failed verdict", async () => {
    mockCheck({
      verdict: "build-failed",
      reasons: [],
      diff: EMPTY_DIFF,
      builtAt: "t",
      repoIsPublic: true,
      buildError: "tsc error",
    });
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("build-failed"));
  });

  it("→ busy on 423", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 423, json: async () => ({ error: "Locked" }) })),
    );
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("busy"));
  });

  it("→ error on unexpected HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("→ error exposes HTTP status in error string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("Check failed (503)");
  });

  it("→ error on network throw, exposes exception message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network down");
      }),
    );
    const { result } = renderHook(() => usePublishFlow());
    act(() => {
      result.current.check();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("Network down");
  });

  it("transitions to checking immediately (before fetch resolves)", async () => {
    let resolveFetch!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolveFetch = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const { result } = renderHook(() => usePublishFlow());
    expect(result.current.state).toBe("idle");
    act(() => {
      result.current.check();
    });
    expect(result.current.state).toBe("checking");
    resolveFetch({ ok: true, status: 200, json: async () => SAFE_CHECK });
    await waitFor(() => expect(result.current.state).toBe("ready"));
  });
});

describe("usePublishFlow (push half)", () => {
  async function reachReady() {
    mockCheck(SAFE_CHECK);
    const hook = renderHook(() => usePublishFlow());
    act(() => {
      hook.result.current.check();
    });
    await waitFor(() => expect(hook.result.current.state).toBe("ready"));
    return hook;
  }

  it("confirm() → publishing → published on success", async () => {
    const { result } = await reachReady();
    mockPush({ status: "published", pushedAt: "t", commit: "abc1234" });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("published"));
  });

  it("confirm() → git-failed with reason exposed", async () => {
    const { result } = await reachReady();
    mockPush({ status: "git-failed", reason: "behind" });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("git-failed"));
    expect(result.current.pushReason).toBe("behind");
  });

  it("confirm() → nothing-to-publish", async () => {
    const { result } = await reachReady();
    mockPush({ status: "nothing-to-publish" });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("nothing-to-publish"));
  });

  it("confirm() → blocked when re-verify fails", async () => {
    const { result } = await reachReady();
    mockPush({
      status: "blocked",
      reasons: [
        { scan: "check-derived-secrets", message: "…", severity: "blocking", target: "dist" },
      ],
    });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("blocked"));
  });

  it("confirm() → busy on 423", async () => {
    const { result } = await reachReady();
    mockPushHttp(423);
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("busy"));
  });

  it("confirm() → error on non-ok HTTP, exposes status in error string", async () => {
    const { result } = await reachReady();
    mockPushHttp(500);
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("Publish failed (500)");
  });

  it("confirm() → error on network throw, exposes exception message", async () => {
    const { result } = await reachReady();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Connection refused");
      }),
    );
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.error).toBe("Connection refused");
  });

  it("confirm() captures pushResult (pushedAt + commit) on published", async () => {
    const { result } = await reachReady();
    mockPush({ status: "published", pushedAt: "2026-07-26T00:00:00Z", commit: "a1b2c3d4e5" });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("published"));
    expect(result.current.pushResult).toEqual({
      pushedAt: "2026-07-26T00:00:00Z",
      commit: "a1b2c3d4e5",
    });
  });

  it("pushResult stays null when confirm() doesn't reach published", async () => {
    const { result } = await reachReady();
    mockPush({ status: "nothing-to-publish" });
    act(() => {
      result.current.confirm();
    });
    await waitFor(() => expect(result.current.state).toBe("nothing-to-publish"));
    expect(result.current.pushResult).toBeNull();
  });

  it("confirm() transitions to publishing immediately (before fetch resolves)", async () => {
    const { result } = await reachReady();
    let resolveFetch!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolveFetch = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    act(() => {
      result.current.confirm();
    });
    expect(result.current.state).toBe("publishing");
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ status: "published", pushedAt: "t", commit: "abc" }),
    });
    await waitFor(() => expect(result.current.state).toBe("published"));
  });
});
