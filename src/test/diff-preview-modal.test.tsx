/**
 * Tests for src/atlas/save/DiffPreviewModal.tsx
 *
 * Covers the user-facing contract:
 *   - review state renders header, file list, footer buttons
 *   - Cancel calls onClose without saving
 *   - Save to disk calls saveAtlasPatchToLocalFs with exact changes
 *   - success state shows file count + git status hint
 *   - DisallowedPathError surfaces allowlist message
 *   - LocalSaveError surfaces error message + Try again retries
 *   - Save button disabled / loading while save promise is pending
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { FileChange } from "@/atlas/save/localFsSave";

vi.mock("@/atlas/save/localFsSave", async () => {
  const actual = await vi.importActual<typeof import("@/atlas/save/localFsSave")>(
    "@/atlas/save/localFsSave",
  );
  return { ...actual, saveAtlasPatchToLocalFs: vi.fn() };
});

import { DiffPreviewModal } from "@/atlas/save/DiffPreviewModal";
import {
  saveAtlasPatchToLocalFs,
  DisallowedPathError,
  LocalSaveError,
} from "@/atlas/save/localFsSave";

const mockedSave = saveAtlasPatchToLocalFs as unknown as ReturnType<typeof vi.fn>;

const sampleChanges: FileChange[] = [
  {
    path: "content/world/_atlas/placements-patch-m1.yaml",
    content: "a: 1\nb: 2\n",
    kind: "world-yaml",
    baseHash: null,
  },
];

beforeEach(() => {
  mockedSave.mockReset();
});

describe("DiffPreviewModal", () => {
  it("renders header, file list, and both footer buttons", () => {
    render(<DiffPreviewModal open changes={sampleChanges} onClose={() => {}} />);
    expect(screen.getByText(/Review changes — 1 file will be written/)).toBeTruthy();
    expect(screen.getByText("content/world/_atlas/placements-patch-m1.yaml")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save to disk" })).toBeTruthy();
  });

  it("Cancel calls onClose without invoking save", () => {
    const onClose = vi.fn();
    render(<DiffPreviewModal open changes={sampleChanges} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("Save to disk calls saveAtlasPatchToLocalFs with exact changes; success shows file count + git status hint", async () => {
    mockedSave.mockResolvedValue({
      saved: 1,
      paths: ["content/world/_atlas/placements-patch-m1.yaml"],
    });
    render(<DiffPreviewModal open changes={sampleChanges} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
    expect(mockedSave).toHaveBeenCalledWith(sampleChanges, undefined, { rebuild: false });
    expect(screen.getByText("content/world/_atlas/placements-patch-m1.yaml")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("rebuildAfterSave forwards rebuild:true to saveAtlasPatchToLocalFs and surfaces build result", async () => {
    mockedSave.mockResolvedValue({
      saved: 1,
      paths: ["content/world/notes/x.md"],
      build: { ok: true, durationMs: 1234 },
    });
    render(<DiffPreviewModal open changes={sampleChanges} rebuildAfterSave onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
    expect(mockedSave).toHaveBeenCalledWith(sampleChanges, undefined, { rebuild: true });
    expect(screen.getByText(/Atlas rebuilt in 1234 ms/)).toBeTruthy();
  });

  it("onSaved fires after a successful save", async () => {
    mockedSave.mockResolvedValue({
      saved: 1,
      paths: ["content/world/notes/x.md"],
    });
    const onSaved = vi.fn();
    render(<DiffPreviewModal open changes={sampleChanges} onSaved={onSaved} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({
      saved: 1,
      paths: ["content/world/notes/x.md"],
    });
  });

  it("onConfirm fires the moment Save to disk starts (before the write resolves)", async () => {
    // B1: the editor uses onConfirm to mark the session "saving" only when a
    // real write begins — never just because the modal opened.
    let resolveSave: (v: { saved: number; paths: string[] }) => void = () => {};
    mockedSave.mockImplementation(() => new Promise((res) => { resolveSave = res; }));
    const onConfirm = vi.fn();
    render(<DiffPreviewModal open changes={sampleChanges} onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    // Synchronous: onConfirm runs at the top of runSave, before the await.
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave({ saved: 1, paths: [sampleChanges[0].path] }); });
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
  });

  it("onConfirm is NOT called when the user cancels without saving", () => {
    const onConfirm = vi.fn();
    render(<DiffPreviewModal open changes={sampleChanges} onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("onWriteFailed fires with the reason on a real write failure, not on success", async () => {
    // Completes B1: a failed disk write must reach the editor's "Save failed"
    // status, not silently revert to "unsaved".
    const onWriteFailed = vi.fn();
    mockedSave.mockRejectedValueOnce(new LocalSaveError("disk full"));
    const { unmount } = render(
      <DiffPreviewModal open changes={sampleChanges} onWriteFailed={onWriteFailed} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText("Save failed."));
    expect(onWriteFailed).toHaveBeenCalledTimes(1);
    expect(onWriteFailed).toHaveBeenCalledWith("disk full");
    unmount();

    // Success path must NOT call onWriteFailed.
    onWriteFailed.mockClear();
    mockedSave.mockResolvedValueOnce({ saved: 1, paths: [sampleChanges[0].path] });
    render(<DiffPreviewModal open changes={sampleChanges} onWriteFailed={onWriteFailed} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
    expect(onWriteFailed).not.toHaveBeenCalled();
  });

  it("DisallowedPathError renders allowlist message and offending path", async () => {
    mockedSave.mockRejectedValue(new DisallowedPathError("package.json"));
    render(<DiffPreviewModal open changes={sampleChanges} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText("Path not in allowlist."));
    expect(screen.getByText(/not in the source allowlist/)).toBeTruthy();
    expect(screen.getByText("package.json")).toBeTruthy();
    const closeBtns = screen.getAllByRole("button", { name: "Close" });
    // Dialog has a built-in sr-only "Close" — ours is the visible one.
    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("LocalSaveError renders message + Try again retries the save", async () => {
    mockedSave.mockRejectedValueOnce(new LocalSaveError("disk full"));
    render(<DiffPreviewModal open changes={sampleChanges} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to disk" }));
    await waitFor(() => screen.getByText("Save failed."));
    expect(screen.getByText("disk full")).toBeTruthy();
    expect(mockedSave).toHaveBeenCalledTimes(1);
    mockedSave.mockResolvedValueOnce({ saved: 1, paths: [sampleChanges[0].path] });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
    expect(mockedSave).toHaveBeenCalledTimes(2);
  });

  it("Save button is disabled and shows loading while save is pending", async () => {
    let resolveSave: (v: { saved: number; paths: string[]; files: Array<{ path: string; hash: string }> }) => void = () => {};
    mockedSave.mockImplementation(
      () => new Promise((res) => { resolveSave = res; }),
    );
    render(<DiffPreviewModal open changes={sampleChanges} onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: "Save to disk" }) as HTMLButtonElement;
    fireEvent.click(btn);
    const loading = await screen.findByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(loading.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      resolveSave({ saved: 1, paths: [sampleChanges[0].path], files: [{ path: sampleChanges[0].path, hash: "sha256:abc" }] });
    });
    await waitFor(() => screen.getByText(/Wrote 1 file\./));
  });
});