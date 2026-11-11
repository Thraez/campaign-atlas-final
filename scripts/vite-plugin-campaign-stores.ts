/**
 * Dev-server plugin: serves the v2 campaign stores read-only to the shared
 * canvas's dev harness (`/__canvas?c=<id>`, R-31).
 *
 *   GET /__atlas/campaign-stores           → { campaigns: ["main", ...] }
 *   GET /__atlas/campaign-store/<id>/<f>   → `<outputDir>/<id>/atlas/<f>`
 *
 * Rules:
 * - dev server only (`apply: "serve"`), and vite.config.ts registers it only
 *   when the editor is included; a player build never has it (its paths are
 *   editor fingerprints in scripts/check-no-secrets.ts);
 * - loopback only, through the save plugin's `rejectNonLoopback`;
 * - GET and HEAD only; `<id>` must be a campaign of the v2 config's loaded
 *   model (`campaignArtifacts`, the list the publish and the scans use);
 * - no directory listing and nothing outside the store dir: every path
 *   segment is checked after decoding, the resolved path and its real path
 *   (symlinks followed) must both sit inside the store's real dir, the target
 *   must be a regular file, and only known store file types are served.
 *
 * The config is `atlas.next.config.json` (the v2 test world): build the stores
 * with `npm run atlas:publish:next` first.
 */
import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DEV_CANVAS_PATHS } from "./atlas/devRoutes";
import { LEGACY_OUTPUT, campaignArtifacts } from "./atlas/scanRegistry";
import { rejectNonLoopback } from "./vite-plugin-atlas-save";

export const CAMPAIGN_STORE_CONFIG = "atlas.next.config.json";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

/** Campaign id → its store dir (absolute). */
export type StoreList = ReadonlyMap<string, string>;

/** The v2 campaigns' stores, from the config's loaded model. Throws when it can't be loaded. */
export function loadCampaignStores(root: string, configFile = CAMPAIGN_STORE_CONFIG): StoreList {
  const configPath = path.resolve(root, configFile);
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as { contentRoot?: unknown };
  if (typeof cfg.contentRoot !== "string" || cfg.contentRoot.trim() === "") {
    throw new Error(`${configFile} names no contentRoot`);
  }
  const contentDir = path.resolve(root, cfg.contentRoot);
  const stores = new Map<string, string>();
  for (const a of campaignArtifacts({ root, configPath, contentDir })) {
    if (a.layout === "store" && a.campaign !== LEGACY_OUTPUT) stores.set(a.campaign, a.dir);
  }
  return stores;
}

/**
 * The file a store URL names, or null. `rest` is the still-encoded path after
 * the prefix: `<id>/<segments...>`. Pure: no file-system access.
 */
export function resolveStorePath(
  stores: StoreList,
  rest: string,
): { file: string; storeDir: string } | null {
  const raw = rest.split("/");
  if (raw.length < 2) return null;
  let segs: string[];
  try {
    segs = raw.map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  // An empty segment is a trailing slash (a listing) or `//`; a decoded `/`, `\`
  // or NUL would smuggle a separator in.
  if (segs.some((s) => s === "" || s === "." || s === ".." || /[/\\\0]/.test(s))) return null;
  const [id, ...parts] = segs;
  const dir = stores.get(id);
  if (!dir) return null;
  if (!CONTENT_TYPES[path.extname(parts[parts.length - 1]).toLowerCase()]) return null;
  const base = path.resolve(dir);
  const abs = path.resolve(base, ...parts);
  return abs.startsWith(base + path.sep) ? { file: abs, storeDir: base } : null;
}

/** `abs` as served: a regular file whose real path is inside the store's real dir; else null. */
function realStoreFile(storeDir: string, abs: string): string | null {
  try {
    const realBase = fs.realpathSync(storeDir);
    const real = fs.realpathSync(abs);
    if (!real.startsWith(realBase + path.sep)) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function createCampaignStoreMiddleware(
  getStores: () => StoreList,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    // The raw path, not a parsed URL: URL parsing folds `..` and `%2e%2e`
    // away, which would hand a traversal attempt on to Vite instead of
    // refusing it here.
    const p = (req.url ?? "/").split(/[?#]/)[0];
    const isList = p === DEV_CANVAS_PATHS.campaignStores;
    const isStore = p.startsWith(DEV_CANVAS_PATHS.campaignStorePrefix);
    if (!isList && !isStore) return next();
    if (rejectNonLoopback(req, res)) return;
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "MethodNotAllowed" });
      return;
    }
    let stores: StoreList;
    try {
      stores = getStores();
    } catch (e) {
      sendJson(res, 500, {
        error: "NoCampaigns",
        detail: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    if (isList) {
      sendJson(res, 200, { campaigns: [...stores.keys()] });
      return;
    }
    const rest = p.slice(DEV_CANVAS_PATHS.campaignStorePrefix.length);
    const hit = resolveStorePath(stores, rest);
    const file = hit ? realStoreFile(hit.storeDir, hit.file) : null;
    if (!file) {
      sendJson(res, 404, { error: "NotFound" });
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", CONTENT_TYPES[path.extname(file).toLowerCase()]);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file)
      .on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "ReadFailed" });
        else res.destroy();
      })
      .pipe(res);
  };
}

export function campaignStoresPlugin(): Plugin {
  return {
    name: "atlas-campaign-stores",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      // Loaded on first use; the list endpoint reloads it, so a new campaign
      // shows up without a restart.
      let cached: StoreList | null = null;
      const middleware = createCampaignStoreMiddleware(() => (cached ??= loadCampaignStores(root)));
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] === DEV_CANVAS_PATHS.campaignStores) cached = null;
        middleware(req, res, next);
      });
    },
  };
}
