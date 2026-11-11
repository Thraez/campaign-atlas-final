// @vitest-environment node
/**
 * R-31: the dev-only campaign store server behind `/__canvas`. Read-only, no
 * listing, no traversal, ids from the campaign list only, loopback only, and
 * absent from player builds.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Plugin, UserConfig } from "vite";
import {
  createCampaignStoreMiddleware,
  loadCampaignStores,
  resolveStorePath,
  type StoreList,
} from "../../../scripts/vite-plugin-campaign-stores";
import { DEV_CANVAS_PATHS } from "../../../scripts/atlas/devRoutes";
import { EDITOR_CODE_FINGERPRINTS } from "../../../scripts/check-no-secrets";

const ROOT = path.resolve(__dirname, "../../..");
let tmp: string;
let stores: StoreList;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-r31-stores-"));
  const main = path.join(tmp, "main", "atlas");
  fs.mkdirSync(path.join(main, "assets"), { recursive: true });
  fs.writeFileSync(path.join(main, "atlas.json"), '{"ok":true}');
  fs.writeFileSync(path.join(main, "assets", "a.png"), "PNG");
  fs.writeFileSync(path.join(main, "notes.txt"), "no");
  fs.writeFileSync(path.join(tmp, "secret.json"), '{"dm":true}');
  fs.mkdirSync(path.join(main, "dir.json"));
  fs.symlinkSync(path.join(tmp, "secret.json"), path.join(main, "escape.json"));
  stores = new Map([["main", main]]);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

interface Reply {
  status: number;
  headers: Record<string, string>;
  body: string;
  passed: boolean;
}

function call(
  url: string,
  opts: { method?: string; remote?: string; host?: string; origin?: string } = {},
) {
  return new Promise<Reply>((resolve) => {
    const req = {
      url,
      method: opts.method ?? "GET",
      headers: {
        host: opts.host ?? "127.0.0.1:8131",
        ...(opts.origin ? { origin: opts.origin } : {}),
      },
      socket: { remoteAddress: opts.remote ?? "127.0.0.1" },
    } as unknown as IncomingMessage;
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    const res = Object.assign(sink, {
      statusCode: 200,
      headersSent: false,
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      },
      writeHead: (s: number) => {
        res.statusCode = s;
      },
    }) as unknown as ServerResponse & { statusCode: number };
    sink.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    sink.on("finish", () =>
      resolve({
        status: res.statusCode,
        headers,
        body: Buffer.concat(chunks).toString(),
        passed: false,
      }),
    );
    createCampaignStoreMiddleware(() => stores)(req, res, () =>
      resolve({ status: 0, headers, body: "", passed: true }),
    );
  });
}

const P = DEV_CANVAS_PATHS.campaignStorePrefix;

describe("campaign store server", () => {
  it("lists campaign ids, not files", async () => {
    const r = await call(DEV_CANVAS_PATHS.campaignStores);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ campaigns: ["main"] });
  });

  it("serves a store file read-only, with its type and no-store", async () => {
    const r = await call(`${P}main/atlas.json`);
    expect(r.status).toBe(200);
    expect(r.body).toBe('{"ok":true}');
    expect(r.headers["content-type"]).toMatch(/^application\/json/);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    const img = await call(`${P}main/assets/a.png`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
  });

  it.each([
    ["traversal", `${P}main/../../secret.json`],
    ["encoded dots", `${P}main/%2e%2e/%2e%2e/secret.json`],
    ["encoded slash", `${P}main/..%2F..%2Fsecret.json`],
    ["encoded backslash", `${P}main/..%5C..%5Csecret.json`],
    ["NUL", `${P}main/atlas.json%00.png`],
    ["bad encoding", `${P}main/%E0%A4%A.json`],
    ["store root (listing)", `${P}main/`],
    ["a folder (listing)", `${P}main/assets/`],
    ["a folder named like a file", `${P}main/dir.json`],
    ["trailing slash", `${P}main/atlas.json/`],
    ["unknown campaign", `${P}other/atlas.json`],
    ["prototype key as id", `${P}__proto__/atlas.json`],
    ["id only", `${P}main`],
    ["disallowed type", `${P}main/notes.txt`],
    ["missing file", `${P}main/nope.json`],
    ["symlink out of the store", `${P}main/escape.json`],
  ])("404s %s", async (_label, url) => {
    const r = await call(url);
    expect(r.status).toBe(404);
    expect(r.body).not.toContain("dm");
  });

  it("refuses a non-loopback request", async () => {
    const r = await call(`${P}main/atlas.json`, { remote: "192.168.1.20" });
    expect(r.status).toBe(403);
    const list = await call(DEV_CANVAS_PATHS.campaignStores, { remote: "10.0.0.2" });
    expect(list.status).toBe(403);
  });

  it("is read-only: 405 for anything but GET and HEAD", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(
        (await call(`${P}main/atlas.json`, { method, origin: "http://127.0.0.1:8131" })).status,
        method,
      ).toBe(405);
    }
    const head = await call(`${P}main/atlas.json`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
  });

  it("hands every other path on to Vite", async () => {
    expect((await call("/__canvas?c=main")).passed).toBe(true);
    expect((await call("/atlas/atlas.json")).passed).toBe(true);
  });

  it("resolveStorePath keeps every answer inside the store", () => {
    const hit = resolveStorePath(stores, "main/assets/a.png");
    expect(hit?.file).toBe(path.join(stores.get("main")!, "assets", "a.png"));
    expect(resolveStorePath(stores, "main/assets/../../../secret.json")).toBeNull();
  });

  it("reads the campaign list from the v2 config", () => {
    const real = loadCampaignStores(ROOT);
    expect([...real.keys()].sort()).toEqual(["main", "sandbox"]);
    expect(real.get("main")).toBe(path.join(ROOT, ".atlas-campaigns", "main", "atlas"));
  });
});

describe("the store server and /__canvas stay out of player builds", () => {
  const pluginNames = async (mode: string) => {
    // Loaded by path so the app typecheck doesn't pull vite.config.ts into its program.
    const configFile = path.join(ROOT, "vite.config.ts");
    const { default: config } = (await import(/* @vite-ignore */ configFile)) as {
      default: UserConfig | ((env: { mode: string; command: string }) => UserConfig);
    };
    const resolved = (
      typeof config === "function"
        ? await config({ mode, command: mode === "development" ? "serve" : "build" })
        : config
    ) as UserConfig;
    return (resolved.plugins ?? [])
      .flat(Infinity as 1)
      .filter((p): p is Plugin => !!p && typeof p === "object" && "name" in p)
      .map((p) => p.name);
  };

  it("the plugin is registered for the dev editor, not for a production build", async () => {
    const prev = process.env.INCLUDE_EDITOR;
    delete process.env.INCLUDE_EDITOR;
    try {
      expect(await pluginNames("development")).toContain("atlas-campaign-stores");
      expect(await pluginNames("production")).not.toContain("atlas-campaign-stores");
    } finally {
      if (prev !== undefined) process.env.INCLUDE_EDITOR = prev;
    }
  }, 60_000);

  it("its paths are editor fingerprints, so the dist scan fails a player bundle that has them", () => {
    for (const p of Object.values(DEV_CANVAS_PATHS)) expect(EDITOR_CODE_FINGERPRINTS).toContain(p);
  });
});
