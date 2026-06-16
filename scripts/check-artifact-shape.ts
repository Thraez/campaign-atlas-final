/**
 * Structural assertions for a player atlas.json.
 *
 * Even with sentinels stripped, a player build can still leak DM data if a
 * pipeline regression skips visibility filtering, leaves source paths in
 * place, or forgets to drop frontmatter / DM profile halves. This file
 * encodes those invariants and runs after the build.
 *
 * Imports PLAYER_VISIBLE from scripts/atlas/visibility.ts so the shape gate
 * and the build pipeline share one literal.
 *
 * Exit codes:
 *   0   clean
 *   1   missing or unparseable input
 *   11  shape violation
 */
import fs from "node:fs";
import path from "node:path";
import { PLAYER_VISIBLE } from "./atlas/visibility";
import { DM_CONTENT_SENTINELS } from "./check-no-secrets";

const DM_BLOCK_RE = /%%[\s\S]*?%%/;

export interface ShapeViolation {
  entityId?: string;
  field: string;
  message: string;
}

export interface ShapeResult {
  violations: ShapeViolation[];
}

function checkStringField(
  out: ShapeViolation[],
  entityId: string,
  field: string,
  value: unknown
): void {
  if (typeof value !== "string" || value === "") return;
  if (DM_BLOCK_RE.test(value)) {
    out.push({ entityId, field, message: `${field} contains an unstripped %% DM block %%` });
  }
  for (const s of DM_CONTENT_SENTINELS) {
    if (value.includes(s)) {
      out.push({ entityId, field, message: `${field} contains DM sentinel ${s}` });
    }
  }
}

export function scanArtifactShape(atlas: unknown): ShapeResult {
  const violations: ShapeViolation[] = [];
  if (!atlas || typeof atlas !== "object") {
    violations.push({ field: "<root>", message: "atlas.json root is not an object" });
    return { violations };
  }
  const a = atlas as Record<string, unknown>;

  const entities = Array.isArray(a.entities) ? (a.entities as Record<string, unknown>[]) : [];
  for (const e of entities) {
    const id = typeof e.id === "string" ? e.id : "<unknown>";
    const vis = e.visibility as string | undefined;
    if (!vis || !PLAYER_VISIBLE.has(vis as never)) {
      violations.push({ entityId: id, field: "visibility", message: `visibility "${vis}" not in PLAYER_VISIBLE` });
    }
    if (typeof e.sourcePath === "string" && e.sourcePath !== "") {
      violations.push({ entityId: id, field: "sourcePath", message: `sourcePath leaked: "${e.sourcePath}"` });
    }
    if (e.frontmatter && typeof e.frontmatter === "object" && Object.keys(e.frontmatter as object).length > 0) {
      violations.push({ entityId: id, field: "frontmatter", message: "frontmatter is non-empty (raw YAML leak)" });
    }
    const profile = e.profile as { dm?: unknown; player?: Record<string, unknown> } | undefined;
    if (profile && profile.dm !== undefined) {
      violations.push({ entityId: id, field: "profile.dm", message: "profile.dm is defined in player artifact" });
    }
    checkStringField(violations, id, "body", e.body);
    checkStringField(violations, id, "bodyHtml", e.bodyHtml);
    checkStringField(violations, id, "summary", e.summary);
    checkStringField(violations, id, "title", e.title);
    checkStringField(violations, id, "dateRaw", e.dateRaw);
    // Aliases + tags: each element ships individually, so each is scanned.
    if (Array.isArray(e.aliases)) {
      for (const a of e.aliases as unknown[]) checkStringField(violations, id, "alias", a);
    }
    if (Array.isArray(e.tags)) {
      for (const t of e.tags as unknown[]) checkStringField(violations, id, "tag", t);
    }
    // profile.player half (profile.dm absence is already a separate rule).
    if (profile?.player) {
      const pp = profile.player;
      checkStringField(violations, id, "profile.player.known_for", pp.known_for);
      if (Array.isArray(pp.visible_traits)) {
        for (const t of pp.visible_traits as unknown[]) {
          checkStringField(violations, id, "profile.player.visible_traits", t);
        }
      }
      if (Array.isArray(pp.rumors)) {
        for (const t of pp.rumors as unknown[]) {
          checkStringField(violations, id, "profile.player.rumors", t);
        }
      }
    }
    // Relationships: label + description ship if the relationship survives the
    // player filter, so they need DM-block scanning too.
    if (Array.isArray(e.relationships)) {
      for (const r of e.relationships as Record<string, unknown>[]) {
        checkStringField(violations, id, "relationship.label", r.label);
        checkStringField(violations, id, "relationship.description", r.description);
      }
    }
  }

  const placements = Array.isArray(a.placements) ? (a.placements as Record<string, unknown>[]) : [];
  for (const p of placements) {
    const vis = p.visibility as string | undefined;
    const entityId = typeof p.entityId === "string" ? p.entityId : undefined;
    if (!vis || !PLAYER_VISIBLE.has(vis as never)) {
      violations.push({
        entityId,
        field: "placement.visibility",
        message: `placement visibility "${vis}" not in PLAYER_VISIBLE`,
      });
    }
    // Placement labels ship and may carry stray %% blocks from raw frontmatter.
    checkStringField(violations, entityId ?? "<placement>", "placement.label", p.label);
  }

  const maps = Array.isArray(a.maps) ? (a.maps as Record<string, unknown>[]) : [];
  for (const m of maps) {
    const mapId = typeof m.id === "string" ? m.id : "<unknown>";
    // Map names ship in the world atlas.
    checkStringField(violations, mapId, "map.name", m.name);
    const regions = Array.isArray(m.regions) ? (m.regions as Record<string, unknown>[]) : [];
    for (const r of regions) {
      const vis = r.visibility as string | undefined;
      if (!vis || !PLAYER_VISIBLE.has(vis as never)) {
        violations.push({
          field: `map[${mapId}].region[${r.id ?? "?"}].visibility`,
          message: `region visibility "${vis}" not in PLAYER_VISIBLE`,
        });
      }
      checkStringField(violations, mapId, `region[${r.id ?? "?"}].name`, r.name);
    }
    const routes = Array.isArray(m.routes) ? (m.routes as Record<string, unknown>[]) : [];
    for (const r of routes) {
      const vis = r.visibility as string | undefined;
      if (!vis || !PLAYER_VISIBLE.has(vis as never)) {
        violations.push({
          field: `map[${mapId}].route[${r.id ?? "?"}].visibility`,
          message: `route visibility "${vis}" not in PLAYER_VISIBLE`,
        });
      }
      checkStringField(violations, mapId, `route[${r.id ?? "?"}].name`, r.name);
    }
  }

  return { violations };
}

