// src/test/publish-check-tab.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PublishCheckTab } from "@/atlas/tabs/PublishCheckTab";
import type { AtlasProject } from "@/atlas/content/schema";
import type { PublishState } from "@/atlas/publish/usePublishFlow";
import type { ValidationReport } from "@/atlas/yaml/validateProject";
import type { PublishCheckResult } from "@/atlas/publish/publishTypes";

// Keep PublishedDiffPanel from making real fetch calls
vi.mock("@/atlas/publish/PublishedDiffPanel", () => ({
  PublishedDiffPanel: () => null,
}));

vi.mock("@/atlas/publish/usePublishFlow");
import { usePublishFlow } from "@/atlas/publish/usePublishFlow";
const mockUsePublishFlow = vi.mocked(usePublishFlow);

// Control validateProject output for issue-rendering tests
vi.mock("@/atlas/yaml/validateProject", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/yaml/validateProject")>();
  return { ...actual, validateProject: vi.fn() };
});
import * as validateModule from "@/atlas/yaml/validateProject";
const mockValidateProject = vi.mocked(validateModule.validateProject);

const BASE_REPORT: ValidationReport = {
  counts: { blocking: 0, warning: 0, suggestion: 0 },
  issues: [],
  passedChecks: [],
  meta: {
    generatedAt: "2026-01-01T00:00:00Z",
    entityCount: 0,
    mapCount: 0,
    draftPlacementCount: 0,
    pendingAssetCount: 0,
  },
};

function makeFlow(state: PublishState, overrides: Record<string, unknown> = {}) {
  return {
    state,
    checkResult: null,
    error: null as string | null,
    pushReason: null as string | null,
    pushResult: null as { pushedAt: string; commit: string } | null,
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

const SAFE_CHECK_RESULT: PublishCheckResult = {
  verdict: "safe",
  reasons: [],
  // PublishedDiffPanel is mocked so diff shape doesn't matter at runtime
  diff: {} as unknown as PublishCheckResult["diff"],
  builtAt: "2026-01-01T00:00:00Z",
  repoIsPublic: true,
};

describe("PublishCheckTab — publish action surface", () => {
  beforeEach(() => {
    mockUsePublishFlow.mockReturnValue(makeFlow("idle"));
    mockValidateProject.mockReturnValue(BASE_REPORT);
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
    expect(screen.getByText(/published ✓/i)).toBeTruthy();
    expect(screen.getByText(/your players will see/i)).toBeTruthy();
  });

  it("published + diff counts + pushResult: shows the entity/pin counts and short commit", () => {
    mockUsePublishFlow.mockReturnValue(
      makeFlow("published", {
        checkResult: {
          ...SAFE_CHECK_RESULT,
          diff: {
            counts: { entities: 5, placements: 3, maps: 0, overlays: 0 },
          } as unknown as PublishCheckResult["diff"],
        },
        pushResult: { pushedAt: "2026-01-01T00:00:00Z", commit: "a1b2c3d4e5" },
      }),
    );
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText("Published 5 entities and 3 pins (commit a1b2c3d).")).toBeTruthy();
  });

  it("error: error message is shown from publish.error", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("error", { error: "Check failed (500)" }));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText("Check failed (500)")).toBeTruthy();
  });

  it("busy: button text indicates busy and is disabled", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("busy"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    const btn = screen
      .getByText(/busy.*finishing the current build/i)
      .closest("button") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it("nothing-to-publish: already up to date message shown", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("nothing-to-publish"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/already up to date.*nothing new to publish/i)).toBeTruthy();
  });

  it("git-failed: 'finish in GitHub Desktop' message shown", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("git-failed"));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/couldn.t publish automatically/i)).toBeTruthy();
  });

  it("git-failed + pushReason 'offline': offline sub-message shown", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("git-failed", { pushReason: "offline" }));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/you appear to be offline/i)).toBeTruthy();
  });

  it("git-failed + pushReason 'behind': branch-behind sub-message shown", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("git-failed", { pushReason: "behind" }));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/your branch is behind.*pull first/i)).toBeTruthy();
  });

  it("ready + safe checkResult: ReadinessCard shows safety verdict", () => {
    mockUsePublishFlow.mockReturnValue(makeFlow("ready", { checkResult: SAFE_CHECK_RESULT }));
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText(/safe to publish.*no DM-only content/i)).toBeTruthy();
  });
});

describe("PublishCheckTab — issue rendering", () => {
  beforeEach(() => {
    mockUsePublishFlow.mockReturnValue(makeFlow("idle"));
    mockValidateProject.mockReturnValue(BASE_REPORT);
  });

  it("IssueCard: hint text renders when issue has a hint", () => {
    mockValidateProject.mockReturnValue({
      ...BASE_REPORT,
      counts: { blocking: 0, warning: 1, suggestion: 0 },
      issues: [
        {
          severity: "warning" as const,
          code: "test-warning",
          category: "yaml" as const,
          message: "Something needs attention",
          hint: "Try fixing the property in world.yaml",
        },
      ],
    });
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    expect(screen.getByText("Try fixing the property in world.yaml")).toBeTruthy();
  });

  it("IssueCard: 'Go to map' button fires onGoToMap with the mapId", () => {
    const onGoToMap = vi.fn();
    mockValidateProject.mockReturnValue({
      ...BASE_REPORT,
      counts: { blocking: 1, warning: 0, suggestion: 0 },
      issues: [
        {
          severity: "blocking" as const,
          code: "map-error",
          category: "map" as const,
          message: "Map has a problem",
          scope: { mapId: "map-astrath" },
        },
      ],
    });
    render(
      <PublishCheckTab
        project={BASE_PROJECT}
        draftPlacements={[]}
        draftLocalLayers={[]}
        onGoToMap={onGoToMap}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /go to map/i }));
    expect(onGoToMap).toHaveBeenCalledWith("map-astrath");
  });

  it("IssueCard: 'Go to entity' button fires onGoToEntity with the entityId", () => {
    const onGoToEntity = vi.fn();
    mockValidateProject.mockReturnValue({
      ...BASE_REPORT,
      counts: { blocking: 0, warning: 1, suggestion: 0 },
      issues: [
        {
          severity: "warning" as const,
          code: "broken-link",
          category: "yaml" as const,
          message: "Entity has a broken link",
          scope: { entityId: "npc-001" },
        },
      ],
    });
    render(
      <PublishCheckTab
        project={BASE_PROJECT}
        draftPlacements={[]}
        draftLocalLayers={[]}
        onGoToEntity={onGoToEntity}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /go to entity/i }));
    expect(onGoToEntity).toHaveBeenCalledWith("npc-001");
  });

  it("passedChecks block renders the 'Passed (N)' header when checks passed", () => {
    mockValidateProject.mockReturnValue({
      ...BASE_REPORT,
      passedChecks: ["No DM content exposed", "All images safe"],
    });
    render(<PublishCheckTab project={BASE_PROJECT} draftPlacements={[]} draftLocalLayers={[]} />);
    // defaultOpen={false} so only the collapsible header is visible, not the list items
    expect(screen.getByText(/passed \(2\)/i)).toBeTruthy();
  });
});
