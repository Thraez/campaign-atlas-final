import { describe, it, expect } from "vitest";
import {
  isAllowedDevRequest,
  isLoopbackAddress,
  rejectNonLoopback,
} from "../../scripts/vite-plugin-atlas-save";
import type { IncomingMessage, ServerResponse } from "node:http";

describe("isAllowedDevRequest", () => {
  describe("loopback Host accepted", () => {
    const cases: Array<{ host: string; label: string }> = [
      { host: "localhost:8080", label: "localhost with port" },
      { host: "localhost", label: "localhost no port" },
      { host: "127.0.0.1:8080", label: "127.0.0.1 with port" },
      { host: "127.0.0.1", label: "127.0.0.1 no port" },
      { host: "[::1]:8080", label: "[::1] with port" },
      { host: "[::1]", label: "[::1] no port" },
      { host: "LOCALHOST:8080", label: "case-insensitive localhost" },
    ];
    for (const { host, label } of cases) {
      it(`accepts GET with Host=${label}`, () => {
        expect(isAllowedDevRequest({ host, origin: undefined, method: "GET" })).toBe(true);
      });
    }
  });

  describe("non-loopback Host rejected", () => {
    const cases: Array<{ host: string | undefined; label: string }> = [
      { host: "192.168.1.42:8080", label: "private LAN IPv4" },
      { host: "10.0.0.5", label: "private LAN IPv4 no port" },
      { host: "campaign-atlas.example.com:8080", label: "external hostname" },
      { host: "[fe80::1]:8080", label: "non-loopback IPv6" },
      { host: "0.0.0.0:8080", label: "wildcard bind" },
      { host: undefined, label: "no Host header" },
      { host: "", label: "empty Host header" },
    ];
    for (const { host, label } of cases) {
      it(`rejects GET with Host=${label}`, () => {
        expect(isAllowedDevRequest({ host, origin: undefined, method: "GET" })).toBe(false);
      });
      it(`rejects POST with Host=${label}`, () => {
        expect(
          isAllowedDevRequest({
            host,
            origin: "http://localhost:8080",
            method: "POST",
          }),
        ).toBe(false);
      });
    }
  });

  describe("Origin enforcement on write methods", () => {
    const loopbackHost = "localhost:8080";
    it("accepts POST with loopback Origin", () => {
      expect(
        isAllowedDevRequest({
          host: loopbackHost,
          origin: "http://localhost:8080",
          method: "POST",
        }),
      ).toBe(true);
    });
    it("accepts DELETE with loopback Origin", () => {
      expect(
        isAllowedDevRequest({
          host: loopbackHost,
          origin: "http://127.0.0.1:5173",
          method: "DELETE",
        }),
      ).toBe(true);
    });
    it("accepts POST with [::1] Origin", () => {
      expect(
        isAllowedDevRequest({
          host: loopbackHost,
          origin: "http://[::1]:8080",
          method: "POST",
        }),
      ).toBe(true);
    });

    const malicious = [
      "http://attacker.example.com",
      "https://attacker.example.com",
      "http://192.168.1.42:8080",
      "http://localhost.attacker.com",
      "http://localhostXXX",
      "null",
      "file://",
      "data:text/html,<script>",
      "",
    ];
    for (const origin of malicious) {
      it(`rejects POST with Origin=${JSON.stringify(origin)}`, () => {
        expect(
          isAllowedDevRequest({
            host: loopbackHost,
            origin,
            method: "POST",
          }),
        ).toBe(false);
      });
      it(`rejects DELETE with Origin=${JSON.stringify(origin)}`, () => {
        expect(
          isAllowedDevRequest({
            host: loopbackHost,
            origin,
            method: "DELETE",
          }),
        ).toBe(false);
      });
    }

    it("rejects POST when Origin header is missing (curl, no browser context)", () => {
      expect(
        isAllowedDevRequest({
          host: loopbackHost,
          origin: undefined,
          method: "POST",
        }),
      ).toBe(false);
    });
    it("rejects DELETE when Origin header is missing", () => {
      expect(
        isAllowedDevRequest({
          host: loopbackHost,
          origin: undefined,
          method: "DELETE",
        }),
      ).toBe(false);
    });
    it("rejects PUT when Origin header is missing", () => {
      expect(
        isAllowedDevRequest({
          host: loopbackHost,
          origin: undefined,
          method: "PUT",
        }),
      ).toBe(false);
    });
  });

  describe("GET without Origin (address-bar navigation, same-origin <img>)", () => {
    it("accepts GET with no Origin when Host is loopback", () => {
      expect(
        isAllowedDevRequest({
          host: "localhost:8080",
          origin: undefined,
          method: "GET",
        }),
      ).toBe(true);
    });
    it("rejects GET with non-loopback Origin (cross-origin fetch)", () => {
      expect(
        isAllowedDevRequest({
          host: "localhost:8080",
          origin: "http://attacker.com",
          method: "GET",
        }),
      ).toBe(false);
    });
    it("accepts GET with loopback Origin", () => {
      expect(
        isAllowedDevRequest({
          host: "localhost:8080",
          origin: "http://localhost:8080",
          method: "GET",
        }),
      ).toBe(true);
    });
  });

  describe("method defaults to GET when undefined", () => {
    it("treats missing method as GET (same as Node default)", () => {
      expect(
        isAllowedDevRequest({
          host: "localhost:8080",
          origin: undefined,
        }),
      ).toBe(true);
    });
  });
});

