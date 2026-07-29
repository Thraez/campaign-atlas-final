import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscardConfirmModal } from "@/atlas/session/DiscardConfirmModal";

describe("DiscardConfirmModal", () => {
  it("shows the count and is dismissable without discarding", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<DiscardConfirmModal open count={12} onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByText(/Discard all 12 unsaved changes\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms on the destructive action", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<DiscardConfirmModal open count={3} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <DiscardConfirmModal open={false} count={3} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DiscardConfirmModal keyboard behavior (N128)", () => {
  it("closes on Escape without discarding", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<DiscardConfirmModal open count={3} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    render(<DiscardConfirmModal open count={3} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable element to the last", () => {
    render(<DiscardConfirmModal open count={3} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
