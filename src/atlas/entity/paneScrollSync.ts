export interface Anchor { id: string; line: number; }

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Ordered structural anchors: markdown ATX headings. id is the slugged text. */
export function buildAnchors(text: string): Anchor[] {
  const out: Anchor[] = [];
  const lines = (text ?? "").split("\n");
  const seen = new Map<string, number>();
  lines.forEach((ln, i) => {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(ln);
    if (!m) return;
    let id = slug(m[1]) || `h-${i}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    out.push({ id, line: i });
  });
  return out;
}

/**
 * Given the anchor at the top of `from`, find which anchor `to` should align
 * to: same id if shared; else the nearest preceding shared anchor (park);
 * else null (no basis — caller leaves the follower's scroll untouched).
 */
export function mapScroll(args: {
  from: Anchor[];
  to: Anchor[];
  fromAnchorId: string;
}): string | null {
  const toIds = new Set(args.to.map((a) => a.id));
  if (toIds.has(args.fromAnchorId)) return args.fromAnchorId;
  const idx = args.from.findIndex((a) => a.id === args.fromAnchorId);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (toIds.has(args.from[i].id)) return args.from[i].id;
  }
  return null;
}
