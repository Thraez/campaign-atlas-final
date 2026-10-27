import { describe, it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DEV_ROUTES,
  createDevRouter,
  devRouteRefusal,
  type DevRoute,
} from "../../scripts/vite-plugin-atlas-save";
import { DEV_API_PATHS, DEV_API_PREFIX } from "../../scripts/atlas/devRoutes";
import { EDITOR_CODE_FINGERPRINTS } from "../../scripts/check-no-secrets";
import {
  isBuildInFlight,
  releaseBuildLock,
  tryAcquireBuildLock,
} from "../../scripts/atlas/buildLock";

const WRITE_METHODS = new Set(["POST", "DELETE"]);

function mockReq(
  method: string,
  url: string,
  headers: { host?: string; origin?: string },
  remoteAddress: string,
): IncomingMessage {
  return { method, url, headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    ended: false,
    headersSent: false,
    setHeader() {},
    end(chunk?: string) {
      this.body = chunk;
      this.ended = true;
    },
  };
  return res;
}

/** Requests that must be refused: a LAN peer forging loopback headers, and a cross-origin page. */
function refusedRequests(route: DevRoute) {
  const cases = [
    {
      label: "LAN peer with forged loopback Host/Origin",
      headers: { host: "localhost:8080", origin: "http://localhost:8080" },
      remote: "192.168.1.42",
    },
    {
      label: "loopback peer, cross-origin page",
      headers: { host: "localhost:8080", origin: "https://evil.example" },
      remote: "127.0.0.1",
    },
    {
      label: "loopback peer, LAN Host header",
      headers: { host: "192.168.1.42:8080", origin: "http://localhost:8080" },
      remote: "127.0.0.1",
    },
  ];
  if (WRITE_METHODS.has(route.method)) {
    cases.push({
      label: "loopback peer, write without Origin",
      headers: { host: "localhost:8080" } as { host: string; origin: string },
      remote: "127.0.0.1",
    });
  }
  return cases;
}

describe("dev route table: every route refuses a non-loopback request", () => {
  for (const route of DEV_ROUTES) {
    for (const c of refusedRequests(route)) {
      it(`${route.method} ${route.path}: ${c.label}`, async () => {
        const handle = vi.fn(route.handle);
        const router = createDevRouter([{ ...route, handle }], "/nonexistent-root");
        const res = mockRes();
        const next = vi.fn();
        router(
          mockReq(route.method, `${route.path}?x=1`, c.headers, c.remote),
          res as unknown as ServerResponse,
          next,
        );
        await new Promise((r) => setTimeout(r, 0));
        expect(handle).not.toHaveBeenCalled();
        if (devRouteRefusal(route.path) === "forbid") {
          expect(res.statusCode).toBe(403);
          expect(JSON.parse(res.body ?? "")).toEqual({
            error: "Forbidden",
            detail: "loopback-only",
          });
          expect(next).not.toHaveBeenCalled();
        } else {
          // DM overlay of a player URL: hand on to Vite, which serves the player file.
          expect(res.ended).toBe(false);
          expect(next).toHaveBeenCalledOnce();
        }
      });
    }
  }

  it("refuses unknown /__atlas/* paths and wrong methods too", () => {
    const router = createDevRouter(DEV_ROUTES, "/nonexistent-root");
    for (const [method, url] of [
      ["GET", "/__atlas/not-a-route"],
      ["GET", DEV_API_PATHS.save],
      ["PUT", DEV_API_PATHS.read],
    ]) {
      const res = mockRes();
      const next = vi.fn();
      router(
        mockReq(method, url, { host: "localhost", origin: "http://localhost" }, "10.0.0.5"),
        res as unknown as ServerResponse,
        next,
      );
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("only the player-URL overlays sit outside /__atlas/", () => {
    const outside = DEV_ROUTES.filter((r) => !r.path.startsWith(DEV_API_PREFIX)).map((r) => r.path);
    expect(outside.sort()).toEqual(["/atlas/atlas.json", "/atlas/search-index.json"]);
  });
});

describe("dev route table and the player-bundle fingerprints", () => {
  it("EDITOR_CODE_FINGERPRINTS lists every /__atlas/ route", () => {
    for (const route of DEV_ROUTES) {
      if (!route.path.startsWith(DEV_API_PREFIX)) continue;
      expect(EDITOR_CODE_FINGERPRINTS).toContain(route.path);
    }
  });

  it("every path in devRoutes.ts has a route", () => {
    const routed = new Set(DEV_ROUTES.map((r) => r.path));
    for (const p of Object.values(DEV_API_PATHS)) expect(routed.has(p)).toBe(true);
  });
});

// ── Over a real loopback socket ─────────────────────────────────────────────

let server: http.Server | undefined;

afterEach(async () => {
  releaseBuildLock();
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
});

async function listen(routes: readonly DevRoute[]): Promise<number> {
  const router = createDevRouter(routes, "/nonexistent-root");
  server = http.createServer((req, res) =>
    router(req, res, () => {
      res.statusCode = 404;
      res.end("next");
    }),
  );
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return (server.address() as AddressInfo).port;
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: { chunks: string[]; chunked?: boolean },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Origin: `http://localhost:${port}` };
    const payload = body?.chunks.join("") ?? "";
    if (body && !body.chunked) headers["Content-Length"] = String(Buffer.byteLength(payload));
    const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    // The server may close the socket mid-upload after a 413; the response still arrives.
    req.on("error", (e) => (req.writableEnded ? undefined : reject(e)));
    if (body?.chunked) for (const c of body.chunks) req.write(c);
    else if (body) req.write(payload);
    req.end();
  });
}

