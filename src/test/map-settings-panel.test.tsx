import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapSettingsPanel } from "@/atlas/MapSettingsPanel";
import { deriveCrestColor } from "@/atlas/ocean/resolveWater";
import type { MapDocument } from "@/atlas/content/schema";

const BASE_MAP: MapDocument = {
  id: "test-map",
  worldId: "test-world",
  name: "Test Map",
  width: 2048,
  height: 2048,
  layers: [],
  oceanColor: "#18313f",
};

describe("MapSettingsPanel — Living water (H2)", () => {
  it("renders the Animated water toggle checked by default (no water config)", () => {
    render(<MapSettingsPanel map={BASE_MAP} baseMap={BASE_MAP} onPatch={vi.fn()} onReset={vi.fn()} />);
    const toggle = screen.getByTestId("water-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("renders Strength and Speed sliders when water is on", () => {
    render(<MapSettingsPanel map={BASE_MAP} baseMap={BASE_MAP} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByTestId("water-strength")).toBeTruthy();
    expect(screen.getByTestId("water-speed")).toBeTruthy();
  });

  it("renders the Wave colour picker pre-filled with the derived default", () => {
    render(<MapSettingsPanel map={BASE_MAP} baseMap={BASE_MAP} onPatch={vi.fn()} onReset={vi.fn()} />);
    const picker = screen.getByTestId("water-crest-color-picker") as HTMLInputElement;
    // Should be pre-filled with deriveCrestColor(oceanColor)
    const expected = deriveCrestColor(BASE_MAP.oceanColor!).toLowerCase();
    expect(picker.value.toLowerCase()).toBe(expected);
  });

  it("hides tuning controls when water.enabled is false", () => {
    const map: MapDocument = { ...BASE_MAP, water: { enabled: false } };
    render(<MapSettingsPanel map={map} baseMap={BASE_MAP} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByTestId("water-strength")).toBeNull();
    expect(screen.queryByTestId("water-speed")).toBeNull();
    expect(screen.queryByTestId("water-crest-color-picker")).toBeNull();
  });

  it("toggle off emits onPatch({ water: { enabled: false } })", () => {
    const onPatch = vi.fn();
    render(<MapSettingsPanel map={BASE_MAP} baseMap={BASE_MAP} onPatch={onPatch} onReset={vi.fn()} />);
    const toggle = screen.getByTestId("water-toggle");
    fireEvent.click(toggle);
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ water: expect.objectContaining({ enabled: false }) })
    );
  });

  it("toggle on emits onPatch({ water: { enabled: true } }) when was off", () => {
    const onPatch = vi.fn();
    const map: MapDocument = { ...BASE_MAP, water: { enabled: false } };
    render(<MapSettingsPanel map={map} baseMap={BASE_MAP} onPatch={onPatch} onReset={vi.fn()} />);
    const toggle = screen.getByTestId("water-toggle");
    fireEvent.click(toggle);
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ water: expect.objectContaining({ enabled: true }) })
    );
  });

  it("wave colour picker change emits onPatch with crestColor", () => {
    const onPatch = vi.fn();
    render(<MapSettingsPanel map={BASE_MAP} baseMap={BASE_MAP} onPatch={onPatch} onReset={vi.fn()} />);
    const picker = screen.getByTestId("water-crest-color-picker");
    fireEvent.change(picker, { target: { value: "#aabbcc" } });
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ water: expect.objectContaining({ crestColor: "#aabbcc" }) })
    );
  });

  it("wave colour text input change emits onPatch with crestColor", () => {
    const onPatch = vi.fn();
    render(<MapSettingsPanel map={BASE_MAP} baseMap={BASE_MAP} onPatch={onPatch} onReset={vi.fn()} />);
    const input = screen.getByTestId("water-crest-color-input");
    fireEvent.change(input, { target: { value: "#112233" } });
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ water: expect.objectContaining({ crestColor: "#112233" }) })
    );
  });

  it("clearing the wave colour text input emits crestColor:undefined (reverts to derived)", () => {
    const onPatch = vi.fn();
    const map: MapDocument = { ...BASE_MAP, water: { crestColor: "#aabbcc" } };
    render(<MapSettingsPanel map={map} baseMap={BASE_MAP} onPatch={onPatch} onReset={vi.fn()} />);
    const input = screen.getByTestId("water-crest-color-input");
    fireEvent.change(input, { target: { value: "" } });
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ water: expect.objectContaining({ crestColor: undefined }) })
    );
  });
});
