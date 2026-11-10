/**
 * A campaign site's own name in its page head and PWA manifest (R-19 review).
 *
 * `index.html` and the manifest in `vite.config.ts` carry the v1 world's
 * name. A campaign site build (`CAMPAIGN_PUBLIC_DIR_ENV` set) replaces it with
 * the campaign's name from its staged store's `atlas.json`, so no campaign
 * site names another world. A v1 build (env unset) changes nothing.
 *
 * Kept to node builtins: `vite.config.ts` loads it.
 */
import fs from "node:fs";
import path from "node:path";
import { CAMPAIGN_PUBLIC_DIR_ENV } from "./campaignSitePublicDir";

/** The campaign name a campaign site build names itself by; null for any other build. */
export function campaignSiteName(env: Record<string, string | undefined>): string | null {
  const staged = env[CAMPAIGN_PUBLIC_DIR_ENV];
  if (!staged) return null;
  const file = path.join(staged, "atlas", "atlas.json");
  const atlas = JSON.parse(fs.readFileSync(file, "utf8")) as { campaign?: { name?: unknown } };
  const name = atlas.campaign?.name;
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`${file} names no campaign: a campaign site cannot be named`);
  }
  return name;
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const description = (name: string): string => `Interactive fantasy world atlas for ${name}`;

/** Rewrites every place `index.html`'s head names the site. Throws on a missing tag. */
export function brandIndexHtml(html: string, name: string): string {
  const n = escapeHtml(name);
  const d = escapeHtml(description(name));
  const rules: Array<[label: string, re: RegExp, to: string]> = [
    ["title", /<title>[^<]*<\/title>/, `<title>${n}</title>`],
    [
      "description",
      /<meta name="description" content="[^"]*"/,
      `<meta name="description" content="${d}"`,
    ],
    [
      "apple-mobile-web-app-title",
      /<meta name="apple-mobile-web-app-title" content="[^"]*"/,
      `<meta name="apple-mobile-web-app-title" content="${n}"`,
    ],
    [
      "og:title",
      /<meta property="og:title" content="[^"]*"/,
      `<meta property="og:title" content="${n}"`,
    ],
    [
      "twitter:title",
      /<meta name="twitter:title" content="[^"]*"/,
      `<meta name="twitter:title" content="${n}"`,
    ],
    [
      "og:description",
      /<meta property="og:description" content="[^"]*"/,
      `<meta property="og:description" content="${d}"`,
    ],
    [
      "twitter:description",
      /<meta name="twitter:description" content="[^"]*"/,
      `<meta name="twitter:description" content="${d}"`,
    ],
  ];
  let out = html;
  for (const [label, re, to] of rules) {
    if (!re.test(out)) throw new Error(`index.html has no ${label} tag to name the campaign in`);
    out = out.replace(re, () => to);
  }
  // The v1 share image shows the v1 world; a campaign site ships none.
  return out.replace(/[ \t]*<meta (?:property="og:image"|name="twitter:image")[^>]*>\r?\n?/g, "");
}

/** The manifest fields that name the site. */
export function brandManifest(name: string): {
  name: string;
  short_name: string;
  description: string;
} {
  return { name, short_name: name, description: `${description(name)}.` };
}

/** The head tags that name the site, as `brandIndexHtml` writes them. */
const NAMING_TAGS: Array<[label: string, re: RegExp]> = [
  ["title", /<title>([^<]*)<\/title>/g],
  ["description", /<meta name="description" content="([^"]*)"/g],
  ["apple-mobile-web-app-title", /<meta name="apple-mobile-web-app-title" content="([^"]*)"/g],
  ["og:title", /<meta property="og:title" content="([^"]*)"/g],
  ["twitter:title", /<meta name="twitter:title" content="([^"]*)"/g],
  ["og:description", /<meta property="og:description" content="([^"]*)"/g],
  ["twitter:description", /<meta name="twitter:description" content="([^"]*)"/g],
];

const unescapeHtml = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * A built campaign site names only its own campaign (the isolation scan's
 * site pass): every naming tag in `index.html` and the manifest's `name`,
 * `short_name` and `description` are exactly what `brandIndexHtml` and
 * `brandManifest` write for `name`. Anything else (another campaign, the v1
 * world, a hidden note's name of any length) is a finding, as is a missing
 * title, manifest or manifest name.
 */
export function siteIdentityFindings(siteDir: string, name: string): string[] {
  const allowed = new Set([name, description(name), `${description(name)}.`]);
  const out: string[] = [];
  const check = (where: string, value: unknown) => {
    if (typeof value !== "string" || !allowed.has(value)) {
      out.push(`${where} is ${JSON.stringify(value)}, not this campaign's own name ("${name}")`);
    }
  };
  let html: string;
  try {
    html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
  } catch {
    return [...out, "index.html: missing, so the site's name can't be checked"];
  }
  for (const [label, re] of NAMING_TAGS) {
    const hits = [...html.matchAll(re)];
    if (label === "title" && hits.length === 0) out.push("index.html: no title");
    for (const h of hits) check(`index.html ${label}`, unescapeHtml(h[1]));
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(siteDir, "manifest.webmanifest"), "utf8"));
  } catch (e) {
    return [...out, `manifest.webmanifest: missing or not JSON (${(e as Error).message})`];
  }
  for (const k of ["name", "short_name", "description"]) {
    if (k === "description" && manifest[k] === undefined) continue;
    check(`manifest.webmanifest ${k}`, manifest[k]);
  }
  return out;
}
