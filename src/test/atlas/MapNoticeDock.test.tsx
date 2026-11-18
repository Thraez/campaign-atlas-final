/**
 * P-01: map notices share one dock above the bottom row of map controls, and
 * the stacking scale keeps map overlays under the toolbar, toasts and scrims.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapNoticeDock, noticeDockClearancePx } from "@/atlas/MapNoticeDock";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

function zVar(name: string): number {
  const m = css.match(new RegExp(`--z-${name}:\\s*(\\d+);`));
  if (!m) throw new Error(`--z-${name} is not defined in src/index.css`);
  return Number(m[1]);
}

describe("noticeDockClearancePx", () => {
  it("clears Wander when no minimap shows (v2 ocean)", () => {
    expect(noticeDockClearancePx(null)).toBe(12 + 60 + 8);
  });

  it("clears the minimap when it is taller than Wander", () => {
    expect(noticeDockClearancePx(135)).toBe(12 + 135 + 8);
  });

  it("never sits lower than Wander's top, even for a flat minimap", () => {
    expect(noticeDockClearancePx(40)).toBe(12 + 60 + 8);
  });
});

describe("MapNoticeDock", () => {
  it("passes its clearance to the CSS and keeps children in order", () => {
    render(
      <MapNoticeDock minimapHeight={120}>
        <span>first</span>
        <span>second</span>
      </MapNoticeDock>,
    );
    const dock = screen.getByTestId("map-notice-dock");
    expect(dock).toHaveClass("atlas-notice-dock");
    expect(dock.style.getPropertyValue("--atlas-dock-clear")).toBe("140px");
    expect(dock.textContent).toBe("firstsecond");
  });
});

describe("stacking scale (src/index.css)", () => {
  it("orders the page layers: toolbar < toasts < scrims (shadcn's z-50)", () => {
    expect(zVar("chrome")).toBeLessThan(zVar("toast"));
    expect(zVar("toast")).toBeLessThan(zVar("scrim"));
    expect(zVar("scrim")).toBe(50);
  });

  it("puts notices above the map controls inside the map", () => {
    expect(zVar("map-control")).toBeLessThan(zVar("map-notice"));
  });

  it("turns the notice rise off under reduced motion and in calm mode", () => {
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toMatch(/\.atlas-notice\s*\{\s*animation:\s*none !important;/);
    expect(css).toMatch(
      /:root\[data-calm="true"\] \.atlas-notice\s*\{\s*animation:\s*none !important;/,
    );
  });
});