function echoRoute(overrides: Partial<DevRoute>): DevRoute {
  return {
    method: "POST",
    path: "/__atlas/test-echo",
    takesBuildLock: false,
    body: { maxBytes: 64 },
    handle: async ({ body }) => ({ status: 200, json: { got: body } }),
    ...overrides,
  };
}

describe("dev route table: body cap, parsing and the build lock", () => {
  it("serves a loopback request and parses its JSON body", async () => {
    const port = await listen([echoRoute({})]);
    const r = await request(port, "POST", "/__atlas/test-echo", { chunks: ['{"a":1}'] });
    expect(r).toEqual({ status: 200, body: JSON.stringify({ got: { a: 1 } }) });
  });

  it("413s a body whose Content-Length is over the cap, without calling the handler", async () => {
    const handle = vi.fn(async () => ({ status: 200, json: {} }));
    const port = await listen([echoRoute({ handle })]);
    const r = await request(port, "POST", "/__atlas/test-echo", { chunks: ["x".repeat(1000)] });
    expect(r.status).toBe(413);
    expect(JSON.parse(r.body)).toEqual({
      error: "PayloadTooLarge",
      detail: "request body exceeds 64 bytes",
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("413s a chunked body once it passes the cap, and releases the build lock", async () => {
    const handle = vi.fn(async () => ({ status: 200, json: {} }));
    const port = await listen([echoRoute({ handle, takesBuildLock: true })]);
    const r = await request(port, "POST", "/__atlas/test-echo", {
      chunks: Array.from({ length: 20 }, () => "y".repeat(40)),
      chunked: true,
    });
    expect(r.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
    expect(isBuildInFlight()).toBe(false);
  });

  it("keeps each route's InvalidBody shape", async () => {
    const port = await listen(DEV_ROUTES);
    const save = await request(port, "POST", DEV_API_PATHS.save, { chunks: ["not json"] });
    expect(save).toEqual({
      status: 400,
      body: JSON.stringify({ error: "InvalidBody", detail: "request body is not JSON" }),
    });
    const local = await request(port, "POST", DEV_API_PATHS.localWrite, { chunks: ["{"] });
    expect(local).toEqual({ status: 400, body: JSON.stringify({ error: "InvalidBody" }) });
    expect(isBuildInFlight()).toBe(false);
  });

  it("423s a locked route while a build is in flight, and leaves the lock with its holder", async () => {
    const port = await listen(DEV_ROUTES);
    expect(tryAcquireBuildLock()).toBe(true);
    for (const p of [DEV_API_PATHS.save, DEV_API_PATHS.publishCheck, DEV_API_PATHS.publishPush]) {
      const r = await request(port, "POST", p, { chunks: ["{}"] });
      expect(r).toEqual({
        status: 423,
        body: JSON.stringify({ error: "Locked", detail: "another build is in flight" }),
      });
    }
    expect(isBuildInFlight()).toBe(true);
  });

  it("hands a loopback request with no matching method on to Vite", async () => {
    const port = await listen(DEV_ROUTES);
    const r = await request(port, "GET", DEV_API_PATHS.save);
    expect(r).toEqual({ status: 404, body: "next" });
  });
});
