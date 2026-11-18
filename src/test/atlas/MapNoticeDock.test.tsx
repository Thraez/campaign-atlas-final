/**
 * P-01: map notices share one dock above the bottom row of map controls and
 * the layer credits, and the stacking scale keeps map overlays under the
 * toolbar, toasts and scrims.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapNoticeDock } from "@/atlas/MapNoticeDock";
import {
  creditOverlayBottomPx,
  creditStackHeightPx,
  noticeDockClearancePx,
  noticeDockRightPx,
} from "@/atlas/noticeDockLayout";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

function zVar(name: string): number {
  const m = css.match(new RegExp(`--z-${name}:\\s*(\\d+);`));
  if (!m) throw new Error(`--z-${name} is not defined in src/index.css`);
  return Number(m[1]);
}

/** The text of the CSS block that opens at `header`, up to its matching brace. */
function cssBlock(header: string): string {
  const start = css.indexOf(header);
  if (start < 0) throw new Error(`${header} not found in src/index.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`${header} is not closed`);
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

  it("sits above the layer credits stacked over the minimap", () => {
    for (const [minimap, credits] of [
      [120, 1],
      [120, 3],
      [40, 2],
      [null, 2],
    ] as const) {
      const creditTop = creditOverlayBottomPx(minimap) + creditStackHeightPx(credits);
      expect(noticeDockClearancePx(minimap, credits)).toBeGreaterThanOrEqual(creditTop + 8);
      expect(noticeDockClearancePx(minimap, credits)).toBeGreaterThanOrEqual(
        noticeDockClearancePx(minimap),
      );
    }
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
    expect(dock.style.getPropertyValue("--atlas-dock-right")).toBe("");
    expect(dock.textContent).toBe("firstsecond");
  });

  it("with credits present, lifts above them on a phone and clears their column on desktop", () => {
    render(
      <MapNoticeDock minimapHeight={120} creditCount={2}>
        <span>notice</span>
      </MapNoticeDock>,
    );
    const dock = screen.getByTestId("map-notice-dock");
    const creditTop = creditOverlayBottomPx(120) + creditStackHeightPx(2);
    expect(parseInt(dock.style.getPropertyValue("--atlas-dock-clear"), 10)).toBeGreaterThan(
      creditTop,
    );
    // The credit stack is right-2 and up to 240px wide: the dock ends left of it.
    expect(dock.style.getPropertyValue("--atlas-dock-right")).toBe(`${noticeDockRightPx(2)}px`);
    expect(noticeDockRightPx(2)).toBeGreaterThan(8 + 240);
  });
});

describe("stacking scale (src/index.css)", () => {
  it("orders the page layers: toolbar < toasts < scrims (shadcn's z-50)", () => {
    expect(zVar("chrome")).toBeLessThan(zVar("toast"));
    expect(zVar("toast")).toBeLessThan(zVar("scrim"));
    expect(zVar("scrim")).toBe(50);
  });

  it("orders the map layers: minimap < controls < notices", () => {
    expect(zVar("minimap")).toBeLessThan(zVar("map-control"));
    expect(zVar("map-control")).toBeLessThan(zVar("map-notice"));
  });

  it("turns the notice rise off under reduced motion", () => {
    expect(cssBlock("@media (prefers-reduced-motion: reduce)")).toMatch(
      /\.atlas-notice\s*\{\s*animation:\s*none !important;/,
    );
  });

  it("turns the notice rise off in calm mode", () => {
    expect(css).toMatch(
      /:root\[data-calm="true"\] \.atlas-notice\s*\{\s*animation:\s*none !important;/,
    );
  });
});
