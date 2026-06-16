/**
 * Shared result types for the two publish endpoints.
 * Imported by both scripts (server) and src (client, type-only).
 *
 * D8: reasons are generated from a static plain-language template keyed on
 * scan identity — never copied from scan output, never echoing a secret.
 */
import type { AtlasDiff } from "../../src/atlas/publish/computeAtlasDiff";

export interface PublishScanReason {
  /** Scan identity — the disambiguator (NOT exit code; 13 is shared by 3 scans). */
  scan:
    | "check-no-secrets-dm"
    | "check-no-secrets-editor"
    | "check-derived-secrets"
    | "check-image-privacy"
    | "check-fog-safety"
    | "check-artifact-shape"
    | "audit-assets";
  target: string; // "dist" | "public/atlas" | "public/atlas/atlas.json"
  severity: "blocking";
  /** Plain-language message; generated from the static template — NEVER scan output. */
  message: string;
  /** Locator availability is scan-dependent (§2.3). Never contains a secret. */
  locator?: { entityId?: string; mapId?: string; file?: string };
}

export interface PublishCheckResult {
  verdict: "safe" | "blocked" | "build-failed";
  reasons: PublishScanReason[];
  diff: AtlasDiff;
  builtAt: string;
  buildError?: string;
  repoIsPublic: true;
}

export type PublishPushResult =
  | { status: "published"; pushedAt: string; commit: string }
  | { status: "blocked"; reasons: PublishScanReason[] }
  | { status: "nothing-to-publish" }
  | { status: "git-failed"; reason: "offline" | "auth" | "behind" | "conflict" | "unknown" };
