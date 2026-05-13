/**
 * Atlas asset validation.
 *
 * Walks every asset reference (map layer src, entity image, etc.) and reports
 * problems that would break the player build under GitHub Pages or hurt
 * runtime performance.
 *
 * Categories of finding:
 *   - "missing"        — referenced file does not exist on disk
 *   - "absolute-path"  — leading-slash path that breaks under repo subpaths
 *   - "bad-extension"  — file extension is not on the allow list
 *   - "svg-policy"     — .svg subject to SVG_POLICY (default: warn)
 *   - "oversize"       — file exceeds ASSET_SIZE_BUDGET_BYTES
 *   - "external"       — http(s)/data/blob URL (not bundled)
 *
 * Each finding carries the offending path, the owner (map/entity/layer id),
 * a human description, and a concrete suggested fix.
 *
 * NB: this module deliberately does NOT mutate paths. We surface the issue
 * loudly so the source record gets fixed, rather than hiding deployment bugs
 * behind silent rewrites. Runtime normalization in src/atlas/url.ts handles
 * the legacy leading-slash form, but new authoring should use relative paths.
 */
import fs from "node:fs";
import path from "node:path";

/** Per-file size budget for shipped image assets. 2 MB is a generous default
 *  for hand-painted maps; raise per project if needed. */
export const ASSET_SIZE_BUDGET_BYTES = 2 * 1024 * 1024;

/** Image extensions safe to ship to a static host. */
export const ALLOWED_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"] as const;

/** SVG policy. SVGs can carry script content; default to "warn" so authors
 *  know they are landing in player output without an explicit safety review. */
export type SvgPolicy = "allow" | "warn" | "block";
export const DEFAULT_SVG_POLICY: SvgPolicy = "warn";

export type FindingSeverity = "error" | "warning";
export type FindingCategory =
  | "missing"
  | "absolute-path"
  | "bad-extension"
  | "svg-policy"
  | "oversize"
  | "external";

export interface AssetFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  /** The raw path as written in source. */
  path: string;
  /** Human-readable owner: "map <id> layer <id>", "entity <id>", etc. */
  owner: string;
  /** Short description of the problem. */
  message: string;
  /** Concrete remediation, e.g. the suggested replacement path. */
  suggestion: string;
}

export interface ValidateAssetOptions {
  /** Absolute path to the public/ directory where assets live. */
  publicDir: string;
  sizeBudgetBytes?: number;
  svgPolicy?: SvgPolicy;
}

/** Returns true for http(s)/data/blob URLs. */
export function isExternalAssetUrl(raw: string): boolean {
  return /^(https?:|data:|blob:)/i.test(raw);
}

/**
 * Compute the base path a GitHub Pages project subpath would inject.
 * `githubPagesBasePath("my-repo")` -> "/my-repo/".
 * `githubPagesBasePath(undefined)` -> "/" (user/org root site).
 */
export function githubPagesBasePath(repoSubpath: string | undefined): string {
  if (!repoSubpath) return "/";
  const trimmed = repoSubpath.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "/";
  return `/${trimmed}/`;
}

/**
 * Validate a single asset reference. Returns 0..N findings.
 * Pure function over filesystem reads; no console output.
 */
export function validateAsset(
  raw: string,
  owner: string,
  opts: ValidateAssetOptions
): AssetFinding[] {
  const findings: AssetFinding[] = [];
  if (!raw) return findings;

  if (isExternalAssetUrl(raw)) {
    findings.push({
      severity: "warning",
      category: "external",
      path: raw,
      owner,
      message: `external asset "${raw}" is not bundled with the player build`,
      suggestion: `Download the file into public/atlas/assets/ and reference it with a relative path (e.g. atlas/assets/maps/file.jpg).`,
    });
    return findings;
  }

  const sizeBudget = opts.sizeBudgetBytes ?? ASSET_SIZE_BUDGET_BYTES;
  const svgPolicy = opts.svgPolicy ?? DEFAULT_SVG_POLICY;

  // 1) Absolute root path check. These break under GitHub Pages project
  //    subpaths (e.g. /repo/). Runtime normalizer hides this in production
  //    today, but new authoring should always be relative.
  if (raw.startsWith("/")) {
    const suggested = raw.replace(/^\/+/, "");
    findings.push({
      severity: "warning",
      category: "absolute-path",
      path: raw,
      owner,
      message: `asset path "${raw}" starts with "/" and will break under GitHub Pages repository subpaths`,
      suggestion: `Use a relative path: "${suggested}".`,
    });
  }

  // 2) Extension check.
  const ext = path.extname(raw).toLowerCase();
  const allAllowed: string[] = [...ALLOWED_IMAGE_EXTS, ".svg"];
  if (!ext) {
    findings.push({
      severity: "error",
      category: "bad-extension",
      path: raw,
      owner,
      message: `asset "${raw}" has no file extension`,
      suggestion: `Rename to one of: ${ALLOWED_IMAGE_EXTS.join(", ")}.`,
    });
  } else if (!allAllowed.includes(ext)) {
    findings.push({
      severity: "error",
      category: "bad-extension",
      path: raw,
      owner,
      message: `asset "${raw}" uses unsupported extension "${ext}"`,
      suggestion: `Convert to one of: ${ALLOWED_IMAGE_EXTS.join(", ")}.`,
    });
  } else if (ext === ".svg") {
    if (svgPolicy === "block") {
      findings.push({
        severity: "error",
        category: "svg-policy",
        path: raw,
        owner,
        message: `SVG assets are blocked by project policy ("${raw}")`,
        suggestion: `Convert to PNG or WEBP, or change SVG policy to "allow" with an explicit safety review.`,
      });
    } else if (svgPolicy === "warn") {
      findings.push({
        severity: "warning",
        category: "svg-policy",
        path: raw,
        owner,
        message: `SVG asset "${raw}" — SVGs can embed scripts; verify the source is trusted`,
        suggestion: `If safe, set svgPolicy: "allow". Otherwise convert to PNG or WEBP.`,
      });
    }
  }

  // 3) Existence + size check (only for paths we can resolve to disk).
  const rel = raw.replace(/^\/+/, "");
  const abs = path.join(opts.publicDir, rel);
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(abs);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    findings.push({
      severity: "error",
      category: "missing",
      path: raw,
      owner,
      message: `missing local asset "${raw}"`,
      suggestion: `Add the file at public/${rel} or correct the reference.`,
    });
  } else if (stat.size > sizeBudget) {
    const mb = (stat.size / (1024 * 1024)).toFixed(2);
    const budgetMb = (sizeBudget / (1024 * 1024)).toFixed(2);
    findings.push({
      severity: "warning",
      category: "oversize",
      path: raw,
      owner,
      message: `asset "${raw}" is ${mb} MB, exceeding the ${budgetMb} MB budget`,
      suggestion: `Re-export at lower resolution or convert to WEBP. Raise ASSET_SIZE_BUDGET_BYTES in scripts/atlas/validateAsset.ts if intentional.`,
    });
  }

  return findings;
}

/** Format a finding as a single human-readable line for build logs. */
export function formatFinding(f: AssetFinding): string {
  const tag = f.severity === "error" ? "✗" : "!";
  return `${tag} ${f.owner}: ${f.message}\n      → ${f.suggestion}`;
}