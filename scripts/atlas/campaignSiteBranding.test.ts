/**
 * R-19 review: a campaign site names its own campaign, never the v1 world.
 * The site build reads the campaign's name from its staged store and puts it
 * in index.html's head and the PWA manifest; a v1 build changes nothing.
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CAMPAIGN_PUBLIC_DIR_ENV } from "./campaignSitePublicDir";
import { brandIndexHtml, brandManifest, campaignSiteName } from "./campaignSiteBranding";

const ROOT = path.resolve(__dirname, "..", "..");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const tmp: string[] = [];
afterAll(() => {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

function staged(atlas: unknown): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "branding-"));
  tmp.push(d);
  fs.mkdirSync(path.join(d, "atlas"));
  fs.writeFileSync(path.join(d, "atlas", "atlas.json"), JSON.stringify(atlas));
  return d;
}

describe("campaignSiteName", () => {
  it("is null for a build with no campaign public dir (v1, editor)", () => {
    expect(campaignSiteName({})).toBeNull();
  });

  it("reads the campaign's own name from the staged store", () => {
    const d = staged({ campaign: { id: "main", name: "Lantern Road" }, worlds: [] });
    expect(campaignSiteName({ [CAMPAIGN_PUBLIC_DIR_ENV]: d })).toBe("Lantern Road");
  });

  it("fails closed when the staged store names no campaign", () => {
    const d = staged({ worlds: [{ id: "w", name: "W" }] });
    expect(() => campaignSiteName({ [CAMPAIGN_PUBLIC_DIR_ENV]: d })).toThrow(/campaign/);
  });
});

describe("brandIndexHtml", () => {
  const out = brandIndexHtml(INDEX_HTML, "Lantern Road");

  it("leaves no trace of the v1 world's name", () => {
    expect(out).not.toMatch(/Astrath/i);
  });

  it("names the campaign in the title, description, og, twitter and apple tags", () => {
    expect(out).toContain("<title>Lantern Road</title>");
    expect(out).toContain('<meta name="apple-mobile-web-app-title" content="Lantern Road" />');
    for (const tag of [
      'name="description"',
      'property="og:title"',
      'name="twitter:title"',
      'property="og:description"',
      'name="twitter:description"',
    ]) {
      const m = out.match(new RegExp(`<meta ${tag} content="([^"]*)"`));
      expect(m?.[1], tag).toContain("Lantern Road");
    }
  });

  it("drops the v1 share image", () => {
    expect(out).not.toMatch(/og:image|twitter:image/);
  });

  it("escapes the name", () => {
    const x = brandIndexHtml(INDEX_HTML, `A "B" <C> & D`);
    expect(x).toContain("<title>A &quot;B&quot; &lt;C&gt; &amp; D</title>");
    expect(x).not.toContain("<C>");
  });

  it("fails closed when a tag it must rewrite is missing", () => {
    const broken = INDEX_HTML.replace(/<meta property="og:title"[^>]*>/, "");
    expect(() => brandIndexHtml(broken, "Lantern Road")).toThrow(/og:title/);
  });
});

describe("brandManifest", () => {
  it("names the campaign", () => {
    const m = brandManifest("Lantern Road");
    expect(m.name).toBe("Lantern Road");
    expect(m.short_name).toBe("Lantern Road");
    expect(m.description).toContain("Lantern Road");
    expect(JSON.stringify(m)).not.toMatch(/Astrath/i);
  });
});
