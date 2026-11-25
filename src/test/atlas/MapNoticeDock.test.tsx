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
  PHONE_SCALE_BAR_BOTTOM_PX,
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
    expect(noticeDockClearancePx(null)).toBe(12 + 62 + 8);
  });

  it("clears the minimap when it is taller than Wander", () => {
    expect(noticeDockClearancePx(135)).toBe(12 + 135 + 8);
  });

  it("never sits lower than Wander's top, even for a flat minimap", () => {
    expect(noticeDockClearancePx(40)).toBe(12 + 62 + 8);
  });

  it("on a phone, clears the scale bar stacked above Wander (Q-03)", () => {
    // Scale bar: 42px tall, its bottom at PHONE_SCALE_BAR_BOTTOM_PX.
    const scaleTop = PHONE_SCALE_BAR_BOTTOM_PX + 42;
    for (const minimap of [null, 40, 80, 120, 300]) {
      expect(noticeDockClearancePx(minimap, 0, true)).toBeGreaterThanOrEqual(scaleTop + 8);
      expect(noticeDockClearancePx(minimap, 0, true)).toBeGreaterThanOrEqual(
        noticeDockClearancePx(minimap),
      );
    }
    // A tall minimap already lifts the dock clear: no extra gap.
    expect(noticeDockClearancePx(135, 0, true)).toBe(noticeDockClearancePx(135));
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

describe("phone corner controls (Q-03, src/index.css)", () => {
  it("rests the phone scale bar where the dock's numbers expect it", () => {
    expect(cssBlock("@media (max-width: 639px)")).toMatch(
      new RegExp(`\\.atlas-scale-bar\\s*\\{[^}]*bottom:\\s*${PHONE_SCALE_BAR_BOTTOM_PX}px`),
    );
  });

  it("passes the scale bar on to the dock's clearance", () => {
    render(
      <MapNoticeDock minimapHeight={60} scaleBar>
        <span>notice</span>
      </MapNoticeDock>,
    );
    expect(screen.getByTestId("map-notice-dock").style.getPropertyValue("--atlas-dock-clear")).toBe(
      `${noticeDockClearancePx(60, 0, true)}px`,
    );
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
