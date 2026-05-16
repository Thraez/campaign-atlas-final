import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscardConfirmModal } from "@/atlas/session/DiscardConfirmModal";

describe("DiscardConfirmModal", () => {
  it("shows the count and is dismissable without discarding", () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<DiscardConfirmModal open count={12} onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByText(/Discard all 12 unsaved changes\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms on the destructive action", () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<DiscardConfirmModal open count={3} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<DiscardConfirmModal open={false} count={3} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
