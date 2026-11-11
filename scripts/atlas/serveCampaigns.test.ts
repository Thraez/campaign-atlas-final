/**
 * R-34: `atlas:serve:next` serves each campaign's built site on its own
 * 127.0.0.1 port, exactly as built, and a picker that exists only in memory.
 * Pins the refusals (missing or stale build), the path rules (no traversal,
 * raw or encoded, no backslashes, no links out, no listing, SPA fallback),
 * and that no site dir holds the picker or another campaign's name, before
 * and after serving.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  parseServeArgs,
  planServe,
  pickerHtml,
  resolveSitePath,
  siteLeaks,
  startServe,
  ServeRefusal,
  PICKER_MARKER,
  PICKER_NOTE,
  PUBLISH_COMMAND,
  type RunningServe,
  type ServedCampaign,
} from "./serveCampaigns";

const V2_CONTENT = path.resolve(__dirname, "../../src/test/fixtures/scan-registry/v2/content");

const temps: string[] = [];
afterAll(() => {
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
function tmp(label: string): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `serve-${label}-`)));
  temps.push(d);
  return d;
}

const OLD = new Date("2020-01-01T00:00:00Z");
/** When the fixture sites were "built": after the content, before the test's own change. */
const BUILT = new Date("2021-01-01T00:00:00Z");

function touchTree(dir: string, when: Date): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) touchTree(full, when);
    fs.utimesSync(full, when, when);
  }
}

/** A v2 root (campaigns `a` "Campaign A" and `b` "Campaign B") with both sites built. */
function builtRoot(): { root: string; configPath: string } {
  const root = tmp("root");
  fs.cpSync(V2_CONTENT, path.join(root, "content"), { recursive: true });
  touchTree(path.join(root, "content"), OLD);
  const configPath = path.join(root, "atlas.next.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      contentRoot: "content",
      outputDir: ".atlas-campaigns",
      include: ["**/*.md"],
      exclude: [],
    }),
  );
  for (const id of ["a", "b"]) {
    const site = path.join(root, "dist-campaigns", id);
    fs.mkdirSync(path.join(site, "atlas"), { recursive: true });
    fs.mkdirSync(path.join(site, "assets"), { recursive: true });
    fs.writeFileSync(path.join(site, "index.html"), `<!doctype html><title>site ${id}</title>`);
    fs.writeFileSync(path.join(site, "atlas", "atlas.json"), `{"campaign":{"id":"${id}"}}`);
    fs.writeFileSync(path.join(site, "assets", "app.js"), `console.log("app ${id}");`);
  }
  // The store a site must never serve.
  fs.mkdirSync(path.join(root, ".atlas-campaigns", "a"), { recursive: true });
  fs.writeFileSync(path.join(root, ".atlas-campaigns", "a", "must-not-ship.json"), "{}");
  fs.writeFileSync(path.join(root, "secret.txt"), "outside");
  fs.utimesSync(path.join(root, "content"), OLD, OLD);
  fs.utimesSync(configPath, OLD, OLD);
  for (const id of ["a", "b"]) {
    fs.utimesSync(path.join(root, "dist-campaigns", id, "atlas", "atlas.json"), BUILT, BUILT);
  }
  return { root, configPath };
}

/** Every file under `dir` with its sha256, for a before/after compare. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else
        out[path.relative(dir, full)] = crypto
          .createHash("sha256")
          .update(fs.readFileSync(full))
          .digest("hex");
    }
  };
  walk(dir);
  return out;
}

/** One raw HTTP/1.1 request, the path sent byte for byte (no client normalising). */
function raw(
  port: number,
  reqPath: string,
  opts: { method?: string; host?: string } = {},
): Promise<{ status: number; headers: string; body: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1");
    let data = "";
    sock.on("data", (c) => (data += c.toString("latin1")));
    sock.on("error", reject);
    sock.on("end", () => {
      const [head, ...rest] = data.split("\r\n\r\n");
      resolve({
        status: Number(head.split(" ")[1]),
        headers: head.toLowerCase(),
        body: rest.join("\r\n\r\n"),
      });
    });
    sock.write(
      `${opts.method ?? "GET"} ${reqPath} HTTP/1.1\r\nHost: ${opts.host ?? `127.0.0.1:${port}`}\r\nConnection: close\r\n\r\n`,
    );
  });
}

describe("parseServeArgs", () => {
  it("defaults to port 4300 and the next config", () => {
    expect(parseServeArgs([])).toEqual({ port: 4300, configPath: "atlas.next.config.json" });
  });
  it("takes --port and refuses junk", () => {
    expect(parseServeArgs(["--port", "5000"]).port).toBe(5000);
    expect(parseServeArgs(["--port=5001"]).port).toBe(5001);
    expect(() => parseServeArgs(["--port", "x"])).toThrow(/--port/);
    expect(() => parseServeArgs(["--port", "70000"])).toThrow(/--port/);
    expect(() => parseServeArgs(["--nope"])).toThrow(/unknown/);
  });
});

