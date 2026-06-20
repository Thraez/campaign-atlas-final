import { it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

it("keeps data-secret-id on a span", () => {
  const out = sanitizeAtlasHtml('<span data-secret-id="signet"></span>');
  expect(out).toContain('data-secret-id="signet"');
});

it("keeps data-lock-type on a span", () => {
  const out = sanitizeAtlasHtml('<span data-lock-type="password"></span>');
  expect(out).toContain('data-lock-type="password"');
});
