// src/test/shell/EditorPanelHost.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorPanelHost } from "@/atlas/shell/EditorPanelHost";

beforeEach(() => localStorage.clear());

describe("EditorPanelHost", () => {
  it("renders nothing when no panel is active", () => {
    const { container } = render(
      <EditorPanelHost activeId={null} title="" onDismiss={vi.fn()}>
        <div>X</div>
      </EditorPanelHost>,
    );
    expect(container.querySelector("[data-panel]")).toBeNull();
  });

  it("renders the panel and closes on ✕, Esc, and backdrop click", () => {
    const onDismiss = vi.fn();
    render(
      <EditorPanelHost activeId="pins" title="Pins" onDismiss={onDismiss}>
        <div>Pins panel</div>
      </EditorPanelHost>,
    );
    expect(screen.getByText("Pins panel")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close panel"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("panel-backdrop"));
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it("clamps persisted width to <= 50% of the viewport", () => {
    localStorage.setItem("atlas.panelWidth", "99999");
    render(
      <EditorPanelHost activeId="pins" title="Pins" onDismiss={vi.fn()}>
        <div>P</div>
      </EditorPanelHost>,
    );
    const panel = screen.getByTestId("panel");
    const px = parseInt(panel.style.width, 10);
    expect(px).toBeLessThanOrEqual(Math.floor(window.innerWidth * 0.5));
  });
});
