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
import { scanTasks, type ScanContext, type ScanTask } from "./scanRegistry";
import type { PublishScanReason } from "./publishTypes";

export const MSG: Record<PublishScanReason["scan"], string> = {
  "check-no-secrets-dm":
    "A DM-only note would have been visible to players. Publishing is blocked until it's hidden.",
  "check-no-secrets-editor":
    "The editor itself leaked into the player build — this is a code bug, not a content problem. Publishing is blocked; this needs a developer.",
  "check-derived-secrets":
    "The name of a hidden person or place would have leaked into the player site. Publishing is blocked.",
  "check-image-privacy":
    "An image that's marked DM-only would have been published. Publishing is blocked.",
  "check-fog-safety":
    "A map's hidden (fogged) area would have been revealed. Publishing is blocked.",
  "check-artifact-shape":
    "The world file came out malformed — the build needs attention before publishing.",
  "check-player-secrets":
    "A locked secret or its password would have been visible to players. Publishing is blocked.",
  "audit-assets": "An image is larger than the 4 MB limit and must be optimized before publishing.",
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

/** Plain-language reasons for one failed task, with locators where the scan
 *  has a structured export; otherwise one scan-level row. */
function reasonsForFailure(task: ScanTask, ctx: ScanContext): PublishScanReason[] {
  const target = task.label.slice(task.scan.length + 1);
  const dir = path.join(ctx.root, target);
  let structured: PublishScanReason[] = [];
  if (task.scan === "check-no-secrets") {
    structured = reasonsFromNoSecrets(scanDir(dir), target);
  } else if (task.scan === "check-derived-secrets") {
    structured = reasonsFromDerived(
      scanArtifactForSecrets(dir, deriveSecretsFromVault(ctx.configPath)),
      target,
    );
  } else if (task.scan === "check-artifact-shape") {
    const atlasJsonPath = path.join(ctx.root, "public", "atlas", "atlas.json");
    if (fs.existsSync(atlasJsonPath)) {
      structured = reasonsFromShape(
        scanArtifactShape(JSON.parse(fs.readFileSync(atlasJsonPath, "utf8"))),
      );
    }
  }
  if (structured.length > 0) return structured;
  const scan = task.scan === "check-no-secrets" ? "check-no-secrets-dm" : task.scan;
  return [scanLevelReason(scan, target)];
}

/**
 * Run every scan in the registry (the same list CI runs) and collect reasons.
 * `repoRoot` is the dev-server cwd (the repo root).
 */
export async function runPublishScans(repoRoot: string): Promise<PublishScanReason[]> {
  const configPath = path.resolve(repoRoot, "atlas.config.json");
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as { contentRoot: string };
  const ctx: ScanContext = {
    root: repoRoot,
    configPath,
    contentDir: path.resolve(path.dirname(configPath), cfg.contentRoot),
  };
  const tasks = scanTasks(ctx);
  const codes = await Promise.all(
    tasks.map(async (t) => {
      try {
        return await t.run();
      } catch {
        return -1;
      }
    }),
  );
  return tasks.flatMap((t, i) => (codes[i] === 0 ? [] : reasonsForFailure(t, ctx)));
}
