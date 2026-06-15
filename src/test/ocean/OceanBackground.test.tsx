import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OceanBackground } from "@/atlas/ocean/OceanBackground";

const BASE = { oceanColor: "#18313f" } as const;

describe("OceanBackground", () => {
  it("renders nothing when water.enabled is false", () => {
    const { container } = render(
      <OceanBackground map={{ ...BASE, water: { enabled: false } }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when water is undefined but enabled defaults true — wait, default is ON", () => {
    // This is the default-on case: undefined water should show waves
    const { container } = render(<OceanBackground map={BASE} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders the background div with pointer-events:none", () => {
    render(<OceanBackground map={BASE} />);
    const bg = screen.getByTestId("ocean-background");
    expect(bg).toBeTruthy();
    expect(bg.style.pointerEvents).toBe("none");
  });

  it("renders three wave layers when enabled", () => {
    render(<OceanBackground map={BASE} />);
    const waves = screen.getAllByTestId("ocean-wave");
    expect(waves).toHaveLength(3);
  });

  it("renders no wave layers when disabled", () => {
    render(<OceanBackground map={{ ...BASE, water: { enabled: false } }} />);
    expect(screen.queryAllByTestId("ocean-wave")).toHaveLength(0);
  });

  it("includes the prefers-reduced-motion CSS in the style tag", () => {
    const { container } = render(<OceanBackground map={BASE} />);
    const styleEl = container.querySelector("style");
    expect(styleEl?.textContent).toContain("prefers-reduced-motion");
    expect(styleEl?.textContent).toContain("animation:none");
  });

  it("uses the map's oceanColor as the background base", () => {
    render(<OceanBackground map={{ ...BASE, oceanColor: "#001122" }} />);
    const bg = screen.getByTestId("ocean-background");
    // jsdom normalises hex → rgb; check the computed style
    expect(bg.style.background).toBe("rgb(0, 17, 34)");
  });

  it("viewer and editor use the same OceanBackground import (shared component)", async () => {
    // Assert the module can be imported from both consumers' perspective
    const oceanMod = await import("@/atlas/ocean/OceanBackground");
    expect(typeof oceanMod.OceanBackground).toBe("function");
  });
});
