/**
 * YAML dump helper used by every patch builder.
 *
 * Centralizes:
 *  - flow style (block, never inline)
 *  - quoting + indentation
 *  - never-emits-fences invariant (downstream `validatePatchYaml` enforces this)
 *
 * Use this instead of hand-stringifying YAML in components. The `header`
 * prepends standard "this is a tool-generated patch" comments.
 */
import yaml from "js-yaml";

export interface PatchHeaderOpts {
  title: string;
  subject: string; // e.g. "world.yaml > maps[id=foo]" or "entity:thornhold.md"
  applyTo: string; // file the DM should paste this into
  notes?: string[];
}

export function patchHeader(opts: PatchHeaderOpts): string {
  const lines = [
    `# ${opts.title}`,
    `# Generated ${new Date().toISOString()}`,
    `# Subject: ${opts.subject}`,
    `#`,
    `# CANON MODEL:`,
    `#   YAML / Markdown frontmatter is the source of truth.`,
    `#   This file is a TOOL-GENERATED PATCH against that canon — never edit`,
    `#   public/atlas/atlas.json or search-index.json by hand (those are derived).`,
    `#`,
    `# HOW TO APPLY:`,
    `#   Paste the YAML below into ${opts.applyTo}.`,
    `#   Do NOT paste the leading "#" comment lines.`,
    `#   Do NOT wrap in markdown code fences (\`\`\`yaml).`,
  ];
  if (opts.notes?.length) {
    lines.push(`#`);
    for (const n of opts.notes) lines.push(`# ${n}`);
  }
  lines.push(``);
  return lines.join("\n");
}

export function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}
