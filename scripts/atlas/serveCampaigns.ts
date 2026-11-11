/**
 * `atlas:serve:next` (R-34): the test world's campaign sites, served locally.
 *
 * Each campaign's built site (`dist-campaigns/<id>/`, as `atlas:publish:next`
 * wrote it, base `/`) gets its own port, so what a check opens is the
 * artifact a deploy would upload, unchanged. One more port serves the picker
 * (ux-flows P6): every campaign's name and a link to its port, and a
 * "Test site only" note. The picker lists every campaign, so it exists only
 * in this process's memory: it is never written to disk, and no site port
 * can serve it.
 *
 * Safety:
 *   - every server binds `127.0.0.1` and answers only a `Host` of
 *     `localhost:<port>` or `127.0.0.1:<port>` (no DNS rebinding);
 *   - a site port serves regular files under its own site dir only: a path
 *     with a backslash, a NUL, a `.`/`..` segment (raw or percent-encoded)
 *     or bad encoding is refused (400), and a file whose real path (links
 *     resolved) is outside the dir is refused (403);
 *   - no directory listing: a directory, like any unknown path, gets the
 *     site's `index.html` (the SPA fallback);
 *   - before serving, it refuses a missing or stale build (`planServe`) and
 *     any site holding the picker's marker or another campaign's name
 *     (`siteLeaks`).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { campaignArtifacts, LEGACY_OUTPUT } from "./scanRegistry.js";
import { loadAtlasModel, type LoadAtlasModelConfig } from "./loadAtlasModel.js";
import { listTextFiles } from "./playerArtifact.js";
import { findSecretsInText, isReportableName } from "../check-derived-secrets.js";
import { decodeForSearch } from "../check-campaign-isolation.js";

export const PUBLISH_COMMAND = "npm run atlas:publish:next";
export const DEFAULT_PICKER_PORT = 4300;
export const BIND_HOST = "127.0.0.1";
/** In the picker's HTML only; `siteLeaks` refuses a site that holds it. */
export const PICKER_MARKER = "atlas-local-campaign-picker";
export const PICKER_NOTE = "Test site only";

export interface ServedCampaign {
  id: string;
  name: string;
  /** `dist-campaigns/<id>`, absolute. */
  siteDir: string;
}

/** A missing or stale build: the message names `PUBLISH_COMMAND`. */
export class ServeRefusal extends Error {}

const refuse = (why: string): never => {
  throw new ServeRefusal(`serve: ${why}. Run \`${PUBLISH_COMMAND}\` first.`);
};

/** `--port <n>` / `--port=<n>`: the picker's port; campaign i gets `n + 1 + i`. */
export function parseServeArgs(argv: string[]): { port: number; configPath: string } {
  let port = DEFAULT_PICKER_PORT;
  let configPath = "atlas.next.config.json";
  const asPort = (v: string | undefined): number => {
    const n = Number(v);
    if (!v || !Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`--port needs a port number (got ${JSON.stringify(v)})`);
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") port = asPort(argv[++i]);
    else if (a.startsWith("--port=")) port = asPort(a.slice("--port=".length));
    else if (a === "--config") {
      const v = argv[++i];
      if (!v) throw new Error("--config needs a file");
      configPath = v;
    } else if (a.startsWith("--config=")) configPath = a.slice("--config=".length);
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return { port, configPath };
}

/** The newest file under `dir` (links not followed), or null when it holds none. */
function newestFile(dir: string): { file: string; mtimeMs: number } | null {
  let best: { file: string; mtimeMs: number } | null = null;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const m = fs.lstatSync(full).mtimeMs;
        if (!best || m > best.mtimeMs) best = { file: full, mtimeMs: m };
      }
    }
  };
  walk(dir);
  return best;
}

/**
 * The campaigns to serve, in content order, each with its built site dir.
 * Refuses (`ServeRefusal`) when `dist-campaigns/` is missing, a campaign the
 * content lists has no site (or no `atlas/atlas.json` in it), or a file under
 * the content root is newer than a site's `atlas/atlas.json`. Throws a plain
 * error when the config or content can't be loaded or isn't v2.
 */
