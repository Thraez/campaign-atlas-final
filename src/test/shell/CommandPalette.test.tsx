// src/test/shell/CommandPalette.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "@/atlas/shell/CommandPalette";
import { buildPaletteIndex } from "@/atlas/shell/useCommandPalette";

const index = buildPaletteIndex({
  entities: [{ id: "corven", title: "Corven", type: "npc" }] as never,
  maps: [],
  commands: [],
  settings: [],
  recent: [],
});

// Two-item index for keyboard navigation and click tests
const navIndex = buildPaletteIndex({
  entities: [
    { id: "corven", title: "Corven", type: "npc" },
    { id: "thornhold", title: "Thornhold", type: "settlement" },
  ] as never,
  maps: [],
  commands: [],
  settings: [],
  recent: [],
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
    fireEvent.keyDown(input, { key: "ArrowUp" }); // sel → 0
    fireEvent.keyDown(input, { key: "ArrowUp" }); // would be −1; clamped at 0
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
    const options = screen.getAllByRole("option");
    fireEvent.click(options[0]);
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "corven" }));
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
  });

  it("shows a 'No matches' row echoing the query when a search finds nothing", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText(/search everything/i);
    fireEvent.change(input, { target: { value: "nonexistentxyz" } });
    expect(screen.getByText(/no matches for "nonexistentxyz"/i)).toBeInTheDocument();
  });

  it("does not show the 'No matches' row when there are results", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText(/search everything/i);
    fireEvent.change(input, { target: { value: "corv" } });
    expect(screen.queryByText(/no matches for/i)).toBeNull();
  });
});

describe("dialog and listbox semantics (N130)", () => {
  it("exposes dialog role, aria-modal, and an accessible name on the palette container", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Command palette");
  });

  it("exposes an accessible label on the search input", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("textbox", { name: "Command palette search" })).toBeInTheDocument();
  });

  it("results container has role='listbox' with an accessible label the input references", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveAttribute("aria-label", "Command palette results");
    expect(listbox.id).toBe("cp-results-listbox");
    expect(screen.getByRole("textbox", { name: "Command palette search" })).toHaveAttribute(
      "aria-controls",
      "cp-results-listbox",
    );
  });

  it("each result row has role='option' and a stable kind+id-based id", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("id", "cp-result-entity-corven");
    expect(options[1]).toHaveAttribute("id", "cp-result-entity-thornhold");
  });

  it("the default selection (first result) is marked selected and referenced by aria-activedescendant", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Command palette search" })).toHaveAttribute(
      "aria-activedescendant",
      "cp-result-entity-corven",
    );
  });

  it("ArrowDown moves aria-selected and aria-activedescendant to the next option", () => {
    render(<CommandPalette index={navIndex} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("textbox", { name: "Command palette search" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "cp-result-entity-thornhold");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });
});