describe("isLoopbackAddress (the unforgeable half of the gate)", () => {
  it.each(["127.0.0.1", "127.0.0.53", "::1", "[::1]", "::ffff:127.0.0.1", "::FFFF:127.0.0.1"])(
    "accepts loopback peer %s",
    (addr) => {
      expect(isLoopbackAddress(addr)).toBe(true);
    },
  );

  it.each([
    "192.168.1.50",
    "10.0.0.7",
    "172.16.0.1",
    "203.0.113.9",
    "::ffff:192.168.1.50",
    "fe80::1",
    "0.0.0.0",
    // Not loopback: a hostname is not an address, and this function is only
    // ever handed a kernel-reported peer address.
    "localhost",
  ])("rejects non-loopback peer %s", (addr) => {
    expect(isLoopbackAddress(addr)).toBe(false);
  });

  it("fails closed on undefined and empty", () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
  });

  it("is not fooled by a non-loopback address that merely starts with 127", () => {
    expect(isLoopbackAddress("127.0.0.1.evil.com")).toBe(false);
    expect(isLoopbackAddress("1270.0.0.1")).toBe(false);
  });
});

describe("rejectNonLoopback (the shared 403 gate for /__atlas/* middleware)", () => {
  // remoteAddress defaults to loopback so the existing header-policy cases keep
  // testing the header policy. Pass it explicitly to exercise the socket check.
  function mockReq(
    headers: { host?: string; origin?: string },
    method: string,
    remoteAddress: string | undefined = "127.0.0.1",
  ): IncomingMessage {
    return { headers, method, socket: { remoteAddress } } as unknown as IncomingMessage;
  }
  function mockRes() {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as string | undefined,
      ended: false,
      setHeader(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
      },
      end(body?: string) {
        this.body = body;
        this.ended = true;
      },
    };
    return res;
  }

  // The finding that motivated the socket check: `Host` and `Origin` are just
  // strings the client sends. A LAN client can set both to loopback values and
  // satisfy the entire header policy. Only the peer address tells the truth.
  describe("spoofed loopback headers from a non-loopback peer", () => {
    const spoofed = { host: "localhost:8080", origin: "http://localhost:8080" };

    it.each(["192.168.1.50", "10.0.0.7", "::ffff:192.168.1.50", "203.0.113.9"])(
      "rejects a POST from %s despite perfect loopback headers",
      (peer) => {
        const res = mockRes();
        const blocked = rejectNonLoopback(
          mockReq(spoofed, "POST", peer),
          res as unknown as ServerResponse,
        );
        expect(blocked).toBe(true);
        expect(res.statusCode).toBe(403);
      },
    );

    it("rejects a GET from a LAN peer with a spoofed Host", () => {
      const res = mockRes();
      const blocked = rejectNonLoopback(
        mockReq({ host: "localhost:8080" }, "GET", "192.168.1.50"),
        res as unknown as ServerResponse,
      );
      expect(blocked).toBe(true);
      expect(res.statusCode).toBe(403);
    });

    // Built inline, not via mockReq: passing `undefined` to a parameter with a
    // default value would just re-apply the default and silently test loopback.
    it("fails closed when the peer address is unknown", () => {
      const res = mockRes();
      const req = {
        headers: spoofed,
        method: "POST",
        socket: { remoteAddress: undefined },
      } as unknown as IncomingMessage;
      expect(rejectNonLoopback(req, res as unknown as ServerResponse)).toBe(true);
      expect(res.statusCode).toBe(403);
    });

    it("fails closed when the socket is missing entirely", () => {
      const res = mockRes();
      const req = { headers: spoofed, method: "POST" } as unknown as IncomingMessage;
      expect(rejectNonLoopback(req, res as unknown as ServerResponse)).toBe(true);
      expect(res.statusCode).toBe(403);
    });

    it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
      "still allows a genuine loopback peer on %s",
      (peer) => {
        const res = mockRes();
        const blocked = rejectNonLoopback(
          mockReq(spoofed, "POST", peer),
          res as unknown as ServerResponse,
        );
        expect(blocked).toBe(false);
        expect(res.ended).toBe(false);
      },
    );
  });

  it("lets an allowed loopback GET through: returns false and writes nothing", () => {
    const res = mockRes();
    const blocked = rejectNonLoopback(
      mockReq({ host: "localhost:8080", origin: undefined }, "GET"),
      res as unknown as ServerResponse,
    );
    expect(blocked).toBe(false);
    expect(res.ended).toBe(false);
    expect(res.statusCode).toBe(200);
  });

  it("lets an allowed loopback POST (loopback Origin) through", () => {
    const res = mockRes();
    const blocked = rejectNonLoopback(
      mockReq({ host: "localhost:8080", origin: "http://localhost:8080" }, "POST"),
      res as unknown as ServerResponse,
    );
    expect(blocked).toBe(false);
    expect(res.ended).toBe(false);
  });

  it("rejects a non-loopback Host: returns true and writes a 403 loopback-only body", () => {
    const res = mockRes();
    const blocked = rejectNonLoopback(
      mockReq({ host: "192.168.1.42:8080", origin: undefined }, "GET"),
      res as unknown as ServerResponse,
    );
    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body as string)).toEqual({ error: "Forbidden", detail: "loopback-only" });
  });

  it("rejects a write with a missing Origin (curl / non-browser) even from loopback Host", () => {
    const res = mockRes();
    const blocked = rejectNonLoopback(
      mockReq({ host: "localhost:8080", origin: undefined }, "POST"),
      res as unknown as ServerResponse,
    );
    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(403);
  });

  it("rejects a write with a cross-origin Origin", () => {
    const res = mockRes();
    const blocked = rejectNonLoopback(
      mockReq({ host: "localhost:8080", origin: "http://attacker.example.com" }, "DELETE"),
      res as unknown as ServerResponse,
    );
    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(403);
  });
});