export function planServe({
  root,
  configPath,
}: {
  root: string;
  configPath: string;
}): ServedCampaign[] {
  // The config as the loader reads it (v2 picks no world from it, R-13).
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as LoadAtlasModelConfig & {
    contentRoot: string;
  };
  const contentDir = path.resolve(path.dirname(configPath), cfg.contentRoot);
  // The dirs the publish builds and the scans read (one source).
  const sites = campaignArtifacts({ root, configPath, contentDir }).filter(
    (a) => a.layout === "built-site" && a.mustNotShip && a.campaign !== LEGACY_OUTPUT,
  );
  if (sites.length === 0) {
    throw new Error(
      `serve: ${path.relative(root, configPath)} is not v2 content, so it has no campaign sites`,
    );
  }
  const names = new Map(
    loadAtlasModel(contentDir, cfg, { root }).model.campaigns.map((c) => [c.id, c.name] as const),
  );
  const sitesRoot = path.join(root, "dist-campaigns");
  if (!fs.statSync(sitesRoot, { throwIfNoEntry: false })?.isDirectory()) {
    refuse("dist-campaigns/ is missing");
  }
  const newest = newestFile(contentDir);
  const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
  return sites.map((site) => {
    if (!fs.statSync(site.dir, { throwIfNoEntry: false })?.isDirectory()) {
      refuse(`campaign ${site.campaign} has no site dir ${site.label}`);
    }
    const atlasJson = path.join(site.dir, "atlas", "atlas.json");
    const built = fs.statSync(atlasJson, { throwIfNoEntry: false });
    if (!built?.isFile()) refuse(`${rel(atlasJson)} is missing`);
    if (newest && newest.mtimeMs > built!.mtimeMs) {
      refuse(`${rel(site.dir)} is stale: ${rel(newest.file)} is newer than ${rel(atlasJson)}`);
    }
    return {
      id: site.campaign,
      name: names.get(site.campaign) ?? site.campaign,
      siteDir: site.dir,
    };
  });
}

/**
 * What in `site`'s dir must not be there: the picker's marker or note, or
 * another campaign's name (whole words, any case, as written and decoded;
 * names too short or common to search are left to the isolation scan's
 * structural checks, as there). Fails closed on a dir it can't read.
 */
export function siteLeaks(site: ServedCampaign, all: ServedCampaign[]): string[] {
  const others = all
    .filter((c) => c.id !== site.id)
    .map((c) => c.name)
    .filter(isReportableName)
    .map((name) => ({ name, source: "campaigns", field: "title" as const }));
  const secrets = [
    ...others,
    { name: PICKER_MARKER, source: "picker", field: "title" as const },
    { name: PICKER_NOTE, source: "picker", field: "title" as const },
  ];
  const { files, unreadable } = listTextFiles(site.siteDir, "serve");
  const out = unreadable.map((d) => `${d}: can't be read`);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const hits = new Set(
      [
        ...findSecretsInText(text, secrets),
        ...findSecretsInText(decodeForSearch(text), secrets),
      ].map((s) => s.name),
    );
    for (const h of hits) out.push(`${file}: holds ${JSON.stringify(h)}`);
  }
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

