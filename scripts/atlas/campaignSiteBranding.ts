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

/** Meta keys (`name`/`property`) whose content names the site: it must be this campaign's. */
const NAMING_META = new Set([
  "description",
  "apple-mobile-web-app-title",
  "og:title",
  "twitter:title",
  "og:description",
  "twitter:description",
]);

/** Meta keys that name nothing, each with the one value the app's shell gives it. */
const NEUTRAL_META: Record<string, string> = {
  charset: "utf-8",
  viewport: "width=device-width, initial-scale=1.0, viewport-fit=cover",
  "theme-color": "#18313f",
  "apple-mobile-web-app-capable": "yes",
  "apple-mobile-web-app-status-bar-style": "black-translucent",
  "og:type": "website",
  "twitter:card": "summary_large_image",
};

/** Manifest keys holding the site's name, and the keys that name nothing. */
const NAMING_MANIFEST = new Set(["name", "short_name", "description"]);
const NEUTRAL_MANIFEST: Record<string, RegExp> = {
  start_url: /^\.?\/[\w\-./]*$/,
  scope: /^\.?\/[\w\-./]*$/,
  display: /^(standalone|fullscreen|minimal-ui|browser)$/,
  background_color: /^#[0-9a-f]{3,8}$/i,
  theme_color: /^#[0-9a-f]{3,8}$/i,
  lang: /^[a-z]{2}(-[A-Za-z]{2})?$/,
  src: /^icons\/[\w\-.]+\.png$/,
  sizes: /^\d+x\d+$/,
  type: /^image\/png$/,
  purpose: /^(any|maskable|any maskable)$/,
};

/** A local asset path, or Google Fonts (the shell's one off-site link). */
const LOCAL_PATH = /^\.?\/[\w\-./]*$/;
const FONT_URL = /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/[\w\-./?=&:;@%+]*)?$/;
const CROSSORIGIN = /^(|anonymous)$/;

/**
 * Every tag other than `<meta>` the site build writes, with each attribute it
 * may carry and that attribute's neutral values. Any other tag or attribute,
 * or a value off its pattern, is a finding.
 */
const TAG_ATTRS: Record<string, Record<string, RegExp>> = {
  html: { lang: /^[a-z]{2}(-[A-Za-z]{2})?$/ },
  head: {},
  body: {},
  title: {},
  div: { id: /^root$/ },
  link: {
    rel: /^(manifest|icon|apple-touch-icon|preconnect|modulepreload|stylesheet)$/,
    href: new RegExp(`${LOCAL_PATH.source}|${FONT_URL.source}`),
    type: /^image\/png$/,
    sizes: /^\d+x\d+$/,
    crossorigin: CROSSORIGIN,
  },
  script: { type: /^module$/, src: LOCAL_PATH, crossorigin: CROSSORIGIN },
};

const unescapeHtml = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** A tag's attributes, in any order, names lower-cased, values unescaped. */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag
    .replace(/^<[\w-]+/, "")
    .matchAll(/([^\s=/<>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = m[1].toLowerCase();
    out[key] = unescapeHtml(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/**
 * A built campaign site names only its own campaign (the isolation scan's
 * site pass). An allowlist, not a search:
 *   - every `<meta>` in `index.html` (attributes in any order) is a naming
 *     tag whose content is this campaign's name (or `brandIndexHtml`'s
 *     description of it), or a neutral tag with its one known value; any
 *     other meta, a share image included, is a finding;
 *   - every `<title>` is the name, and there is one; no other page text
 *     exists, so a `<noscript>` can't name a world;
 *   - every other tag is one the build writes (`TAG_ATTRS`), each attribute
 *     with a neutral value, so a canonical link, `data-*` or `alt` can't name
 *     one either; a script is a module `src` tag with an empty body, so no
 *     inline script or JSON-LD ships, and no `<style>` ships at all;
 *   - every string in the manifest is a naming key with the name, or a
 *     neutral key matching its pattern; anything else is a finding.
 * The isolation text pass searches both files for other campaigns' and
 * must-not-ship names besides.
 */
export function siteIdentityFindings(siteDir: string, name: string): string[] {
  const allowed = new Set([name, description(name), `${description(name)}.`]);
  const out: string[] = [];
  const show = (v: unknown) => JSON.stringify(v);
  let html: string;
  try {
    html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
  } catch {
    return ["index.html: missing, so the site's name can't be checked"];
  }

  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(tag);
    const key = a.charset !== undefined ? "charset" : (a.name ?? a.property ?? a["http-equiv"]);
    const value = key === "charset" ? a.charset.toLowerCase() : a.content;
    if (key === undefined) {
      out.push(`index.html ${tag}: a meta naming no key`);
    } else if (NAMING_META.has(key)) {
      if (!allowed.has(value ?? "")) {
        out.push(`index.html ${key} is ${show(value)}, not this campaign's own name ("${name}")`);
      }
    } else if (key in NEUTRAL_META) {
      if (value !== NEUTRAL_META[key]) {
        out.push(`index.html ${key} is ${show(value)}, not ${show(NEUTRAL_META[key])}`);
      }
    } else {
      out.push(`index.html ${key}: a meta the site build doesn't write (${show(value)})`);
    }
  }

  const markup = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const [tag, tagName] of markup.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*>/g)) {
    const t = tagName.toLowerCase();
    if (t === "meta") continue;
    const allowedAttrs = TAG_ATTRS[t];
    if (!allowedAttrs) {
      out.push(`index.html ${tag}: a <${t}> the site build doesn't write`);
      continue;
    }
    for (const [k, v] of Object.entries(attributes(tag))) {
      if (!(k in allowedAttrs) || !allowedAttrs[k].test(v)) {
        out.push(`index.html <${t}> ${k}=${show(v)}: not a value the site build writes`);
      }
    }
  }
  for (const [script, body] of markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (body.trim() || attributes(script.slice(0, script.indexOf(">") + 1)).src === undefined) {
      out.push(`index.html ${script.slice(0, 80)}: an inline script; only a module src tag ships`);
    }
  }

  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  if (titles.length === 0) out.push("index.html: no title");
  for (const t of titles) {
    const v = unescapeHtml(t[1]).trim();
    if (!allowed.has(v)) out.push(`index.html title is ${show(v)}, not this campaign's own name`);
  }
  const text = unescapeHtml(
    markup
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (text) out.push(`index.html text outside the title: ${show(text)}`);

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(siteDir, "manifest.webmanifest"), "utf8"));
  } catch (e) {
    return [...out, `manifest.webmanifest: missing or not JSON (${(e as Error).message})`];
  }
  const m = manifest as Record<string, unknown>;
  for (const k of ["name", "short_name"]) {
    if (m?.[k] === undefined) out.push(`manifest.webmanifest: no ${k}`);
  }
  const walk = (v: unknown, where: string, key: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`, key));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k, k);
    } else if (typeof v === "string") {
      if (NAMING_MANIFEST.has(key) && where === key) {
        if (!allowed.has(v)) {
          out.push(`manifest.webmanifest ${key} is ${show(v)}, not this campaign's own name`);
        }
      } else if (!(key in NEUTRAL_MANIFEST) || !NEUTRAL_MANIFEST[key].test(v)) {
        out.push(`manifest.webmanifest ${where} is ${show(v)}: not a value the site build writes`);
      }
    }
  };
  walk(manifest, "", "");
  return out;
}
