export function resolvePeekEntityId(el: HTMLElement | null): string | null {
  const link = el?.closest<HTMLElement>("a.atlas-wikilink, [data-entity-id]");
  if (!link) return null;
  const direct = link.getAttribute("data-entity-id");
  if (direct) return direct;
  const href = link.getAttribute("href") ?? "";
  const m = href.match(/#\/entity\/(.+)$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