describe("planServe refuses a missing or stale build, naming atlas:publish:next", () => {
  it("serves every listed campaign, in content order, with its name", () => {
    const { root, configPath } = builtRoot();
    const plan = planServe({ root, configPath });
    expect(plan.map((c) => [c.id, c.name])).toEqual([
      ["a", "Campaign A"],
      ["b", "Campaign B"],
    ]);
    expect(plan[0].siteDir).toBe(path.join(root, "dist-campaigns", "a"));
  });
  it("refuses when dist-campaigns/ is missing", () => {
    const { root, configPath } = builtRoot();
    fs.rmSync(path.join(root, "dist-campaigns"), { recursive: true });
    expect(() => planServe({ root, configPath })).toThrow(ServeRefusal);
    expect(() => planServe({ root, configPath })).toThrow(
      /dist-campaigns\/ is missing.*atlas:publish:next/,
    );
  });
  it("refuses when a listed campaign has no site dir", () => {
    const { root, configPath } = builtRoot();
    fs.rmSync(path.join(root, "dist-campaigns", "b"), { recursive: true });
    expect(() => planServe({ root, configPath })).toThrow(
      /campaign b has no site dir.*atlas:publish:next/,
    );
  });
  it("refuses after a note is deleted (only its directory's mtime changes)", () => {
    const { root, configPath } = builtRoot();
    fs.rmSync(path.join(root, "content", "vale", "places", "inn.md"));
    expect(() => planServe({ root, configPath })).toThrow(ServeRefusal);
    expect(() => planServe({ root, configPath })).toThrow(
      /stale: content\/vale\/places is newer.*atlas:publish:next/,
    );
  });
  it("refuses after a note is renamed", () => {
    const { root, configPath } = builtRoot();
    const places = path.join(root, "content", "vale", "places");
    fs.renameSync(path.join(places, "inn.md"), path.join(places, "tavern.md"));
    // A rename keeps the file's own mtime; only the directory's moves.
    expect(fs.statSync(path.join(places, "tavern.md")).mtimeMs).toBe(OLD.getTime());
    expect(() => planServe({ root, configPath })).toThrow(/stale: content\/vale\/places is newer/);
  });
  it("refuses after a file is added at the content root", () => {
    const { root, configPath } = builtRoot();
    fs.writeFileSync(path.join(root, "content", "new.md"), "x");
    fs.utimesSync(path.join(root, "content", "new.md"), OLD, OLD);
    expect(() => planServe({ root, configPath })).toThrow(/stale: content is newer/);
  });
  it("refuses when the config is newer than the build", () => {
    const { root, configPath } = builtRoot();
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(configPath, later, later);
    expect(() => planServe({ root, configPath })).toThrow(
      /stale: atlas\.next\.config\.json is newer.*atlas:publish:next/,
    );
  });
  it("refuses a site dir that is a link", () => {
    const { root, configPath } = builtRoot();
    const site = path.join(root, "dist-campaigns", "b");
    const elsewhere = path.join(root, "elsewhere-b");
    fs.renameSync(site, elsewhere);
    fs.symlinkSync(elsewhere, site);
    expect(() => planServe({ root, configPath })).toThrow(ServeRefusal);
    expect(() => planServe({ root, configPath })).toThrow(/dist-campaigns\/b is not a directory/);
  });
  it("refuses a dist-campaigns/ that is a link", () => {
    const { root, configPath } = builtRoot();
    const sites = path.join(root, "dist-campaigns");
    fs.renameSync(sites, path.join(root, "elsewhere"));
    fs.symlinkSync(path.join(root, "elsewhere"), sites);
    expect(() => planServe({ root, configPath })).toThrow(/dist-campaigns\/ is not a directory/);
  });
  it("refuses a site without atlas/atlas.json", () => {
    const { root, configPath } = builtRoot();
    fs.rmSync(path.join(root, "dist-campaigns", "a", "atlas"), { recursive: true });
    expect(() => planServe({ root, configPath })).toThrow(
      /atlas\.json is missing.*atlas:publish:next/,
    );
  });
  it("refuses when any content file is newer than a site's atlas.json", () => {
    const { root, configPath } = builtRoot();
    const note = path.join(root, "content", "vale", "places", "inn.md");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(note, later, later);
    expect(() => planServe({ root, configPath })).toThrow(
      /stale: content\/vale\/places\/inn\.md is newer.*atlas:publish:next/,
    );
  });
  it("serves only listed campaigns, not a stray dir in dist-campaigns", () => {
    const { root, configPath } = builtRoot();
    fs.mkdirSync(path.join(root, "dist-campaigns", "zzz"));
    expect(planServe({ root, configPath }).map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("names the command it refuses with", () => {
    expect(PUBLISH_COMMAND).toBe("npm run atlas:publish:next");
  });
});

describe("resolveSitePath", () => {
  let site: string;
  let outside: string;
  beforeAll(() => {
    const root = tmp("resolve");
    site = path.join(root, "site");
    outside = path.join(root, "outside");
    fs.mkdirSync(path.join(site, "atlas"), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(site, "index.html"), "index");
    fs.writeFileSync(path.join(site, "atlas", "atlas.json"), "{}");
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(site, "leak.txt"));
    fs.symlinkSync(outside, path.join(site, "leakdir"));
  });
  const fileOf = (u: string) => {
    const r = resolveSitePath(site, u);
    return r.kind === "file" ? path.relative(site, r.file) : r.status;
  };

  it("serves files and falls back to index.html for unknown paths and dirs", () => {
    expect(fileOf("/")).toBe("index.html");
    expect(fileOf("/atlas/atlas.json")).toBe("atlas/atlas.json");
    expect(fileOf("/atlas/atlas.json?x=1#y")).toBe("atlas/atlas.json");
    expect(fileOf("/map/quessaly")).toBe("index.html");
    expect(fileOf("/atlas/")).toBe("index.html");
    expect(fileOf("/atlas")).toBe("index.html");
  });
  it("gives a missing file name with an extension a 404, not the index", () => {
    expect(fileOf("/assets/missing.js")).toBe(404);
    expect(fileOf("/atlas/assets/maps/gone.webp")).toBe(404);
    expect(fileOf("/missing.css?v=1")).toBe(404);
  });
  it.each([
    "/../outside/secret.txt",
    "/atlas/../../outside/secret.txt",
    "/%2e%2e/outside/secret.txt",
    "/%2E%2E/outside/secret.txt",
    "/.%2e/outside/secret.txt",
    "/..%2foutside%2fsecret.txt",
    "/%252e%252e/outside/secret.txt",
    "/./index.html",
    "/..\\outside\\secret.txt",
    "/%5c..%5coutside%5csecret.txt",
    "/atlas%5c..%5c..%5coutside",
    "/a%00b",
    "/%E0%A4%A",
    "http://127.0.0.1/",
    "*",
  ])("refuses %s", (u) => {
    const r = resolveSitePath(site, u);
    expect(r.kind).toBe("refused");
  });
  it("refuses a link whose target is outside the site", () => {
    expect(fileOf("/leak.txt")).toBe(403);
    expect(fileOf("/leakdir/secret.txt")).toBe(403);
  });
});

describe("siteLeaks", () => {
  const sites = (root: string): ServedCampaign[] =>
    ["a", "b"].map((id) => ({
      id,
      name: `Campaign ${id.toUpperCase()}`,
      siteDir: path.join(root, "dist-campaigns", id),
    }));
  it("is clean on clean sites", () => {
    const { root } = builtRoot();
    const all = sites(root);
    expect(all.flatMap((s) => siteLeaks(s, all))).toEqual([]);
  });
  it("finds the picker's marker or note, or another campaign's name, encoded too", () => {
    const { root } = builtRoot();
    const all = sites(root);
    const a = all[0].siteDir;
    fs.writeFileSync(path.join(a, "picker.html"), `<meta name="${PICKER_MARKER}">`);
    fs.writeFileSync(path.join(a, "assets", "x.js"), `"${PICKER_NOTE.replace(/ /g, "\\u0020")}"`);
    fs.writeFileSync(path.join(a, "assets", "y.json"), `{"t":"campaign%20b"}`);
    const found = siteLeaks(all[0], all).join("\n");
    expect(found).toMatch(/picker\.html: holds "atlas-local-campaign-picker"/);
    expect(found).toMatch(/x\.js: holds "Test site only"/);
    expect(found).toMatch(/y\.json: holds "Campaign B"/);
    // Its own name is fine.
    expect(siteLeaks(all[1], all)).toEqual([]);
  });
});

describe("pickerHtml", () => {
  it("lists each campaign with a 127.0.0.1 link, escaped, and the test-site note", () => {
    const html = pickerHtml([
      { name: "Lantern Road", port: 4301 },
      { name: `<script>"&'`, port: 4302 },
    ]);
    expect(html).toContain(`<a href="http://127.0.0.1:4301/">Lantern Road</a>`);
    expect(html).toContain("&lt;script&gt;&quot;&amp;&#39;");
    expect(html).not.toContain("<script>");
    expect(html).toContain(PICKER_NOTE);
    expect(html).toContain(PICKER_MARKER);
  });
});

describe("startServe", () => {
  let root: string;
  let running: RunningServe;
  let before: Record<string, string>;
  beforeAll(async () => {
    ({ root } = builtRoot());
    fs.symlinkSync(path.join(root, "secret.txt"), path.join(root, "dist-campaigns", "a", "s.txt"));
    before = snapshot(path.join(root, "dist-campaigns"));
    running = await startServe(
      planServe({ root, configPath: path.join(root, "atlas.next.config.json") }),
      0,
    );
    return () => running.close();
  });
  const port = (id: string) => running.campaigns.find((c) => c.id === id)!.port;

  it("gives every campaign and the picker its own port", () => {
    const ports = [running.picker, port("a"), port("b")];
    expect(new Set(ports).size).toBe(3);
  });
  it("serves each site's own files, with the SPA fallback", async () => {
    expect((await raw(port("a"), "/")).body).toContain("site a");
    expect((await raw(port("b"), "/")).body).toContain("site b");
    expect((await raw(port("a"), "/atlas/atlas.json")).body).toBe(`{"campaign":{"id":"a"}}`);
    expect((await raw(port("b"), "/atlas/atlas.json")).body).toBe(`{"campaign":{"id":"b"}}`);
    const route = await raw(port("a"), "/map/somewhere?x=1");
    expect(route.status).toBe(200);
    expect(route.body).toContain("site a");
    const dir = await raw(port("a"), "/assets/");
    expect(dir.body).toContain("site a"); // no listing
    expect(dir.body).not.toContain("app.js");
    expect((await raw(port("a"), "/assets/app.js")).headers).toContain("text/javascript");
    const missing = await raw(port("a"), "/assets/missing.js");
    expect(missing.status).toBe(404);
    expect(missing.body).not.toContain("site a");
  });
  it.each([
    "/../b/index.html",
    "/../../secret.txt",
    "/%2e%2e/%2e%2e/secret.txt",
    "/%2e%2e%2f%2e%2e%2fsecret.txt",
    "/..%5c..%5csecret.txt",
    "/..\\..\\secret.txt",
    "/%252e%252e/%252e%252e/secret.txt",
    "/../../.atlas-campaigns/a/must-not-ship.json",
    "/%2e%2e/%2e%2e/.atlas-campaigns/a/must-not-ship.json",
  ])("refuses %s on a site port", async (u) => {
    const r = await raw(port("a"), u);
    expect(r.status).toBe(400);
    expect(r.body).not.toContain("outside");
    expect(r.body).not.toContain("site b");
  });
  it("refuses a link out of the site dir", async () => {
    const r = await raw(port("a"), "/s.txt");
    expect(r.status).toBe(403);
    expect(r.body).not.toContain("outside");
  });
  it("answers only localhost hosts, and only GET and HEAD", async () => {
    expect((await raw(port("a"), "/", { host: "evil.example" })).status).toBe(403);
    expect((await raw(port("a"), "/", { host: `evil.example:${port("a")}` })).status).toBe(403);
    expect((await raw(running.picker, "/", { host: `localhost:${running.picker}` })).status).toBe(
      200,
    );
    expect((await raw(port("a"), "/", { method: "POST" })).status).toBe(405);
    const head = await raw(port("a"), "/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
  });
  it("binds 127.0.0.1 only", async () => {
    // Every server's address is the loopback IPv4 address.
    const r = await new Promise<boolean>((resolve) => {
      const s = net.connect(port("a"), "::1");
      s.on("connect", () => (s.destroy(), resolve(true)));
      s.on("error", () => resolve(false));
    });
    expect(r).toBe(false);
  });
  it("serves the picker from memory at / only", async () => {
    const page = await raw(running.picker, "/");
    expect(page.body).toContain(`http://127.0.0.1:${port("a")}/`);
    expect(page.body).toContain("Campaign A");
    expect(page.body).toContain("Campaign B");
    expect(page.body).toContain(PICKER_NOTE);
    expect((await raw(running.picker, "/atlas/atlas.json")).status).toBe(404);
    expect((await raw(running.picker, "/../dist-campaigns/a/index.html")).status).toBe(404);
  });
  it("never writes the picker, or anything, into a site dir", async () => {
    await raw(running.picker, "/");
    expect(snapshot(path.join(root, "dist-campaigns"))).toEqual(before);
    const all = running.campaigns;
    expect(all.flatMap((s) => siteLeaks(s, all))).toEqual([]);
  });
});

describe("startServe refuses a site that holds the picker or another campaign", () => {
  it("before anything listens", async () => {
    const { root, configPath } = builtRoot();
    fs.writeFileSync(path.join(root, "dist-campaigns", "a", "about.txt"), "See Campaign B");
    const plan = planServe({ root, configPath });
    await expect(startServe(plan, 0)).rejects.toThrow(/about\.txt: holds "Campaign B"/);
  });
});
