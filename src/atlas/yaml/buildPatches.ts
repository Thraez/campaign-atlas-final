/**
 * Entity-frontmatter patch builder.
 *
 * The offline export modal and its world-map / placement / publish-report
 * builders were deleted when the editor's unified Save flow took over
 * (Save writes canonical .md frontmatter and world.yaml directly to disk).
 *
 * What remains is the entity-frontmatter patch: a read-only YAML preview the
 * EntitiesTab shows and the import wizard offers for files outside the
 * editor's writable allowlist. {@link PlacementOverride} is the shared
 * placement-draft shape consumed by validateProject / the placement editor.
 */

import type { EntityVisibility } from "@/atlas/content/schema";
import { dumpYaml, patchHeader } from "./dump";

export type PatchKindId = "entity-frontmatter";

export interface PatchArtifact {
  kind: PatchKindId;
  filename: string;
  mime: string;
  /** Final downloadable text. */
  content: string;
  /** Human-readable summary lines shown in the modal. */
  summary: string[];
  /** Optional per-section breakdown for the "advanced raw YAML preview". */
  sections?: Array<{ label: string; yaml: string }>;
}

// --------------------------------------------------------------------------
// PLACEMENT OVERRIDE — shared draft shape. Placement patches were deleted with
// the offline export modal; the editor's Save flow now writes canonical .md
// frontmatter directly via canonicalPlacementSave.ts. This type is still the
// contract between the placement editor and validateProject.
// --------------------------------------------------------------------------

export interface PlacementOverride {
  entityId: string;
  mapId: string;
  x: number;
  y: number;
  /** Optional label override (defaults to entity.title at render time). */
  label?: string;
  /** Optional pin styling — only diff vs. the type preset is emitted. */
  pin?: import("@/atlas/pins/presets").PinOverride;
}

// --------------------------------------------------------------------------
// ENTITY FRONTMATTER PATCH (full atlas: block, used by import wizard)
// --------------------------------------------------------------------------

export interface EntityFrontmatterPatch {
  /** Source-relative path to the .md file (e.g. "settlements/Sunhaven.md"). */
  sourcePath: string;
  /** Title written to the file's top-level `title:` if missing. */
  title?: string;
  /** Suggested atlas: block. Keys are written in canonical order. */
  atlas: {
    id?: string;
    type?: string;
    visibility?: EntityVisibility;
    publish?: boolean;
    summary?: string;
    aliases?: string[];
    images?: string[];
    tags?: string[];
    profile?: import("@/atlas/profiles/profileTypes").EntityProfile;
    relationships?: import("@/atlas/profiles/profileTypes").EntityRelationship[];
  };
}

export function buildEntityFrontmatterPatch(patches: EntityFrontmatterPatch[]): PatchArtifact {
  const sections: Array<{ label: string; yaml: string }> = [];
  const bodyParts: string[] = [];

  for (const p of patches) {
    const top: Record<string, unknown> = {};
    if (p.title) top.title = p.title;
    // Strip undefined keys so dumpYaml emits a clean block.
    const atlas: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p.atlas)) {
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) atlas[k] = v;
    }
    top.atlas = atlas;
    const ymlBlock = dumpYaml(top);
    sections.push({ label: p.sourcePath, yaml: ymlBlock });
    bodyParts.push(`# file: ${p.sourcePath}`);
    bodyParts.push("---");
    bodyParts.push(ymlBlock.trimEnd());
    bodyParts.push("---");
    bodyParts.push("");
  }

  const header = patchHeader({
    title: `Entity frontmatter patch — ${patches.length} file${patches.length === 1 ? "" : "s"}`,
    subject: `frontmatter on ${patches.length} entity .md file${patches.length === 1 ? "" : "s"}`,
    applyTo: "the matching entity .md file (replace its existing frontmatter block)",
    notes: [
      "Each '# file:' section below is a complete YAML frontmatter block.",
      "Replace the file's existing '---' frontmatter (top of file) with the block here.",
      "If the file has no frontmatter yet, paste the entire '---' block at the very top.",
    ],
  });

  return {
    kind: "entity-frontmatter",
    filename: `entity-frontmatter-patch-${patches.length}.yaml`,
    mime: "text/yaml",
    content: header + bodyParts.join("\n"),
    summary: [
      `Frontmatter for ${patches.length} entity file${patches.length === 1 ? "" : "s"}`,
    ],
    sections,
  };
}
