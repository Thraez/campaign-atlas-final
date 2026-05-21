import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormatToolbar } from "@/atlas/editor/FormatToolbar";

describe("FormatToolbar", () => {
  it("renders the always-visible inline actions", () => {
    render(<FormatToolbar onAction={() => {}} />);
    for (const label of ["Bold", "Italic", "Highlight", "Heading", "List", "Quote", "Wikilink", "Callout"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("hides the lower-frequency block actions until More is opened", () => {
    render(<FormatToolbar onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "Footnote" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Table" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /more/i }));

    expect(screen.getByRole("button", { name: "Footnote" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Task list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Code block" })).toBeInTheDocument();
  });

  it("fires onAction with the action id for an always-visible button", () => {
    const onAction = vi.fn();
    render(<FormatToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onAction).toHaveBeenCalledWith("bold");
  });

  it("fires onAction for a More-menu block action", () => {
    const onAction = vi.fn();
    render(<FormatToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(onAction).toHaveBeenCalledWith("table");
  });

  it("the always-visible Callout button inserts a default note callout", () => {
    const onAction = vi.fn();
    render(<FormatToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Callout" }));
    expect(onAction).toHaveBeenCalledWith("callout");
  });

  it("offers the full callout type list in the More menu", () => {
    const onAction = vi.fn();
    render(<FormatToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    fireEvent.click(screen.getByRole("button", { name: "Callout: warning" }));
    expect(onAction).toHaveBeenCalledWith("callout", "warning");
  });

  it("closes the More menu after an action is chosen", () => {
    render(<FormatToolbar onAction={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryByRole("button", { name: "Footnote" })).not.toBeInTheDocument();
  });
});

describe("entry template inserts", () => {
  it("renders a Templates button in the always-visible row", () => {
    render(<FormatToolbar onAction={() => {}} />);
    expect(screen.getByRole("button", { name: /templates/i })).toBeInTheDocument();
  });

  it("hides template options until Templates is clicked", () => {
    render(<FormatToolbar onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "NPC entry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Location entry" })).not.toBeInTheDocument();
  });

  it("shows all four templates after clicking Templates", () => {
    render(<FormatToolbar onAction={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    expect(screen.getByRole("button", { name: "NPC entry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Location entry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secrets & Clues" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read-aloud box" })).toBeInTheDocument();
  });

  it("fires onAction with template:npc when NPC entry is clicked", () => {
    const onAction = vi.fn();
    render(<FormatToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    fireEvent.click(screen.getByRole("button", { name: "NPC entry" }));
    expect(onAction).toHaveBeenCalledWith("template:npc");
  });

  it("fires onAction with template:readaloud for Read-aloud box", () => {
    const onAction = vi.fn();
    render(<FormatToolbar onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    fireEvent.click(screen.getByRole("button", { name: "Read-aloud box" }));
    expect(onAction).toHaveBeenCalledWith("template:readaloud");
  });

  it("closes the Templates menu after a template is chosen", () => {
    render(<FormatToolbar onAction={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    fireEvent.click(screen.getByRole("button", { name: "NPC entry" }));
    expect(screen.queryByRole("button", { name: "Location entry" })).not.toBeInTheDocument();
  });

  it("opening Templates closes the More menu", () => {
    render(<FormatToolbar onAction={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByRole("button", { name: "Footnote" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    expect(screen.queryByRole("button", { name: "Footnote" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NPC entry" })).toBeInTheDocument();
  });

  it("opening More closes the Templates menu", () => {
    render(<FormatToolbar onAction={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /templates/i }));
    expect(screen.getByRole("button", { name: "NPC entry" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.queryByRole("button", { name: "NPC entry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Footnote" })).toBeInTheDocument();
  });
});
