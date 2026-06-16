/**
 * Adapter from the safety scans to plain-language PublishScanReason rows.
 *
 * D8 — the verdict NEVER echoes a secret. Structured hits carry secrets
 * verbatim (DerivedScanHit.match.name; ShapeViolation.message embeds leaked
 * values). Every message is generated from the static template below, keyed
 * on SCAN IDENTITY (not exit code — 13 is shared by 3 scans), and only safe
 * locators are copied (entityId for shape; content/ source path for derived;
 * a built-artifact path for sentinel hits).
 */
import fs from "node:fs";
import path from "node:path";
import { scanDir, type ScanResult } from "../check-no-secrets";
import {
  deriveSecretsFromVault,
  scanArtifactForSecrets,
  type DerivedScanResult,
} from "../check-derived-secrets";
import { scanArtifactShape, type ShapeResult } from "../check-artifact-shape";
import { run as runImagePrivacy } from "../check-image-privacy";
import { run as runFogSafety } from "../check-fog-safety";
import { run as runAuditAssets } from "./audit-assets";
import type { PublishScanReason } from "./publishTypes";

const MSG: Record<PublishScanReason["scan"], string> = {
  "check-no-secrets-dm": "A DM-only note would have been visible to players. Publishing is blocked until it's hidden.",
  "check-no-secrets-editor": "The editor itself leaked into the player build — this is a code bug, not a content problem. Publishing is blocked; this needs a developer.",
  "check-derived-secrets": "The name of a hidden person or place would have leaked into the player site. Publishing is blocked.",
  "check-image-privacy": "An image that's marked DM-only would have been published. Publishing is blocked.",
  "check-fog-safety": "A map's hidden (fogged) area would have been revealed. Publishing is blocked.",
  "check-artifact-shape": "The world file came out malformed — the build needs attention before publishing.",
  "audit-assets": "An image is referenced but missing (or an unused image needs cleanup). Publishing is blocked.",
};

export function reasonsFromNoSecrets(r: ScanResult, target: string): PublishScanReason[] {
  const out: PublishScanReason[] = [];
  if (r.dmHits.length) {
    out.push({
      scan: "check-no-secrets-dm",
      target,
      severity: "blocking",
      message: MSG["check-no-secrets-dm"],
      locator: { file: r.dmHits[0].file },
    });
  }
  if (r.editorHits.length) {
    out.push({
      scan: "check-no-secrets-editor",
      target,
      severity: "blocking",
      message: MSG["check-no-secrets-editor"],
      locator: { file: r.editorHits[0].file },
    });
  }
  return out;
}

export function reasonsFromDerived(r: DerivedScanResult, target: string): PublishScanReason[] {
  if (!r.hits.length) return [];
  const seen = new Set<string>();
  const out: PublishScanReason[] = [];
  for (const h of r.hits) {
    if (seen.has(h.match.source)) continue;
    seen.add(h.match.source);
    // D8: copy only match.source (never match.name, which IS the secret).
    out.push({
      scan: "check-derived-secrets",
      target,
      severity: "blocking",
      message: MSG["check-derived-secrets"],
      locator: { file: h.match.source },
    });
  }
  return out;
}

export function reasonsFromShape(r: ShapeResult): PublishScanReason[] {
  // D8: copy only entityId (never violation.message, which embeds leaked text).
  const seen = new Set<string>();
  const out: PublishScanReason[] = [];
  for (const v of r.violations) {
    const key = v.entityId ?? "<root>";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      scan: "check-artifact-shape",
      target: "public/atlas/atlas.json",
      severity: "blocking",
      message: MSG["check-artifact-shape"],
      ...(v.entityId ? { locator: { entityId: v.entityId } } : {}),
    });
  }
  return out;
}

function scanLevelReason(scan: PublishScanReason["scan"], target: string): PublishScanReason {
  return { scan, target, severity: "blocking", message: MSG[scan] };
}

/**
 * Run every scan over dist/ and public/atlas/ and collect reasons.
 * `repoRoot` is the dev-server cwd (the repo root).
 */
export async function runPublishScans(repoRoot: string): Promise<PublishScanReason[]> {
  const reasons: PublishScanReason[] = [];
  const dist = path.resolve(repoRoot, "dist");
  const pub = path.resolve(repoRoot, "public/atlas");
  const configPath = path.resolve(repoRoot, "atlas.config.json");

  // check-no-secrets — structured
  for (const [dir, label] of [[dist, "dist"], [pub, "public/atlas"]] as const) {
    if (fs.existsSync(dir)) {
      reasons.push(...reasonsFromNoSecrets(scanDir(dir), label));
    }
  }

  // check-derived-secrets — structured
  const secrets = deriveSecretsFromVault(configPath);
  for (const [dir, label] of [[dist, "dist"], [pub, "public/atlas"]] as const) {
    if (fs.existsSync(dir)) {
      reasons.push(...reasonsFromDerived(scanArtifactForSecrets(dir, secrets), label));
    }
  }

  // check-artifact-shape — structured (reads + parses atlas.json)
  const atlasJsonPath = path.join(pub, "atlas.json");
  if (fs.existsSync(atlasJsonPath)) {
    const atlas = JSON.parse(fs.readFileSync(atlasJsonPath, "utf8"));
    reasons.push(...reasonsFromShape(scanArtifactShape(atlas)));
  }

  // Exit-code-only scans — scan-level rows (no structured export available)
  const distExists = fs.existsSync(dist);
  const pubExists = fs.existsSync(pub);

  if (distExists || pubExists) {
    // check-image-privacy (RunOpts: { dir, config? })
    const imgResults = await Promise.all([
      distExists ? runImagePrivacy({ dir: dist, config: configPath }) : Promise.resolve(0),
      pubExists ? runImagePrivacy({ dir: pub, config: configPath }) : Promise.resolve(0),
    ]);
    if (imgResults.some((c) => c !== 0)) {
      reasons.push(scanLevelReason("check-image-privacy", "player build"));
    }

    // check-fog-safety (RunOpts: { dir, config? })
    const fogResults = await Promise.all([
      pubExists ? runFogSafety({ dir: pub, config: configPath }) : Promise.resolve(0),
      distExists ? runFogSafety({ dir: dist, config: configPath }) : Promise.resolve(0),
    ]);
    if (fogResults.some((c) => c !== 0)) {
      reasons.push(scanLevelReason("check-fog-safety", "player build"));
    }
  }

  // audit-assets (RunOpts: { assetsDir, publicDir, contentDir, strict? }) — synchronous
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as { contentRoot: string };
  const contentDir = path.resolve(repoRoot, cfg.contentRoot);
  const auditCode = runAuditAssets({
    assetsDir: path.join(pub, "assets"),
    publicDir: path.resolve(repoRoot, "public"),
    contentDir,
  });
  if (auditCode !== 0) {
    reasons.push(scanLevelReason("audit-assets", "public/atlas/assets"));
  }

  return reasons;
}
