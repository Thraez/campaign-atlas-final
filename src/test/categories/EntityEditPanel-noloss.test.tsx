import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";

vi.mock("@/atlas/save/canonicalPlacementSave", () => ({
  readSourceFile: vi.fn(async () => "---\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\nDisk body v1\n"),
}));
vi.mock("@/atlas/save/localFsSave", () => ({
  hashContent: vi.fn(async () => "hash-v1"),
  saveAtlasPatchToLocalFs: vi.fn(async () => {}),
}));

/**
 * Wrapper that owns the draftApi and conditionally shows EntityEditPanel.
 * Mirrors the AtlasPlacementEditor production shape: both hook and panel
 * live in the same React tree so state updates from api.load() propagate
 * to the panel on the same render cycle.
 */
function EditHost({
  sourcePath,
  show,
}: {
  sourcePath: string;
  show: boolean;
}) {
  const api = useEntityEditDraft();
  return show ? (
    <EntityEditPanel sourcePath={sourcePath} draftApi={api} onClose={() => {}} onSaved={() => {}} />
  ) : null;
}

/**
 * Controller that lets the test toggle "show" to simulate mount/unmount.
 */
function ToggleWrapper({ sourcePath }: { sourcePath: string }) {
  const [show, setShow] = useState(true);
  return (
    <>
      <button onClick={() => setShow((v: boolean) => !v)}>Toggle</button>
      <EditHost sourcePath={sourcePath} show={show} />
    </>
  );
}

describe("EntityEditPanel no-loss", () => {
  beforeEach(() => cleanup());

  it("does NOT reload from disk when a live draft for the same sourcePath exists", async () => {
    render(<ToggleWrapper sourcePath="content/w/npcs/corven.md" />);

    // First mount: loads from disk.
    await waitFor(() => screen.getByDisplayValue("Disk body v1"));

    // User edits the body in memory.
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Unsaved edit XYZ" } });

    // Leaving Edit unmounts the panel (EntitySurface behaviour) — draft survives in the hook.
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    // Returning to Edit remounts the panel with the SAME sourcePath + draftApi.
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    // BUG TODAY: this shows "Disk body v1" (clobbered). FIXED: shows the unsaved edit.
    await waitFor(() => screen.getByDisplayValue("Unsaved edit XYZ"));
    expect(screen.queryByDisplayValue("Disk body v1")).not.toBeInTheDocument();
  });
});