/** The picker page (P6), in memory: each campaign's name and a link to its port. */
export function pickerHtml(campaigns: { name: string; port: number }[]): string {
  const items = campaigns
    .map(
      (c) =>
        `<li><a href="http://localhost:${c.port}/">${escapeHtml(c.name)}</a>` +
        ` <span class="port">localhost:${c.port}</span></li>`,
    )
    .join("\n      ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="${PICKER_MARKER}" content="1" />
    <meta name="robots" content="noindex" />
    <title>Choose a campaign</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem 1rem; background: #f6f3ec; color: #2a2620; }
      main { max-width: 32rem; margin: 0 auto; }
      .note { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; background: #e9dfc8; font-size: 0.85rem; }
      ul { list-style: none; padding: 0; }
      li { margin: 0.75rem 0; }
      a { font-size: 1.2rem; color: #6b3d12; }
      .port { color: #7a7064; font-size: 0.85rem; margin-left: 0.5rem; }
    </style>
  </head>
  <body>
    <main>
      <p class="note">${PICKER_NOTE}</p>
      <h1>Choose a campaign</h1>
      <ul>
      ${items}
      </ul>
    </main>
  </body>
</html>
`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

export type Resolved =
  { kind: "file"; file: string } | { kind: "refused"; status: 400 | 403 | 404; why: string };

const inside = (dir: string, p: string) => p === dir || p.startsWith(dir + path.sep);

/**
 * The file a request path names under `siteRoot` (a real path), or why not.
 * A path that names no regular file there (missing, a directory) resolves to
 * the site's `index.html`; one that tries to leave the dir is refused.
 */
export function resolveSitePath(siteRoot: string, rawUrl: string): Resolved {
  const bad = (why: string): Resolved => ({ kind: "refused", status: 400, why });
  if (!rawUrl.startsWith("/")) return bad("not an origin-form path");
  const rawPath = rawUrl.split(/[?#]/, 1)[0];
  if (/[\\\0]|%5c|%00/i.test(rawPath)) return bad("backslash or NUL");
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return bad("bad percent-encoding");
  }
  if (/[\\\0]/.test(decoded)) return bad("backslash or NUL");
  const segments = decoded.split("/").filter((s) => s !== "");
  // Checked raw and decoded: `%2e%2e` is `..`; a still-encoded `%252e%252e`
  // decodes to `%2e%2e`, a literal name that can't leave the dir, but is
  // refused too, so no layer that decodes twice can be tricked.
  if (segments.some((s) => s === "." || s === ".." || /^(%2e|\.)+$/i.test(s))) {
    return bad("a . or .. segment");
  }
  const fallback = (): Resolved => {
    const index = path.join(siteRoot, "index.html");
    let real: string;
    try {
      real = fs.realpathSync(index);
    } catch {
      return { kind: "refused", status: 404, why: "the site has no index.html" };
    }
    if (!inside(siteRoot, real) || !fs.statSync(real).isFile()) {
      return { kind: "refused", status: 403, why: "index.html is not a file in the site" };
    }
    return { kind: "file", file: real };
  };
  if (segments.length === 0) return fallback();
  const candidate = path.resolve(siteRoot, ...segments);
  if (!inside(siteRoot, candidate)) return { kind: "refused", status: 400, why: "outside" };
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    return fallback(); // missing: the SPA's route
  }
  if (!inside(siteRoot, real)) {
    return { kind: "refused", status: 403, why: "links outside the site" };
  }
  const st = fs.statSync(real);
  if (st.isFile()) return { kind: "file", file: real };
  if (st.isDirectory()) return fallback(); // never a listing
  return { kind: "refused", status: 404, why: "not a regular file" };
}

function allowedHost(req: http.IncomingMessage, port: number): boolean {
  const host = (req.headers.host ?? "").toLowerCase();
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}

function plain(res: http.ServerResponse, status: number, body: string, head: boolean): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(head ? undefined : body);
}

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, port: number) => void;

function guarded(handle: Handler): Handler {
  return (req, res, port) => {
    const head = req.method === "HEAD";
    if (!allowedHost(req, port)) return plain(res, 403, "Forbidden host\n", head);
    if (req.method !== "GET" && !head) {
      res.setHeader("Allow", "GET, HEAD");
      return plain(res, 405, "Method not allowed\n", false);
    }
    handle(req, res, port);
  };
}

/** A site port's handler: files of `siteDir` only, as built. */
export function siteHandler(siteDir: string): Handler {
  const siteRoot = fs.realpathSync(siteDir);
  return guarded((req, res) => {
    const head = req.method === "HEAD";
    const r = resolveSitePath(siteRoot, req.url ?? "/");
    if (r.kind === "refused") return plain(res, r.status, `${r.status}\n`, head);
    let body: Buffer;
    try {
      body = fs.readFileSync(r.file);
    } catch {
      return plain(res, 404, "404\n", head);
    }
    res.writeHead(200, {
      "Content-Type":
        CONTENT_TYPES[path.extname(r.file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": body.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(head ? undefined : body);
  });
}

/** The picker port's handler: the in-memory page at `/`, nothing else. */
export function pickerHandler(html: string): Handler {
  const body = Buffer.from(html, "utf8");
  return guarded((req, res) => {
    const head = req.method === "HEAD";
    const p = (req.url ?? "/").split(/[?#]/, 1)[0];
    if (p !== "/" && p !== "/index.html") return plain(res, 404, "404\n", head);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    });
    res.end(head ? undefined : body);
  });
}

function listen(handler: Handler, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) =>
      handler(req, res, (server.address() as AddressInfo).port),
    );
    server.once("error", reject);
    server.listen(port, BIND_HOST, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

export interface RunningServe {
  picker: number;
  campaigns: (ServedCampaign & { port: number })[];
  close(): Promise<void>;
}

/**
 * Start a site server per campaign (port `pickerPort + 1 + i`) and then the
 * picker (`pickerPort`). `pickerPort` 0 gives every server a free port (tests).
 * Refuses a site that `siteLeaks` flags before anything listens.
 */
export async function startServe(
  campaigns: ServedCampaign[],
  pickerPort: number,
): Promise<RunningServe> {
  const leaks = campaigns.flatMap((c) => siteLeaks(c, campaigns));
  if (leaks.length > 0) {
    throw new ServeRefusal(
      `serve: a campaign site holds what it must not:\n  ${leaks.join("\n  ")}\n` +
        `Rebuild with \`${PUBLISH_COMMAND}\` and check the isolation scan.`,
    );
  }
  const servers: http.Server[] = [];
  const close = () =>
    Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r())))).then(() => {});
  try {
    const served: (ServedCampaign & { port: number })[] = [];
    for (const [i, c] of campaigns.entries()) {
      const s = await listen(siteHandler(c.siteDir), pickerPort === 0 ? 0 : pickerPort + 1 + i);
      servers.push(s);
      served.push({ ...c, port: (s.address() as AddressInfo).port });
    }
    const picker = await listen(pickerHandler(pickerHtml(served)), pickerPort);
    servers.push(picker);
    return { picker: (picker.address() as AddressInfo).port, campaigns: served, close };
  } catch (e) {
    await close();
    throw e;
  }
}
