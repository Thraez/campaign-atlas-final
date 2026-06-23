// src/test/shell/CommandPalette.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "@/atlas/shell/CommandPalette";
import { buildPaletteIndex } from "@/atlas/shell/useCommandPalette";

const index = buildPaletteIndex({
  entities: [{ id: "corven", title: "Corven", type: "npc" }] as never,
  maps: [], commands: [], settings: [], recent: [],
});

// Two-item index for keyboard navigation and click tests
const navIndex = buildPaletteIndex({
  entities: [
    { id: "corven", title: "Corven", type: "npc" },
    { id: "thornhold", title: "Thornhold", type: "settlement" },
  ] as never,
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

  it("opens on Meta-K (macOS Cmd-K)", () => {
    render(<CommandPalette index={index} onChoose={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText(/search everything/i)).toBeInTheDocument();
  });

  it("ArrowDown advances selection — Enter fires onChoose on the second result", () => {
    const onChoose = vi.fn();
    render(<CommandPalette index={navIndex} onChoose={onChoose} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText(/search everything/i);
    // Empty query shows both results; default sel=0 (Corven)
    fireEvent.keyDown(input, { key: "ArrowDown" }); // sel → 1 (Thornhold)
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "thornhold" }));
  });

  it("ArrowUp clamps selection at 0 — cannot navigate below the first result", () => {
    const onChoose = vi.fn();
    render(<CommandPalette index={navIndex} onChoose={onChoose} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText(/search everything/i);
    fireEvent.keyDown(input, { key: "ArrowDown" }); // sel → 1
    fireEvent.keyDown(input, { key: "ArrowUp" });   // sel → 0
    fireEvent.keyDown(input, { key: "ArrowUp" });   // would be −1; clamped at 0
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "corven" }));
  });

  it("clicking the backdrop (overlay) closes the palette", () => {
    const { container } = render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search everything/i)).toBeInTheDocument();
    // The outer backdrop div is container.firstChild once the palette is open
    fireEvent.mouseDown(container.firstChild!);
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
  });

  it("clicking a result button fires onChoose and closes the palette", () => {
    const onChoose = vi.fn();
    render(<CommandPalette index={navIndex} onChoose={onChoose} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "corven" }));
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
  });
});
