// src/test/shell/CommandPalette.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "@/atlas/shell/CommandPalette";
import { buildPaletteIndex } from "@/atlas/shell/useCommandPalette";

const index = buildPaletteIndex({
  entities: [{ id: "corven", title: "Corven", type: "npc" }] as never,
  maps: [], commands: [], settings: [], recent: [],
});

describe("CommandPalette", () => {
  it("opens on Ctrl-K, filters, and fires onChoose on Enter", () => {
    const onChoose = vi.fn();
    render(<CommandPalette index={index} onChoose={onChoose} />);
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText(/search everything/i);
    fireEvent.change(input, { target: { value: "corv" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "corven", kind: "entity" }),
    );
  });

  it("closes on Escape", () => {
    render(<CommandPalette index={index} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search everything/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
  });
});
