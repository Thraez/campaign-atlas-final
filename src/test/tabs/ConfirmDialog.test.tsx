import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ConfirmDialog } from "@/atlas/tabs/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("is closed until the trigger is clicked", () => {
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Delete this?"
        description="This can't be undone."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("clicking the trigger opens the dialog with title and description", () => {
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Delete this?"
        description="This can't be undone."
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete this?")).toBeTruthy();
    expect(within(dialog).getByText("This can't be undone.")).toBeTruthy();
  });

  it("clicking Cancel closes without calling onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Delete this?"
        description="This can't be undone."
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking the confirm action calls onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Delete this?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("pressing Escape dismisses the dialog without calling onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Delete this?"
        description="This can't be undone."
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape", code: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses custom confirm/cancel labels when provided", () => {
    render(
      <ConfirmDialog
        trigger={<button>Open</button>}
        title="Clear all reveals?"
        description="This can't be undone."
        confirmLabel="Clear all"
        cancelLabel="Keep them"
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Clear all" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Keep them" })).toBeTruthy();
  });
});
