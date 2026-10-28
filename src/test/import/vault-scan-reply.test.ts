/**
 * eval-2026-10/13: the client reads the vault-scan route's real replies.
 * The route sends `{ files }` on 200 and `{ error }` with a status otherwise
 * (`scripts/vite-plugin-atlas-save.ts`, GET /__atlas/vault-scan). It never
 * sends `ok` in the body.
 */
import { describe, it, expect } from "vitest";
import { readVaultScanReply } from "@/atlas/sync/devEndpointPort";

const reply = (status: number, body: unknown) =>
  readVaultScanReply(new Response(JSON.stringify(body), { status }));

describe("readVaultScanReply", () => {
  it("accepts a 200 with files and no ok field", async () => {
    expect(await reply(200, { files: { "a.md": "x" } })).toEqual({
      ok: true,
      files: { "a.md": "x" },
    });
  });

  it("passes the route's status and error through", async () => {
    expect(await reply(413, { error: "VaultTooLarge" })).toEqual({
      ok: false,
      status: 413,
      error: "VaultTooLarge",
    });
    expect(await reply(400, { error: "MissingVaultRoot" })).toMatchObject({ status: 400 });
  });

  it("refuses a 200 without files, and a body that isn't JSON", async () => {
    expect((await reply(200, {})).ok).toBe(false);
    const bad = await readVaultScanReply(new Response("<html>", { status: 502 }));
    expect(bad).toEqual({ ok: false, status: 502, error: "HTTP 502" });
  });
});
