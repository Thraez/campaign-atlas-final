import { describe, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";

vi.mock("@/atlas/save/canonicalPlacementSave", () => ({
  readSourceFile: vi.fn(async () => "---\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\nOriginal disk body\n"),
}));
vi.mock("@/atlas/save/localFsSave", () => ({
  hashContent: vi.fn(async () => "h1"),
  saveAtlasPatchToLocalFs: vi.fn(async () => {}),
}));

function EditHost({ sourcePath, show }: { sourcePath: string; show: boolean }) {
  const api = useEntityEditDraft();
  return show ? (
    <EntityEditPanel sourcePath={sourcePath} draftApi={api} onClose={() => {}} onSaved={() => {}} />
  ) : null;
}

function ToggleWrapper({ sourcePath }: { sourcePath: string }) {
  const [show, setShow] = useState(true);
  return (
    <>
      <button onClick={() => setShow((v: boolean) => !v)}>Toggle</button>
      <EditHost sourcePath={sourcePath} show={show} />
    </>
  );
}

describe("entity no-loss invariant (permanent gate)", () => {
  beforeEach(() => cleanup());

  it("draft survives unmount/remount; only clear() empties it", async () => {
    render(<ToggleWrapper sourcePath="p/a.md" />);
    await waitFor(() => screen.getByDisplayValue("Original disk body"));

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "edited-1" } });

    // Leave Edit (unmount) and come back (remount) several times.
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await waitFor(() => screen.getByDisplayValue("edited-1"));

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await waitFor(() => screen.getByDisplayValue("edited-1"));
  });
});
