// src/test/shell/HelpPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpPanel } from "@/atlas/shell/HelpPanel";

describe("HelpPanel", () => {
  it("lists the current keyboard shortcuts", () => {
    render(<HelpPanel />);
    expect(screen.getByText("Open the command palette")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Cancel an in-progress pin placement")).toBeInTheDocument();
    expect(screen.getByText("Bold selected text (in an entity body)")).toBeInTheDocument();
    expect(screen.getByText("Italicize selected text (in an entity body)")).toBeInTheDocument();
    expect(screen.getByText("Insert a wikilink")).toBeInTheDocument();
  });

  it("renders quick-start tips", () => {
    render(<HelpPanel />);
    expect(
      screen.getByText(/command palette \(⌘\/Ctrl K\) can jump straight to/i),
    ).toBeInTheDocument();
  });

  it("has a heading identifying the panel", () => {
    render(<HelpPanel />);
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });
});
