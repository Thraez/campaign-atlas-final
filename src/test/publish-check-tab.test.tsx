/**
 * Unit tests for PublishCheckTab — spinner and button state during
 * in-flight publish states (checking, publishing, busy).
 *
 * These complement the integration coverage by asserting directly that:
 *   - the spinner label is present during each in-flight state
 *   - the action button is disabled so the DM cannot double-submit
 *   - no ReadinessCard confirm button leaks into in-flight states
 *
 * usePublishFlow is mocked so no real fetch / server is needed.
 * BuildReportPanel is stubbed to avoid DM-tools env gating.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AtlasProject, MapDocument } from "@/atlas/content/schema";

// ---- mocks (hoisted by vitest transform) ----

let mockPublishReturn: object;

vi.mock("@/atlas/publish/usePublishFlow", () => ({
  usePublishFlow: () => mockPublishReturn,
}));

vi.mock("@/atlas/publish/BuildReportPanel", () => ({
  BuildReportPanel: () => null,
}));

// ---- helpers ----

const map: MapDocument = {
  id: "m1", worldId: "w1", name: "Main",
  width: 800, height: 600,
  layers: [{ id: "L1", src: "atlas/assets/maps/m.jpg", x: 0, y: 0, width: 800, height: 600, opacity: 1, zIndex: 1 }],
};

const project: AtlasProject = {
  version: "1.0.0",
  publishedAt: "2026-01-01T00:00:00Z",
  worlds: [{ id: "w1", name: "Test World" }],
  maps: [map],
  entities: [],
  placements: [],
  assets: [],
};

function idlePublish() {
  return { state: "idle", checkResult: null, error: null, pushReason: null, check: vi.fn(), confirm: vi.fn() };
}

async function renderTab() {
  const { PublishCheckTab } = await import("@/atlas/tabs/PublishCheckTab");
  render(
    <PublishCheckTab
      project={project}
      draftPlacements={[]}
      draftLocalLayers={[]}
    />
  );
}

// ---- tests ----

describe("PublishCheckTab — checking state", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPublishReturn = { ...idlePublish(), state: "checking" };
  });

  it("shows the checking spinner label", async () => {
    await renderTab();
    expect(screen.getByText(/Checking your world/i)).toBeInTheDocument();
  });

  it("the main action button is disabled", async () => {
    await renderTab();
    const btn = screen.getByRole("button", { name: /Checking your world/i });
    expect(btn).toBeDisabled();
  });

  it("does not show the idle 'Publish to players' label", async () => {
    await renderTab();
    expect(screen.queryByText(/Publish to players/i)).toBeNull();
  });

  it("does not render a ReadinessCard confirm button", async () => {
    await renderTab();
    // ReadinessCard renders a "Publish to players" or "Confirm" button;
    // none should appear while the check is still in flight.
    expect(screen.queryByRole("button", { name: /confirm|publish to players/i })).toBeNull();
  });
});

describe("PublishCheckTab — publishing state", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPublishReturn = { ...idlePublish(), state: "publishing", checkResult: { verdict: "safe", reasons: [], diff: { hasChanges: false, counts: { entities: 0, placements: 0, maps: 0, overlays: 0 }, entities: [], placements: [], maps: [], overlays: [] }, builtAt: "t", repoIsPublic: true } };
  });

  it("shows the publishing spinner label", async () => {
    await renderTab();
    // Use exact accessible name to avoid matching ReadinessCard's
    // "Re-checking safety before publishing…" secondary button.
    expect(screen.getByRole("button", { name: "Publishing…" })).toBeInTheDocument();
  });

  it("the main action button is disabled", async () => {
    await renderTab();
    const btn = screen.getByRole("button", { name: "Publishing…" });
    expect(btn).toBeDisabled();
  });
});

describe("PublishCheckTab — busy state", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPublishReturn = { ...idlePublish(), state: "busy" };
  });

  it("shows the busy spinner label", async () => {
    await renderTab();
    expect(screen.getByText(/finishing the current build/i)).toBeInTheDocument();
  });

  it("the main action button is disabled", async () => {
    await renderTab();
    const btn = screen.getByRole("button", { name: /finishing the current build/i });
    expect(btn).toBeDisabled();
  });
});

describe("PublishCheckTab — idle state (baseline)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPublishReturn = idlePublish();
  });

  it("shows the 'Publish to players' label", async () => {
    await renderTab();
    expect(screen.getByRole("button", { name: /Publish to players/i })).toBeInTheDocument();
  });

  it("the main action button is enabled", async () => {
    await renderTab();
    const btn = screen.getByRole("button", { name: /Publish to players/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows the idle hint text", async () => {
    await renderTab();
    expect(screen.getByText(/Run a check to see what/i)).toBeInTheDocument();
  });
});
