import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaveStatus } from "@/atlas/session/SaveStatus";

const base = {
  onSave: vi.fn(), onDiscard: vi.fn(),
  savedAt: null as number | null, failedReason: null as string | null,
};

describe("SaveStatus", () => {
  it("clean → 'All changes saved', no Discard", () => {
    render(<SaveStatus status="clean" unsavedCount={0} {...base} />);
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
  });

  it("unsaved → count text (pluralized) + Save + Discard", () => {
    render(<SaveStatus status="unsaved" unsavedCount={366} {...base} />);
    expect(screen.getByText("366 unsaved changes")).toBeInTheDocument();
    render(<SaveStatus status="unsaved" unsavedCount={1} {...base} />);
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /discard/i }).length).toBeGreaterThan(0);
  });

  it("saving → 'Saving…' and Save disabled", () => {
    render(<SaveStatus status="saving" unsavedCount={3} {...base} />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("saved → 'Saved just now'", () => {
    render(<SaveStatus status="saved" unsavedCount={0} {...base} savedAt={Date.now()} />);
    expect(screen.getByText(/Saved just now/)).toBeInTheDocument();
  });

  it("failed → reason + Retry calls onSave", () => {
    const onSave = vi.fn();
    render(<SaveStatus status="failed" unsavedCount={2} {...base} onSave={onSave} failedReason="disk permission denied" />);
    expect(screen.getByText(/Save failed — disk permission denied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("Save click calls onSave; Discard click calls onDiscard", () => {
    const onSave = vi.fn(); const onDiscard = vi.fn();
    render(<SaveStatus status="unsaved" unsavedCount={5} {...base} onSave={onSave} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(onSave).toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalled();
  });
});
