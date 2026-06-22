// src/test/publish-check-tab.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublishCheckTab } from "@/atlas/tabs/PublishCheckTab";
import type { AtlasProject } from "@/atlas/content/schema";
import type { PublishState } from "@/atlas/publish/usePublishFlow";

// Keep PublishedDiffPanel from making real fetch calls
vi.mock("@/atlas/publish/PublishedDiffPanel", () => ({
  PublishedDiffPanel: () => null,
}));

vi.mock("@/atlas/publish/usePublishFlow");
import { usePublishFlow } from "@/atlas/publish/usePublishFlow";
const mockUsePublishFlow = vi.mocked(usePublishFlow);

function makeFlow(state: PublishState, overrides: Record<string, unknown> = {}) {
  return {
    state,
    checkResult: null,
    error: null as string | null,
    pushReason: null as string | null,
    check: vi.fn(),
    confirm: vi.fn(),
    ...overrides,
  };
}

const BASE_PROJECT: AtlasProject = {
  version: "1.0.0",
  publishedAt: new Date().toISOString(),
  worlds: [{ id: "w1", name: "W" }],
  maps: [],
  entities: [],
  placements: [],
  assets: [],
};

describe("PublishCheckTab — publish action surface", () => {
  beforeEach(() => {
    mockUsePublishFlow.mockReturnValue(makeFlow("idle"));
  });

  it("idle: Publish button is enabled", () => {
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    const btn = screen.getByText(/publish to players/i).closest("button") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
  });

  it("idle: hint text is shown", () => {
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/run a check to see what.s new/i)).toBeTruthy();
  });

  it("checking: spinner text is shown", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("checking"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/checking your world/i)).toBeTruthy();
  });

  it("checking: publish button is disabled", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("checking"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    const btn = screen.getByText(/checking your world/i).closest("button") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it("checking: idle hint text is absent", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("checking"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.queryByText(/run a check to see what.s new/i)).toBeNull();
  });

  it("checking: ReadinessCard is not rendered (no safety verdict text)", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("checking"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.queryByText(/safe to publish/i)).toBeNull();
    expect(screen.queryByText(/publishing is blocked/i)).toBeNull();
  });

  it("published: success message is shown", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("published"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/published/i)).toBeTruthy();
    expect(screen.getByText(/your players will see/i)).toBeTruthy();
  });

  it("error: error message is shown from publish.error", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("error", { error: "Check failed (500)" }));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText("Check failed (500)")).toBeTruthy();
  });
});
