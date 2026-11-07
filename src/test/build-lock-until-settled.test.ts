/**
 * eval-2026-10/37: a save whose rebuild passes the route's timeout answers the
 * DM ("saved, not yet rebuilt"), but the shared build lock stays taken until
 * the build itself settles, so a publish-check can't start a second build
 * alongside it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import type { BuildResult } from "../../scripts/build-atlas";

const runBuild = vi.hoisted(() => vi.fn<() => Promise<BuildResult>>());
vi.mock("../../scripts/build-atlas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/build-atlas")>()),
  runBuild,
}));

import { DEV_ROUTES, createDevRouter } from "../../scripts/vite-plugin-atlas-save";
import { DEV_API_PATHS } from "../../scripts/atlas/devRoutes";
import { isBuildInFlight, __resetBuildLockForTests } from "../../scripts/atlas/buildLock";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Sends one request through the router; resolves with the status and JSON body. */
function send(
  router: ReturnType<typeof createDevRouter>,
  urlPath: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve) => {
    const req = new PassThrough() as unknown as IncomingMessage & PassThrough;
    Object.assign(req, {
      method: "POST",
      url: urlPath,
      headers: { host: "localhost:5173", origin: "http://localhost:5173" },
      socket: { remoteAddress: "127.0.0.1" },
    });
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader() {},
      end(chunk?: string) {
        resolve({ status: this.statusCode, json: chunk ? JSON.parse(chunk) : undefined });
      },
    };
    router(req, res as never, () => resolve({ status: 404, json: "next" }));
    req.end(JSON.stringify(body));
  });
}

let root: string;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-lock-"));
  runBuild.mockReset();
  __resetBuildLockForTests();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
  vi.useRealTimers();
  warn.mockRestore();
  __resetBuildLockForTests();
  await fs.rm(root, { recursive: true, force: true });
});

const SAVE_BODY = {
  rebuild: true,
  files: [
    {
      path: "content/world/npc.md",
      content: "---\nname: Npc\n---\nHello\n",
      kind: "entity-md",
      baseHash: null,
    },
  ],
};

async function saveThatOutlivesTheTimeout(
  settle: (d: ReturnType<typeof deferred<BuildResult>>) => void,
) {
  const build = deferred<BuildResult>();
  runBuild.mockReturnValueOnce(build.promise);
  const router = createDevRouter(DEV_ROUTES, root);

  const save = send(router, DEV_API_PATHS.save, SAVE_BODY);
  await vi.waitFor(() => expect(runBuild).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(60_000);

  // The DM hears back: files saved, atlas not rebuilt (yet).
  const reply = await save;
  expect(reply.status).toBe(207);
  expect(reply.json).toMatchObject({ saved: 1, rebuilt: false });
  expect(await fs.readFile(path.join(root, "content/world/npc.md"), "utf8")).toContain("Hello");

  // The first build is still running: the lock stays taken, a second build is refused.
  expect(isBuildInFlight()).toBe(true);
  const check = await send(router, DEV_API_PATHS.publishCheck, {});
  expect(check).toEqual({
    status: 423,
    json: { error: "Locked", detail: "a previous build is still running" },
  });
  expect(runBuild).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("still running"));

  settle(build);
  await vi.waitFor(() => expect(isBuildInFlight()).toBe(false));
}

describe("build lock outlives a timed-out save rebuild", () => {
  it("is released once the slow build succeeds", async () => {
    await saveThatOutlivesTheTimeout((b) =>
      b.resolve({ ok: true, exitCode: 0, durationMs: 61_000 }),
    );
  });

  it("is released once the slow build fails", async () => {
    await saveThatOutlivesTheTimeout((b) => b.reject(new Error("boom")));
  });
});

describe("build lock outlives a timed-out publish-check player build", () => {
  it("refuses a save with rebuild until the player build settles, then lets it through", async () => {
    const build = deferred<BuildResult>();
    runBuild.mockReturnValueOnce(build.promise);
    const router = createDevRouter(DEV_ROUTES, root);

    const check = send(router, DEV_API_PATHS.publishCheck, {});
    await vi.waitFor(() => expect(runBuild).toHaveBeenCalledTimes(1));
    expect(runBuild).toHaveBeenCalledWith({ player: true, strict: true });
    await vi.advanceTimersByTimeAsync(60_000);

    const checkReply = await check;
    expect(checkReply.status).toBe(200);
    expect(checkReply.json).toMatchObject({ verdict: "build-failed" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("still running"));

    // The player build is still running: a save with rebuild is refused and starts no build.
    expect(await send(router, DEV_API_PATHS.save, SAVE_BODY)).toEqual({
      status: 423,
      json: { error: "Locked", detail: "a previous build is still running" },
    });
    expect(runBuild).toHaveBeenCalledTimes(1);

    build.resolve({ ok: true, exitCode: 0, durationMs: 61_000 });
    await vi.waitFor(() => expect(isBuildInFlight()).toBe(false));

    runBuild.mockResolvedValueOnce({ ok: true, exitCode: 0, durationMs: 5 });
    const save = await send(router, DEV_API_PATHS.save, SAVE_BODY);
    expect(save.status).toBe(200);
    expect(save.json).toMatchObject({ saved: 1, rebuilt: true });
    expect(runBuild).toHaveBeenCalledTimes(2);
    expect(isBuildInFlight()).toBe(false);
  });
});
