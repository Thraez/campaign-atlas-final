import { describe, it, expect } from "vitest";
import { encryptSecret } from "@/atlas/secrets/secretCrypto";
import { revealToHtml } from "@/atlas/secrets/revealSecret";
import type { PlayerSecret } from "@/atlas/content/schema";

it("decrypts and renders revealed markdown as sanitized HTML", async () => {
  const blob = await encryptSecret("**bold** and a [link](https://x.test)", "k");
  const secret: PlayerSecret = { id: "s", lockType: "password", ...blob };
  const html = await revealToHtml(secret, "k");
  expect(html).not.toBeNull();
  expect(html!).toContain("<strong>bold</strong>");
});

it("returns null on a wrong passphrase", async () => {
  const blob = await encryptSecret("x", "k");
  const secret: PlayerSecret = { id: "s", lockType: "password", ...blob };
  expect(await revealToHtml(secret, "wrong")).toBeNull();
});

it("neutralizes a script tag in a decrypted reveal", async () => {
  const blob = await encryptSecret("<scr" + "ipt>alert(1)</scr" + "ipt>safe", "k");
  const secret: PlayerSecret = { id: "s", lockType: "password", ...blob };
  const html = await revealToHtml(secret, "k");
  expect(html!.toLowerCase()).not.toContain("<scr" + "ipt");
});

describe("revealToHtml teaser field is not included", () => {
  it("teaser on the blob does not appear in the output (it is the DM's hint, not the reveal)", async () => {
    const blob = await encryptSecret("actual content", "k");
    const secret: PlayerSecret = { id: "s", lockType: "password", teaser: "a public hint", ...blob };
    const html = await revealToHtml(secret, "k");
    expect(html).toContain("actual content");
    expect(html).not.toContain("a public hint");
  });
});
