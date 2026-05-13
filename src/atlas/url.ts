/**
 * Normalize an atlas asset URL so it resolves correctly under GitHub Pages
 * project subpaths (e.g. https://user.github.io/repo-name/).
 *
 * Rules:
 *   - http:, https:, data:, blob: URLs pass through unchanged.
 *   - Otherwise the leading slash is stripped and `import.meta.env.BASE_URL`
 *     is prefixed.
 */
export function normalizeAtlasAssetUrl(src: string, base?: string): string {
  if (!src) return src;
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  const b = base ?? (typeof import.meta !== "undefined" ? import.meta.env?.BASE_URL : undefined) ?? "/";
  const cleaned = src.replace(/^\/+/, "");
  const baseWithSlash = b.endsWith("/") ? b : b + "/";
  return baseWithSlash + cleaned;
}
