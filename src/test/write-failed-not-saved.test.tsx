/**
 * Eval-2026-10 ticket 33: a failed, rolled-back write never reads as a save.
 *
 * When one file in a Save batch cannot be written, the endpoint rolls the
 * batch back and answers 207 `{ error: "WriteFailed", partialWrite: true,
 * saved: 0, rolledBack, failedPath, writeError }`. 207 passes `res.ok`, so the
 * client used to hand it to callers as a successful `LocalSaveResult`.
 *
 * These tests drive the REAL dev router and save handler on a temp dir, with
 * a write forced to fail (a plain file sits where a folder must go).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DEV_ROUTES, createDevRouter } from "../../scripts/vite-plugin-atlas-save";
import {
  saveAtlasPatchToLocalFs,
  LocalSaveError,
  WriteFailedError,
  hashContent,
  type FileChange,
} from "@/atlas/save/localFsSave";
import { DiffPreviewModal } from "@/atlas/save/DiffPreviewModal";

const OK_PATH = "content/world/notes/ok.md";
const BLOCKED_PATH = "content/world/blocked/cannot-write.md";

let tmp: string;
let server: http.Server | undefined;
let port = 0;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-write-failed-"));
  const okAbs = path.join(tmp, OK_PATH);
  fs.mkdirSync(path.dirname(okAbs), { recursive: true });
  fs.writeFileSync(okAbs, "v1");
  // A plain file where the second write needs a folder: its mkdir fails.
  fs.writeFileSync(path.join(tmp, "content/world/blocked"), "not-a-directory");

  const router = createDevRouter(DEV_ROUTES, tmp);
  server = http.createServer((req, res) =>
    router(req, res, () => {
      res.statusCode = 404;
      res.end("next");
    }),
  );
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A `fetch` that sends the client's request to the real dev router, as the browser would. */
const fetchToDevServer = ((url: string, init?: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    const payload = String(init?.body ?? "");
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: init?.method ?? "GET",
        path: url,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(payload)),
          Origin: `http://localhost:${port}`,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (text += c));
        res.on("end", () => resolve(new Response(text, { status: res.statusCode ?? 0 })));
      },
    );
    req.on("error", reject);
    req.end(payload);
  })) as unknown as typeof fetch;

async function failingBatch(): Promise<FileChange[]> {
  return [
    { path: OK_PATH, content: "v2", kind: "entity-md", baseHash: await hashContent("v1") },
    { path: BLOCKED_PATH, content: "x", kind: "entity-md", baseHash: null },
  ];
}

describe("a rolled-back write through the real save handler", () => {
  it("reaches the client as WriteFailedError, not a save result", async () => {
    const outcome = await saveAtlasPatchToLocalFs(await failingBatch(), {
      fetchFn: fetchToDevServer,
    }).catch((e: unknown) => e);

    expect(outcome).toBeInstanceOf(LocalSaveError);
    expect(outcome).toBeInstanceOf(WriteFailedError);
    const err = outcome as WriteFailedError;
    expect(err.failedPath).toBe(BLOCKED_PATH);
    expect(err.rolledBack).toBe(1);
    // The DM reads the message: it names the file and says nothing was saved.
    expect(err.message).toContain(BLOCKED_PATH);
    expect(err.message).toMatch(/nothing was saved/i);
    // And the server really did roll back.
    expect(fs.readFileSync(path.join(tmp, OK_PATH), "utf8")).toBe("v1");
  });
});

describe("DiffPreviewModal on a rolled-back write", () => {
  it("keeps the drafts (no onSaved) and tells the DM which file failed", async () => {
    vi.stubGlobal("fetch", fetchToDevServer);
    const onSaved = vi.fn();
    const onWriteFailed = vi.fn();
    render(
      <DiffPreviewModal
        open
        changes={await failingBatch()}
        onSaved={onSaved}
        onWriteFailed={onWriteFailed}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));

    await waitFor(() => expect(onWriteFailed).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onWriteFailed.mock.calls[0][0]).toContain(BLOCKED_PATH);
    expect(await screen.findByText("Save failed.")).toBeTruthy();
    expect(screen.queryByText(/Wrote \d+ file/)).toBeNull();
  });
});
