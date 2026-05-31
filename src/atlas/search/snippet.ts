function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
}

// Build a 140-char snippet around the first match of `q` in `lower`,
// then slice the same offsets from `display` for original-case output.
// toLowerCase() preserves length for Latin content; `end` is clamped to
// display.length defensively in case a hypothetical divergence shifts the boundary.
export function snippet(display: string | undefined, lower: string | undefined, q: string): string | null {
  if (!lower || !display || !q) return null;
  const idx = lower.indexOf(q);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 50);
  const end = Math.min(display.length, idx + q.length + 90);
  const slice = (start > 0 ? "…" : "") + display.slice(start, end) + (end < display.length ? "…" : "");
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return escapeHtml(slice).replace(re, (m) => `<mark class="bg-primary/30 text-foreground rounded-sm px-0.5">${escapeHtml(m)}</mark>`);
}
