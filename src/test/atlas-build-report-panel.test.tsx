/**
 * Tests for src/atlas/publish/BuildReportPanel.tsx
 *
 * Covers the user-facing contract:
 *   - hidden when DM tools are disabled (player mode)
 *   - visible when DM tools are enabled
 *   - errors and warnings render grouped by severity
 *   - empty-state messaging when no report is provided
 *   - markdown export is well-formed and useful
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BuildReport } from "@/atlas/content/schema";

function setEnv({ dev, flag }: { dev: boolean; flag?: string }) {
  vi.unstubAllEnvs();
  vi.stubEnv("DEV", dev);
  if (flag !== undefined) vi.stubEnv("VITE_ENABLE_DM_TOOLS", flag);
}

async function loadPanel() {
  vi.resetModules();
  return await import("@/atlas/publish/BuildReportPanel");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const sampleReport: BuildReport = {
  scanned: 42,
  included: 30,
  excluded: 12,
  warnings: [
    "map m1 layer base: asset path \"/atlas/assets/maps/main.jpg\" starts with \"/\" — Use a relative path: \"atlas/assets/maps/main.jpg\".",
  ],
  brokenLinks: 2,
  unresolvedLinks: 2,
  duplicateSlugs: 0,
  strippedDmBlocks: 4,
  localAssets: 10,
  externalAssets: 1,
  missingAssets: 1,
};

describe("BuildReportPanel — DM-tools gating", () => {
  it("renders nothing when DM tools are disabled (player mode)", async () => {
    setEnv({ dev: false, flag: "false" });
    const { BuildReportPanel } = await loadPanel();
    const { container } = render(<BuildReportPanel report={sampleReport} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the panel when DM tools are enabled", async () => {
    setEnv({ dev: true });
    const { BuildReportPanel } = await loadPanel();
    render(<BuildReportPanel report={sampleReport} />);
    expect(screen.getByTestId("build-report-panel")).toBeInTheDocument();
  });
});

describe("BuildReportPanel — severity grouping", () => {
  beforeEach(() => setEnv({ dev: true }));

  it("renders error, warning, and info sections separately", async () => {
    const { BuildReportPanel } = await loadPanel();
    render(<BuildReportPanel report={sampleReport} />);
    expect(screen.getByTestId("build-report-section-error")).toBeInTheDocument();
    expect(screen.getByTestId("build-report-section-warning")).toBeInTheDocument();
    expect(screen.getByTestId("build-report-section-info")).toBeInTheDocument();
  });

  it("derives a missing-asset error from the report counts", async () => {
    const { BuildReportPanel } = await loadPanel();
    render(<BuildReportPanel report={sampleReport} />);
    const errSection = screen.getByTestId("build-report-section-error");
    expect(errSection.textContent).toMatch(/missing-asset/);
    expect(errSection.textContent).toMatch(/local asset reference/);
  });

  it("shows the build-warning issue with its scope and suggestion", async () => {
    const { BuildReportPanel } = await loadPanel();
    render(<BuildReportPanel report={sampleReport} />);
    const warnSection = screen.getByTestId("build-report-section-warning");
    expect(warnSection.textContent).toMatch(/map m1 layer base/);
    expect(warnSection.textContent).toMatch(/Use a relative path/);
  });

  it("shows pass banner when there are no errors", async () => {
    const { BuildReportPanel } = await loadPanel();
    const clean: BuildReport = {
      scanned: 5, included: 5, excluded: 0, warnings: [],
      brokenLinks: 0, unresolvedLinks: 0, duplicateSlugs: 0, strippedDmBlocks: 0,
      missingAssets: 0, localAssets: 0, externalAssets: 0,
    };
    render(<BuildReportPanel report={clean} />);
    expect(screen.getByText(/Last build passed all gates\./)).toBeInTheDocument();
    expect(screen.queryByTestId("build-report-section-error")).toBeNull();
  });
});

describe("BuildReportPanel — empty state", () => {
  it("shows a helpful empty state when no report is available", async () => {
    setEnv({ dev: true });
    const { BuildReportPanel } = await loadPanel();
    render(<BuildReportPanel report={null} />);
    expect(screen.getByTestId("build-report-empty")).toBeInTheDocument();
    expect(screen.getByText(/No publish report found\./)).toBeInTheDocument();
    expect(screen.getByText(/atlas:build:player/)).toBeInTheDocument();
  });
});

describe("buildReportToMarkdown", () => {
  it("produces a useful markdown document with status, summary, and grouped issues", async () => {
    setEnv({ dev: true });
    const { buildReportToMarkdown } = await loadPanel();
    const md = buildReportToMarkdown(sampleReport, {
      atlasVersion: "v1",
      publishedAt: "2025-05-13T00:00:00Z",
    });
    expect(md).toMatch(/^# Atlas Publish Check Report/);
    expect(md).toMatch(/Status:.*Blocking issues/);
    expect(md).toMatch(/Atlas version:.*v1/);
    expect(md).toMatch(/## Summary/);
    expect(md).toMatch(/Scanned: 42/);
    expect(md).toMatch(/## Errors/);
    expect(md).toMatch(/missing-asset/);
    expect(md).toMatch(/## Warnings/);
    expect(md).toMatch(/## Info/);
    expect(md).toMatch(/Fix:/);
  });

  it("marks status as ready when there are no errors", async () => {
    setEnv({ dev: true });
    const { buildReportToMarkdown } = await loadPanel();
    const clean: BuildReport = {
      scanned: 1, included: 1, excluded: 0, warnings: [],
      brokenLinks: 0, unresolvedLinks: 0, duplicateSlugs: 0, strippedDmBlocks: 0,
      missingAssets: 0, localAssets: 0, externalAssets: 0,
    };
    const md = buildReportToMarkdown(clean);
    expect(md).toMatch(/Status:.*Ready to publish/);
    expect(md).toMatch(/No issues reported/);
  });
});