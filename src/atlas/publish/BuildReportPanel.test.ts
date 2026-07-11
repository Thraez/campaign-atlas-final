import { describe, it, expect } from "vitest";
import { deriveBuildIssues, buildReportToMarkdown } from "./BuildReportPanel";
import type { BuildReport } from "@/atlas/content/schema";

const base: BuildReport = {
  scanned: 10,
  included: 8,
  excluded: 2,
  warnings: [],
  brokenLinks: 0,
  unresolvedLinks: 0,
  duplicateSlugs: 0,
  strippedDmBlocks: 0,
};

describe("deriveBuildIssues", () => {
  it("returns empty array for a clean report", () => {
    expect(deriveBuildIssues(base)).toEqual([]);
  });

  it("emits singular missing-asset error for missingAssets=1", () => {
    const issues = deriveBuildIssues({ ...base, missingAssets: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", code: "missing-asset" });
    expect(issues[0].message).toContain("1 local asset reference ");
    expect(issues[0].message).not.toContain("references");
  });

  it("emits plural missing-asset error for missingAssets=3", () => {
    const issues = deriveBuildIssues({ ...base, missingAssets: 3 });
    expect(issues[0].message).toContain("3 local asset references");
  });

  it("emits singular duplicate-slug error for duplicateSlugs=1", () => {
    const issues = deriveBuildIssues({ ...base, duplicateSlugs: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", code: "duplicate-slug" });
    expect(issues[0].message).toContain("1 duplicate entity slug ");
    expect(issues[0].message).not.toContain("slugs");
  });

  it("emits plural duplicate-slug error for duplicateSlugs=2", () => {
    const issues = deriveBuildIssues({ ...base, duplicateSlugs: 2 });
    expect(issues[0].message).toContain("2 duplicate entity slugs");
  });

  it("emits singular unresolved-wikilink info for unresolvedLinks=1", () => {
    const issues = deriveBuildIssues({ ...base, unresolvedLinks: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "info", code: "unresolved-wikilink" });
    expect(issues[0].message).toContain("1 wikilink ");
    expect(issues[0].message).not.toContain("wikilinks");
  });

  it("emits plural unresolved-wikilink info for unresolvedLinks=5", () => {
    const issues = deriveBuildIssues({ ...base, unresolvedLinks: 5 });
    expect(issues[0].message).toContain("5 wikilinks");
  });

  it("emits singular external-asset info for externalAssets=1", () => {
    const issues = deriveBuildIssues({ ...base, externalAssets: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "info", code: "external-asset" });
    expect(issues[0].message).toContain("1 external asset URL ");
    expect(issues[0].message).not.toContain("URLs");
  });

  it("emits plural external-asset info for externalAssets=2", () => {
    const issues = deriveBuildIssues({ ...base, externalAssets: 2 });
    expect(issues[0].message).toContain("2 external asset URLs");
  });

  it("parses warning with owner and suggestion separated by em-dash", () => {
    const issues = deriveBuildIssues({
      ...base,
      warnings: ["hero.png: metadata may leak — strip EXIF before publishing"],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "warning",
      code: "build-warning",
      scope: "hero.png",
      message: "metadata may leak",
      suggestion: "strip EXIF before publishing",
    });
  });

  it("parses a plain warning with no owner prefix and no suggestion", () => {
    const issues = deriveBuildIssues({ ...base, warnings: ["generic build warning"] });
    expect(issues[0]).toMatchObject({
      severity: "warning",
      code: "build-warning",
      message: "generic build warning",
    });
    expect(issues[0].scope).toBeUndefined();
    expect(issues[0].suggestion).toBeUndefined();
  });

  it("emits issues in order: error codes before warnings", () => {
    const issues = deriveBuildIssues({
      ...base,
      missingAssets: 1,
      duplicateSlugs: 1,
      warnings: ["w1"],
    });
    expect(issues).toHaveLength(3);
    expect(issues[0].code).toBe("missing-asset");
    expect(issues[1].code).toBe("duplicate-slug");
    expect(issues[2].severity).toBe("warning");
  });
});

describe("buildReportToMarkdown", () => {
  it("reports ready to publish with no issues", () => {
    const md = buildReportToMarkdown(base);
    expect(md).toContain("✅ Ready to publish");
    expect(md).toContain("No issues reported");
  });

  it("reports blocking issues when errors exist", () => {
    const md = buildReportToMarkdown({ ...base, missingAssets: 2 });
    expect(md).toContain("❌ Blocking issues");
    expect(md).not.toContain("No issues reported");
  });

  it("includes atlasVersion and publishedAt when provided in meta", () => {
    const md = buildReportToMarkdown(base, { atlasVersion: "v1.2.3", publishedAt: "2026-06-20T00:00:00Z" });
    expect(md).toContain("v1.2.3");
    expect(md).toContain("2026-06-20T00:00:00Z");
  });

  it("omits version lines when meta is absent", () => {
    const md = buildReportToMarkdown(base);
    expect(md).not.toContain("Atlas version");
    expect(md).not.toContain("Built at");
  });

  it("formats warning with scope as [code] `scope` — message", () => {
    const md = buildReportToMarkdown({ ...base, warnings: ["hero.png: bad metadata — fix it"] });
    expect(md).toContain("[build-warning]");
    expect(md).toContain("`hero.png`");
  });

  it("renders Fix line for issues that carry a suggestion", () => {
    const md = buildReportToMarkdown({ ...base, missingAssets: 1 });
    expect(md).toContain("_Fix:_");
  });

  it("includes scanned/included/excluded summary counts", () => {
    const md = buildReportToMarkdown({ ...base, scanned: 20, included: 15, excluded: 5 });
    expect(md).toContain("Scanned: 20");
    expect(md).toContain("Included: 15");
    expect(md).toContain("Excluded: 5");
  });
});
