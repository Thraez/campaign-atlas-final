import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReadinessCard } from "./ReadinessCard";
import type { PublishCheckResult } from "./publishTypes";

const baseDiff = {
  hasChanges: false,
  counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
  entities: [],
  placements: [],
  maps: [],
  overlays: [],
};

const base: Omit<PublishCheckResult, "verdict" | "reasons"> = {
  diff: baseDiff,
  builtAt: "2026-06-16T00:00:00Z",
  repoIsPublic: true,
};

describe("ReadinessCard", () => {
  it("shows Publish now button when verdict is safe", () => {
    const result: PublishCheckResult = { ...base, verdict: "safe", reasons: [] };
    render(<ReadinessCard result={result} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: /publish now/i })).toBeInTheDocument();
  });

  it("shows reason messages and hides confirm when blocked", () => {
    const result: PublishCheckResult = {
      ...base,
      verdict: "blocked",
      reasons: [
        { scan: "check-derived-secrets", target: "dist", severity: "blocking", message: "Hidden name would leak" },
      ],
    };
    render(<ReadinessCard result={result} onConfirm={vi.fn()} />);
    expect(screen.getByText("Hidden name would leak")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish now/i })).toBeNull();
  });

  it("shows build error tail when build failed", () => {
    const result: PublishCheckResult = {
      ...base,
      verdict: "build-failed",
      reasons: [],
      buildError: "tsc: error TS1234: something wrong",
    };
    render(<ReadinessCard result={result} onConfirm={vi.fn()} />);
    expect(screen.getByText(/tsc: error TS1234/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish now/i })).toBeNull();
  });

  it("always shows the public-repo notice", () => {
    const result: PublishCheckResult = { ...base, verdict: "safe", reasons: [] };
    render(<ReadinessCard result={result} onConfirm={vi.fn()} />);
    expect(screen.getByText(/public on GitHub/i)).toBeInTheDocument();
  });

  it("disables button and shows re-check label when busy", () => {
    const result: PublishCheckResult = { ...base, verdict: "safe", reasons: [] };
    render(<ReadinessCard result={result} onConfirm={vi.fn()} busy />);
    const btn = screen.getByRole("button", { name: /re-checking safety/i });
    expect(btn).toBeDisabled();
  });
});
