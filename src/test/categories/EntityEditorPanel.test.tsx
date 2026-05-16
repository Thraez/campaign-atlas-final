// src/test/categories/EntityEditorPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntityEditorPanel } from "@/atlas/categories/EntityEditorPanel";

describe("EntityEditorPanel (create mode)", () => {
  it("shows quick fields; reveals full fields under 'More details'; submits a draft", () => {
    const onCreate = vi.fn();
    render(
      <EntityEditorPanel
        mode="create" category="characters"
        onCreate={onCreate} onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Mire Vale" } });
    expect(screen.queryByText(/relationships/i)).toBeNull();   // hidden by default
    fireEvent.click(screen.getByRole("button", { name: /more details/i }));
    expect(screen.getByText(/relationships/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Mire Vale", category: "characters" }),
    );
  });
});