export interface SearchIndexResult {
  violations: ShapeViolation[];
}

export function scanSearchIndex(records: unknown): SearchIndexResult {
  const violations: ShapeViolation[] = [];
  if (!Array.isArray(records)) return { violations };
  for (const r of records as Record<string, unknown>[]) {
    const id = typeof r.id === "string" ? r.id : (typeof r.title === "string" ? r.title : "<unknown>");
    const fields: Array<[string, unknown]> = [
      ["title", r.title],
      ["summary", r.summary],
      ["excerpt", r.excerpt],
      ["body", r.body],
      ["aliases", Array.isArray(r.aliases) ? (r.aliases as unknown[]).join(" ") : undefined],
      ["tags", Array.isArray(r.tags) ? (r.tags as unknown[]).join(" ") : undefined],
    ];
    for (const [name, val] of fields) checkStringField(violations, id, `search.${name}`, val);
  }
  return { violations };
}

function resolveAtlasJson(arg: string | undefined): string | null {
  if (arg) {
    const abs = path.resolve(process.cwd(), arg);
    return fs.existsSync(abs) ? abs : null;
  }
  for (const candidate of ["dist/atlas/atlas.json", "public/atlas/atlas.json"]) {
    const abs = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function siblingSearchIndex(atlasPath: string): string | null {
  const candidate = path.join(path.dirname(atlasPath), "search-index.json");
  return fs.existsSync(candidate) ? candidate : null;
}

export interface RunOpts { atlasJsonPath?: string }

export function run(opts: RunOpts): number {
  const target = resolveAtlasJson(opts.atlasJsonPath);
  if (!target) {
    console.error("atlas:check-shape: could not find atlas.json (tried arg, dist/atlas, public/atlas)");
    return 1;
  }
  let atlas: unknown;
  try {
    atlas = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (e) {
    console.error(`atlas:check-shape: failed to parse ${target}: ${(e as Error).message}`);
    return 1;
  }
  const res = scanArtifactShape(atlas);

  const idx = siblingSearchIndex(target);
  if (idx) {
    try {
      const records = JSON.parse(fs.readFileSync(idx, "utf8"));
      const r2 = scanSearchIndex(records);
      res.violations.push(...r2.violations);
    } catch (e) {
      console.error(`atlas:check-shape: failed to parse ${idx}: ${(e as Error).message}`);
      return 1;
    }
  }

  if (res.violations.length === 0) {
    console.log(`atlas:check-shape: ${path.relative(process.cwd(), target)} clean`);
    return 0;
  }
  console.error(`atlas:check-shape: ${res.violations.length} violation(s) in ${target}:`);
  for (const v of res.violations) {
    const who = v.entityId ? `[${v.entityId}] ` : "";
    console.error(`  ${who}${v.field}: ${v.message}`);
  }
  return 11;
}

function main(): number {
  return run({ atlasJsonPath: process.argv[2] });
}

const invokedAsScript = (() => {
  const arg1 = process.argv[1] ?? "";
  return arg1.endsWith("check-artifact-shape.ts") || arg1.endsWith("check-artifact-shape.js");
})();
if (invokedAsScript) {
  process.exit(main());
}